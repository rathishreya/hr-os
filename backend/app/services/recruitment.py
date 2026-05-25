"""Recruitment workflow orchestration — ties AI, embeddings, and scoring to the DB."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from .. import models
from . import embeddings, scoring
from .ai import ai
from .resume_extract import merge_parsed, parse_resume_text


def log(db: Session, action: str, entity: str, entity_id: int | None, detail: dict, actor: str = "system") -> None:
    db.add(models.AuditLog(actor=actor, action=action, entity=entity, entity_id=entity_id, detail=detail))


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
    # Prefer explicit form values, else fall back to parsed values.
    cand = models.Candidate(
        name=name or parsed.get("name", "") or "",
        email=email or parsed.get("email", "") or "",
        phone=phone or parsed.get("phone", "") or "",
        source=source or "direct",
        resume_text=resume_text,
        parsed=parsed,
        ai_summary=parsed.get("summary", ""),
        embedding=embeddings.embed(candidate_text(parsed, resume_text)),
        ai_provider=provider,
        resume_filename=filename or "",
        resume_mime=mime or "",
        resume_file=file_bytes,
    )
    db.add(cand)
    db.flush()
    log(db, "candidate.ingested", "candidate", cand.id, {"provider": provider, "skills": parsed.get("skills", [])})
    return cand


def score_application(db: Session, application: models.Application, weights: dict[str, float] | None = None) -> models.Application:
    hr = application.hiring_request
    cand = application.candidate
    hr_d = hr_to_dict(hr)
    parsed = cand.parsed or {}

    job_vec = embeddings.embed(role_text(hr))
    sim = embeddings.cosine(cand.embedding or [], job_vec)

    ai_result, provider = ai.score_candidate(hr_d, parsed, weights or scoring.DEFAULT_WEIGHTS)
    result = scoring.finalize(ai_result, hr_d, parsed, sim, weights)

    application.score_overall = result["overall"]
    application.score_dimensions = result["dimensions"]
    application.score_rationale = result["rationale"]
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


def apply_candidate(db: Session, candidate: models.Candidate, hr: models.HiringRequest, *, auto_score: bool = True) -> models.Application:
    app = models.Application(candidate_id=candidate.id, hiring_request_id=hr.id, stage="applied")
    db.add(app)
    db.flush()
    log(db, "application.created", "application", app.id, {"candidate_id": candidate.id, "hiring_request_id": hr.id})
    if auto_score:
        score_application(db, app)
    return app
