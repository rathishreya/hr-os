"""Candidate ingestion (JSON + file upload), parsing, and applying to a role."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services import recruitment, resume_extract, resume_parser
from ..services.ai import ai

router = APIRouter(prefix="/api/candidates", tags=["candidates"])


def _maybe_apply(db: Session, cand: models.Candidate, hiring_request_id: int | None) -> None:
    if hiring_request_id:
        hr = db.get(models.HiringRequest, hiring_request_id)
        if not hr:
            raise HTTPException(404, "Hiring request not found")
        recruitment.apply_candidate(db, cand, hr, auto_score=True)


@router.post("", response_model=schemas.CandidateOut)
def create_candidate(payload: schemas.CandidateCreate, db: Session = Depends(get_db)):
    cand = recruitment.ingest_candidate(
        db,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        source=payload.source,
        resume_text=payload.resume_text,
    )
    _maybe_apply(db, cand, payload.hiring_request_id)
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
):
    content = file.file.read()
    text = resume_parser.extract_text(file.filename or "", content)
    if not text.strip():
        raise HTTPException(422, "Could not extract text from the uploaded file.")
    cand = recruitment.ingest_candidate(
        db,
        name=name, email=email, phone=phone, source=source, resume_text=text,
        file_bytes=content, filename=file.filename or "", mime=file.content_type or "",
    )
    _maybe_apply(db, cand, hiring_request_id)
    db.commit()
    db.refresh(cand)
    return cand


@router.post("/reparse-all")
def reparse_all_candidates(db: Session = Depends(get_db)):
    """Re-extract parsed fields from every candidate's resume_text (updates talent pool columns)."""
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
def list_candidates(q: str = "", table: bool = False, db: Session = Depends(get_db)):
    rows = db.scalars(select(models.Candidate).order_by(models.Candidate.created_at.desc())).all()
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
    if not table:
        return [schemas.CandidateOut.model_validate(c) for c in rows]
    out = []
    for c in rows:
        apps = db.scalars(
            select(models.Application)
            .where(models.Application.candidate_id == c.id)
            .order_by(models.Application.created_at.desc())
        ).all()
        stages = [a.stage for a in apps]
        active = [s for s in stages if s not in ("hired", "rejected")]
        parsed = resume_extract.enrich_from_resume(
            c.parsed, c.resume_text, name=c.name, email=c.email, phone=c.phone, source=c.source,
        )
        out.append({
            **schemas.CandidateOut.model_validate(c).model_dump(),
            "application_count": len(apps),
            "active_applications": len(active),
            "latest_stage": apps[0].stage if apps else "",
            "top_score": max((a.score_overall for a in apps), default=0),
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
def apply_to_role(cand_id: int, body: schemas.ApplyToRoleRequest, db: Session = Depends(get_db)):
    cand = db.get(models.Candidate, cand_id)
    if not cand:
        raise HTTPException(404, "Candidate not found")
    hr = db.get(models.HiringRequest, body.hiring_request_id)
    if not hr:
        raise HTTPException(404, "Hiring request not found")
    app = recruitment.apply_candidate(db, cand, hr, auto_score=True)
    db.commit()
    db.refresh(app)
    return app
