"""Candidate ingestion (JSON + file upload), parsing, and applying to a role."""
from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import current_user, require_roles
from ..services import recruitment, resume_extract, resume_parser
from ..services.ai import ai

router = APIRouter(prefix="/api/candidates", tags=["candidates"])

_MAX_RESUME_BYTES = 25 * 1024 * 1024  # 25 MB — guard the free-tier instance from OOM


def _actor_label(user: models.User | None) -> str:
    return (user.name or user.email) if user else ""


# Extensions the app can actually turn into text. Legacy binary .doc has no extractor, so it's
# rejected explicitly rather than silently text-decoded into garbage (which then 422s as "no text").
_SUPPORTED_RESUME_EXTS = (".pdf", ".docx", ".txt")


def _resume_extract_error(filename: str) -> str | None:
    """Return a precise, actionable error for an upload that won't extract — or None if the
    file type is fine. Distinguishes (a) an unsupported type from (b) a PDF/DOCX whose optional
    extractor library isn't installed on this instance (the usual cause of "upload not working":
    requirements-prod.txt has pdfplumber/python-docx but the plain requirements.txt does not)."""
    name = (filename or "").lower()
    if name.endswith(".doc") and not name.endswith(".docx"):
        return ("Legacy .doc files aren't supported. Please re-save the resume as PDF or DOCX "
                "(or paste the resume text instead).")
    if not name.endswith(_SUPPORTED_RESUME_EXTS):
        return ("Unsupported file type. Upload a PDF, DOCX, or TXT file "
                "(or paste the resume text instead).")
    if name.endswith(".pdf"):
        try:
            import pdfplumber  # noqa: F401
        except Exception:
            return ("PDF text extraction isn't available on this server (the 'pdfplumber' library "
                    "is not installed). Paste the resume text, upload a TXT, or install "
                    "requirements-optional.txt / requirements-prod.txt.")
    if name.endswith(".docx"):
        try:
            import docx  # noqa: F401
        except Exception:
            return ("DOCX text extraction isn't available on this server (the 'python-docx' library "
                    "is not installed). Paste the resume text, upload a TXT, or install "
                    "requirements-optional.txt / requirements-prod.txt.")
    return None


def _maybe_apply(db: Session, cand: models.Candidate, hiring_request_id: int | None, applied_by: str = "") -> None:
    if hiring_request_id:
        hr = db.get(models.HiringRequest, hiring_request_id)
        if not hr:
            raise HTTPException(404, "Hiring request not found")
        recruitment.apply_candidate(db, cand, hr, auto_score=True, applied_by=applied_by)


@router.post("", response_model=schemas.CandidateOut)
def create_candidate(payload: schemas.CandidateCreate, db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    cand = recruitment.ingest_candidate(
        db,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        source=payload.source,
        resume_text=payload.resume_text,
    )
    _maybe_apply(db, cand, payload.hiring_request_id, applied_by=_actor_label(user))
    db.commit()
    db.refresh(cand)
    return cand


@router.post("/upload", response_model=schemas.CandidateOut)
def upload_candidate(
    file: UploadFile = File(...),
    name: str = Form(""),
    email: str = Form(""),
    phone: str = Form(""),
    source: str = Form("upload"),
    hiring_request_id: int | None = Form(None),
    db: Session = Depends(get_db),
    user: models.User = Depends(current_user),
):
    content = file.file.read(_MAX_RESUME_BYTES + 1)
    if len(content) > _MAX_RESUME_BYTES:
        raise HTTPException(413, "Resume file is too large (max 25 MB).")
    # Reject unsupported types / surface a missing-extractor situation with a clear message
    # BEFORE attempting extraction (so a real PDF/DOCX never silently text-decodes to garbage).
    type_error = _resume_extract_error(file.filename or "")
    if type_error:
        raise HTTPException(422, type_error)
    text = resume_parser.extract_text(file.filename or "", content)
    if not text.strip():
        raise HTTPException(
            422,
            "No text could be read from this file. If it's a scanned or image-only PDF, "
            "paste the resume text instead — OCR isn't supported.",
        )
    cand = recruitment.ingest_candidate(
        db,
        name=name, email=email, phone=phone, source=source, resume_text=text,
        file_bytes=content, filename=file.filename or "", mime=file.content_type or "",
    )
    _maybe_apply(db, cand, hiring_request_id, applied_by=_actor_label(user))
    db.commit()
    db.refresh(cand)
    return cand


@router.post("/reparse-all")
def reparse_all_candidates(db: Session = Depends(get_db), _user: models.User = Depends(require_roles("admin", "manager"))):
    """Re-extract parsed fields from every candidate's resume_text (updates talent pool columns).
    Admin/manager only — it re-runs AI parsing across the whole pool (a costly bulk operation)."""
    rows = db.scalars(select(models.Candidate)).all()
    updated = 0
    for c in rows:
        if not (c.resume_text or "").strip():
            continue
        parsed_ai, _ = ai.parse_resume(c.resume_text)
        merged = resume_extract.merge_parsed(
            parsed_ai,
            resume_extract.parse_resume_text(c.resume_text, fallback_name=c.name, fallback_source=c.source),
        )
        c.parsed = merged
        if merged.get("summary"):
            c.ai_summary = merged["summary"]
        if not c.name and merged.get("name"):
            c.name = merged["name"]
        if not c.email and merged.get("email"):
            c.email = merged["email"]
        if not c.phone and merged.get("phone"):
            c.phone = merged["phone"]
        updated += 1
    db.commit()
    return {"updated": updated, "total": len(rows)}


@router.get("/{cand_id}/resume-file")
def resume_file(cand_id: int, db: Session = Depends(get_db)):
    """Serve the original uploaded resume file inline (for in-app preview)."""
    cand = db.get(models.Candidate, cand_id)
    if not cand:
        raise HTTPException(404, "Candidate not found")
    if not cand.resume_file:
        raise HTTPException(404, "No original file on record (this candidate was added as text).")
    filename = cand.resume_filename or "resume"
    return Response(
        content=cand.resume_file,
        media_type=cand.resume_mime or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("")
def list_candidates(q: str = "", table: bool = False, limit: int = 500, db: Session = Depends(get_db)):
    # Hard-cap the rows pulled into memory so a large talent pool can't OOM the instance.
    # (A true full-text search belongs in SQL for very large pools — see PROD-READINESS.md.)
    limit = max(1, min(limit, 1000))
    rows = db.scalars(
        select(models.Candidate).order_by(models.Candidate.created_at.desc()).limit(2000)
    ).all()
    if q.strip():
        needle = q.strip().lower()
        rows = [
            c for c in rows
            if needle in " ".join([
                c.name or "", c.email or "", c.phone or "", c.source or "",
                c.ai_summary or "", c.resume_text or "",
                " ".join((c.parsed or {}).get("skills") or []),
                (c.parsed or {}).get("location") or "",
                (c.parsed or {}).get("current_company") or "",
                (c.parsed or {}).get("current_title") or "",
                " ".join(
                    f"{e.get('degree', '')} {e.get('institution', '')}"
                    for e in ((c.parsed or {}).get("education") or [])
                ),
            ]).lower()
        ]
    rows = rows[:limit]
    if not table:
        return [schemas.CandidateOut.model_validate(c) for c in rows]
    # Embed every role once so the "suggested role" column is one batch, not N×roles calls.
    role_vecs = recruitment.build_role_vectors(db)
    pos_by_hr = {hr.id: hr.position for hr in db.scalars(select(models.HiringRequest)).all()}
    _stage_rank = {"applied": 1, "screening": 2, "shortlisted": 3, "interview": 4, "offer": 5, "hired": 6}
    # One query for all candidates' applications instead of one-per-candidate (N+1).
    cand_ids = [c.id for c in rows]
    apps_by_cand: dict[int, list] = defaultdict(list)
    for a in db.scalars(
        select(models.Application)
        .where(models.Application.candidate_id.in_(cand_ids))
        .order_by(models.Application.created_at.desc())
    ):
        apps_by_cand[a.candidate_id].append(a)
    out = []
    for c in rows:
        apps = apps_by_cand.get(c.id, [])
        stages = [a.stage for a in apps]
        active = [s for s in stages if s not in ("hired", "rejected")]
        # "Primary" application = most-advanced (active preferred), tie-broken by score — so the
        # Pipeline column's stage + score + role all describe ONE application, never a mix.
        primary = None
        if apps:
            pool = [a for a in apps if a.stage != "rejected"] or apps
            primary = max(pool, key=lambda a: (_stage_rank.get(a.stage, 0), a.score_overall or 0))
        # Use the already-stored parsed résumé; only parse on the fly if it's missing (avoids
        # re-parsing every résumé on every talent-pool load).
        parsed = c.parsed or (
            resume_extract.parse_resume_text(
                c.resume_text or "", fallback_name=c.name or "", fallback_source=c.source or "")
            if (c.resume_text or "").strip() else {}
        )
        best = recruitment.suggest_roles_for(c, role_vecs, limit=1)
        suggestion = best[0] if best else None
        out.append({
            **schemas.CandidateOut.model_validate(c).model_dump(),
            "application_count": len(apps),
            "active_applications": len(active),
            "latest_stage": apps[0].stage if apps else "",
            "top_score": max((a.score_overall for a in apps), default=0),
            "primary_stage": primary.stage if primary else "",
            "primary_role": pos_by_hr.get(primary.hiring_request_id, "") if primary else "",
            "primary_score": round((primary.score_overall or 0), 1) if primary else 0,
            "applied_by": primary.applied_by if primary else "",
            "sub_source": ((primary.applied_by if primary else "") or c.source or ""),
            "suggested_role": suggestion["position"] if suggestion else "",
            "suggested_role_id": suggestion["hiring_request_id"] if suggestion else None,
            "suggested_role_score": suggestion["score"] if suggestion else None,
            **resume_extract.table_fields(parsed, c),
        })
    return out


@router.get("/{cand_id}/profile")
def candidate_profile(cand_id: int, db: Session = Depends(get_db)):
    cand = db.get(models.Candidate, cand_id)
    if not cand:
        raise HTTPException(404, "Candidate not found")
    apps = db.scalars(
        select(models.Application).where(models.Application.candidate_id == cand_id).order_by(models.Application.created_at.desc())
    ).all()
    history = []
    for app in apps:
        hr = db.get(models.HiringRequest, app.hiring_request_id)
        history.append({
            "application_id": app.id,
            "hiring_request_id": app.hiring_request_id,
            "position": hr.position if hr else "",
            "department": hr.department if hr else "",
            "stage": app.stage,
            "score_overall": app.score_overall,
            "recommendation": app.recommendation,
            "notes": app.notes or "",
            "created_at": app.created_at,
        })
    parsed = resume_extract.enrich_from_resume(
        cand.parsed, cand.resume_text, name=cand.name, email=cand.email, phone=cand.phone, source=cand.source,
    )
    cand_out = schemas.CandidateOut.model_validate(cand).model_dump()
    cand_out["parsed"] = parsed
    return {"candidate": cand_out, "applications": history}


@router.get("/{cand_id}", response_model=schemas.CandidateOut)
def get_candidate(cand_id: int, db: Session = Depends(get_db)):
    cand = db.get(models.Candidate, cand_id)
    if not cand:
        raise HTTPException(404, "Candidate not found")
    return cand


@router.post("/{cand_id}/apply", response_model=schemas.ApplicationOut)
def apply_to_role(cand_id: int, body: schemas.ApplyToRoleRequest, db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    cand = db.get(models.Candidate, cand_id)
    if not cand:
        raise HTTPException(404, "Candidate not found")
    hr = db.get(models.HiringRequest, body.hiring_request_id)
    if not hr:
        raise HTTPException(404, "Hiring request not found")
    app = recruitment.apply_candidate(db, cand, hr, auto_score=True, applied_by=_actor_label(user))
    db.commit()
    db.refresh(app)
    return app


@router.delete("/{cand_id}", status_code=204)
def delete_candidate(cand_id: int, db: Session = Depends(get_db), _user: models.User = Depends(require_roles("admin", "manager"))):
    """Erase a candidate and ALL their data (GDPR/CCPA 'right to be forgotten').
    Removes applications, interviews, recordings, documents and the comms trail."""
    cand = db.get(models.Candidate, cand_id)
    if not cand:
        raise HTTPException(404, "Candidate not found")

    app_ids = list(db.scalars(select(models.Application.id).where(models.Application.candidate_id == cand_id)).all())
    vi_ids = list(db.scalars(select(models.VideoInterview.id).where(models.VideoInterview.candidate_id == cand_id)).all())

    if vi_ids:
        db.execute(delete(models.VideoAnswer).where(models.VideoAnswer.interview_id.in_(vi_ids)))
    db.execute(delete(models.VideoInterview).where(models.VideoInterview.candidate_id == cand_id))
    db.execute(delete(models.ScreeningInterview).where(models.ScreeningInterview.candidate_id == cand_id))
    db.execute(delete(models.OnboardingPlan).where(models.OnboardingPlan.candidate_id == cand_id))
    db.execute(delete(models.Document).where(models.Document.candidate_id == cand_id))
    db.execute(delete(models.EmailMessage).where(models.EmailMessage.candidate_id == cand_id))
    if app_ids:
        db.execute(delete(models.InterviewRound).where(models.InterviewRound.application_id.in_(app_ids)))
    db.execute(delete(models.Application).where(models.Application.candidate_id == cand_id))
    db.delete(cand)
    recruitment.log(db, "candidate.deleted", "candidate", cand_id, {"applications": len(app_ids)})
    db.commit()
