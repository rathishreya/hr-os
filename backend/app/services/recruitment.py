"""Recruitment workflow orchestration — ties AI, embeddings, and scoring to the DB."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from . import embeddings, scoring, skill_normalize
from .ai import ai
from .resume_extract import merge_parsed, parse_resume_text


def log(db: Session, action: str, entity: str, entity_id: int | None, detail: dict, actor: str = "system") -> None:
    db.add(models.AuditLog(actor=actor, action=action, entity=entity, entity_id=entity_id, detail=detail))


def to_rating(x: Any) -> int:
    """Coerce a model-supplied rating to a 0-100 int; bad/non-numeric values become 0."""
    try:
        return max(0, min(100, int(round(float(x)))))
    except (TypeError, ValueError):
        return 0


def str_list(v: Any, cap: int = 8) -> list[str]:
    """Coerce a 'list of phrases' field that a model may return as a list, a bare string, or
    something odd into a clean list of strings — never crashes, never char-splits a string."""
    if isinstance(v, str):
        return [v] if v.strip() else []
    if isinstance(v, (list, tuple)):
        return [str(x) for x in v if x][:cap]
    return []


def hr_to_dict(hr: models.HiringRequest) -> dict[str, Any]:
    return {
        "position": hr.position,
        "department": hr.department,
        "budget_ctc": hr.budget_ctc,
        "yoe_min": hr.yoe_min,
        "yoe_max": hr.yoe_max,
        "mandatory_skills": hr.mandatory_skills or [],
        "preferred_skills": hr.preferred_skills or [],
        "priority": hr.priority,
        "hiring_deadline": hr.hiring_deadline,
        "location": hr.location,
        "work_mode": hr.work_mode,
        "num_openings": hr.num_openings,
        # Recruiter's 100–200 word brief — the JD prompt treats this as primary context.
        "role_brief": hr.role_brief or "",
        "team": hr.team or "",
        "hire_type": hr.hire_type or "",
    }


def role_text(hr: models.HiringRequest) -> str:
    parts = [hr.position, hr.department, hr.location, hr.work_mode]
    parts += hr.mandatory_skills or []
    parts += hr.preferred_skills or []
    if hr.job and hr.job.description:
        parts.append(hr.job.description)
    return " ".join(str(p) for p in parts if p)


def candidate_text(parsed: dict[str, Any], resume_text: str) -> str:
    skills = " ".join(parsed.get("skills", []))
    return f"{skills}\n{resume_text}"


def build_role_vectors(db: Session) -> list[tuple[models.HiringRequest, list[float]]]:
    """Embed every role once (so a batch of candidates can be matched without re-embedding).

    Roles with no signal (empty text) are skipped. Computed per-request; cheap with the
    hash fallback embedder and fine at this scale for Ollama too.
    """
    roles = db.scalars(select(models.HiringRequest)).all()
    out: list[tuple[models.HiringRequest, list[float]]] = []
    for hr in roles:
        txt = role_text(hr)
        if txt.strip():
            out.append((hr, embeddings.embed(txt)))
    return out


def suggest_roles_for(
    candidate: models.Candidate,
    role_vecs: list[tuple[models.HiringRequest, list[float]]],
    *,
    limit: int = 1,
    exclude_hr_id: int | None = None,
) -> list[dict[str, Any]]:
    """Best-fit roles for a candidate (suggestion only).

    Ranks mostly by concrete SKILL overlap (with a resume-text fallback) and uses embedding
    similarity as a secondary signal. Skill overlap is what stops a QA resume from being
    suggested a frontend role just because the default hash embedder is noisy.
    """
    if not role_vecs:
        return []
    emb = candidate.embedding or []
    parsed = candidate.parsed or {}
    cand_skills = list(parsed.get("skills", []) or [])
    resume_text = candidate.resume_text or ""

    scored: list[tuple[float, models.HiringRequest]] = []
    for hr, vec in role_vecs:
        if exclude_hr_id is not None and hr.id == exclude_hr_id:
            continue
        sim = embeddings.cosine(emb, vec) if emb else 0.0
        mand = hr.mandatory_skills or []
        pref = hr.preferred_skills or []
        skill_score = 0.0
        if mand or pref:
            # Keyword/curated only here — running per-skill embeddings for every candidate × every
            # role (talent-pool suggestions) would be far too many hosted-embedding calls.
            rep = skill_normalize.match_report(cand_skills, mand, pref, extra_text=resume_text, allow_semantic=False)
            n_req = len(rep["mandatory_canon"]) or len(rep["preferred_canon"])
            n_hit = len(rep["matched_canon"]) + len(rep["matched_pref_canon"])
            skill_score = min(1.0, n_hit / n_req) if n_req else 0.0  # preferred can exceed n_req
        # Skill overlap dominates; embedding similarity breaks ties / fills skill-less roles.
        blended = 0.65 * skill_score + 0.35 * sim
        scored.append((blended, hr))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [
        {
            "hiring_request_id": hr.id,
            "position": hr.position,
            "department": hr.department or "",
            "score": round(sim * 100),
        }
        for sim, hr in scored[:limit]
    ]


def ingest_candidate(
    db: Session,
    *,
    name: str,
    email: str,
    phone: str,
    source: str,
    resume_text: str,
    file_bytes: bytes | None = None,
    filename: str = "",
    mime: str = "",
) -> models.Candidate:
    """Parse + summarize + embed a resume, persist a Candidate.

    If the original uploaded file is provided, it's stored verbatim for true preview.
    """
    heur = parse_resume_text(resume_text, fallback_name=name, fallback_source=source) if resume_text.strip() else {}
    parsed_ai, provider = ai.parse_resume(resume_text) if resume_text.strip() else ({}, "mock")
    parsed = merge_parsed(parsed_ai, heur)
    final_email = (email or parsed.get("email", "") or "").strip()
    final_name = name or parsed.get("name", "") or ""
    final_phone = phone or parsed.get("phone", "") or ""
    embedding = embeddings.embed(candidate_text(parsed, resume_text))

    # ONE candidate + ONE resume per email: if this email already exists, update that record
    # in place (latest resume wins) instead of creating a duplicate row.
    existing = None
    if final_email:
        existing = db.scalar(
            select(models.Candidate).where(func.lower(models.Candidate.email) == final_email.lower())
        )
    if existing:
        if final_name:
            existing.name = final_name
        if final_phone:
            existing.phone = final_phone
        if not (existing.source or "").strip():
            existing.source = source or "direct"  # keep first-touch source if already set
        if resume_text.strip():
            existing.resume_text = resume_text
            existing.parsed = parsed
            existing.ai_summary = parsed.get("summary", "") or existing.ai_summary
            existing.embedding = embedding
            existing.ai_provider = provider
        if file_bytes:  # replace stored file only when a new one is uploaded
            existing.resume_filename = filename or existing.resume_filename
            existing.resume_mime = mime or existing.resume_mime
            existing.resume_file = file_bytes
        db.flush()
        log(db, "candidate.updated", "candidate", existing.id,
            {"provider": provider, "skills": parsed.get("skills", []), "dedup_email": final_email})
        return existing

    cand = models.Candidate(
        name=final_name,
        email=final_email,
        phone=final_phone,
        source=source or "direct",
        resume_text=resume_text,
        parsed=parsed,
        ai_summary=parsed.get("summary", ""),
        embedding=embedding,
        ai_provider=provider,
        resume_filename=filename or "",
        resume_mime=mime or "",
        resume_file=file_bytes,
    )
    db.add(cand)
    db.flush()
    log(db, "candidate.ingested", "candidate", cand.id, {"provider": provider, "skills": parsed.get("skills", [])})
    return cand


def score_application(
    db: Session,
    application: models.Application,
    weights: dict[str, float] | None = None,
    *,
    reuse_ai: bool = False,
    role_vec: list[float] | None = None,
) -> models.Application:
    hr = application.hiring_request
    cand = application.candidate
    hr_d = hr_to_dict(hr)
    parsed = cand.parsed or {}

    # Accept a precomputed role embedding (bulk re-score reuses one vector per role instead of
    # re-embedding the same role for every candidate).
    job_vec = role_vec if role_vec is not None else embeddings.embed(role_text(hr))
    sim = embeddings.cosine(cand.embedding or [], job_vec)

    # reuse_ai: re-derive the DETERMINISTIC parts (skill/experience matching) with the current
    # matcher while keeping the AI's previously-computed soft dimensions — so a bulk re-score is
    # instant and makes no new LLM calls. Falls back to a full AI score if never scored before.
    if reuse_ai and application.scored_at and (application.score_dimensions or {}):
        prev = application.score_dimensions or {}
        bd = application.score_breakdown or {}
        ai_result = {
            "dimensions": prev,
            "rationale": bd.get("summary") or application.score_rationale or "",
            "strengths": bd.get("strengths"),
            "concerns": bd.get("concerns"),
        }
        provider = "deterministic"
    else:
        ai_result, provider = ai.score_candidate(hr_d, parsed, weights or scoring.DEFAULT_WEIGHTS)
    # Give the scorer the raw resume text too (resume-text skill fallback) without persisting it.
    result = scoring.finalize(ai_result, hr_d, {**parsed, "_resume_text": cand.resume_text or ""}, sim, weights)

    application.score_overall = result["overall"]
    application.score_dimensions = result["dimensions"]
    application.score_rationale = result["rationale"]
    application.score_breakdown = result["breakdown"]
    application.recommendation = result["recommendation"]
    application.fit_label = result["fit_label"]
    application.scored_at = datetime.now(timezone.utc)

    log(
        db,
        "application.scored",
        "application",
        application.id,
        {
            "provider": provider,
            "overall": result["overall"],
            "recommendation": result["recommendation"],
            "matched_skills": result["matched_skills"],
            "missing_skills": result["missing_skills"],
        },
    )
    return application


def apply_candidate(
    db: Session,
    candidate: models.Candidate,
    hr: models.HiringRequest,
    *,
    auto_score: bool = True,
    applied_by: str = "",
) -> models.Application:
    # One application per candidate per opening — re-applying returns the existing one instead
    # of creating a duplicate (the "same user can apply multiple times" guard).
    existing = db.scalar(
        select(models.Application).where(
            models.Application.candidate_id == candidate.id,
            models.Application.hiring_request_id == hr.id,
        )
    )
    if existing:
        return existing
    app = models.Application(
        candidate_id=candidate.id, hiring_request_id=hr.id, stage="applied",
        applied_by=applied_by or "",
    )
    db.add(app)
    db.flush()
    log(db, "application.created", "application", app.id,
        {"candidate_id": candidate.id, "hiring_request_id": hr.id, "applied_by": applied_by})
    if auto_score:
        score_application(db, app)
    return app
