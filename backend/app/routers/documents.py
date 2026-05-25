"""Offer letters & contracts — AI drafts that a human must approve before issuing."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..services.ai import ai
from ..services.recruitment import log

router = APIRouter(prefix="/api/documents", tags=["documents"])

DOC_TYPES = {"offer_letter", "employment_agreement", "nda", "contractor_agreement"}


def _context(app: models.Application, terms: dict) -> dict:
    cand = app.candidate
    hr = app.hiring_request
    return {
        "candidate_name": cand.name or "the candidate",
        "company": settings.COMPANY_NAME,
        "position": hr.position,
        "department": hr.department,
        "location": terms.get("location") or hr.location,
        "work_mode": hr.work_mode,
        **{k: v for k, v in (terms or {}).items() if v},
    }


@router.post("/generate", response_model=schemas.DocumentOut)
def generate(req: schemas.GenerateDocumentRequest, db: Session = Depends(get_db)):
    if req.doc_type not in DOC_TYPES:
        raise HTTPException(422, f"doc_type must be one of {sorted(DOC_TYPES)}")
    app = db.get(models.Application, req.application_id)
    if not app:
        raise HTTPException(404, "Application not found")

    result, provider = ai.generate_document(req.doc_type, _context(app, req.terms or {}))
    doc = models.Document(
        application_id=app.id,
        candidate_id=app.candidate_id,
        doc_type=req.doc_type,
        title=result.get("title", req.doc_type.replace("_", " ").title()),
        content=result.get("content", ""),
        terms=req.terms or {},
        status="draft",
        ai_provider=provider,
    )
    db.add(doc)
    db.flush()
    log(db, "document.generated", "document", doc.id, {"provider": provider, "doc_type": req.doc_type, "application_id": app.id})
    db.commit()
    db.refresh(doc)
    return doc


@router.post("/{doc_id}/approve", response_model=schemas.DocumentOut)
def approve(doc_id: int, body: schemas.ApproveDocumentRequest, db: Session = Depends(get_db)):
    doc = db.get(models.Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    doc.status = "approved"
    doc.approved_by = body.by
    doc.approved_at = datetime.now(timezone.utc)
    log(db, "document.approved", "document", doc.id, {"by": body.by, "doc_type": doc.doc_type}, actor=body.by)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("", response_model=list[schemas.DocumentOut])
def list_documents(application_id: int | None = None, candidate_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(models.Document).order_by(models.Document.created_at.desc())
    if application_id:
        stmt = stmt.where(models.Document.application_id == application_id)
    if candidate_id:
        stmt = stmt.where(models.Document.candidate_id == candidate_id)
    return db.scalars(stmt).all()


@router.get("/{doc_id}", response_model=schemas.DocumentOut)
def get_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.get(models.Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc
