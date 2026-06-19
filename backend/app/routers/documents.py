"""Offer letters & contracts — AI drafts that a human must approve before issuing."""
from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..services import onboarding_template
from ..services.ai import ai
from ..services.documents import TEMPLATES, list_templates, render_document
from ..services.documents.render import DOC_TYPE_TEMPLATE
from ..services.recruitment import log

router = APIRouter(prefix="/api/documents", tags=["documents"])

_MAX_DOC_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB cap on uploaded signed PDFs


def _ensure_onboarding_plan(db: Session, application_id: int) -> None:
    """Create the EZ Lab onboarding tracker for an application (once). Called when HR marks a
    document 'move to onboarding' — this is the only path a candidate enters Onboarding."""
    exists = db.scalar(
        select(models.OnboardingPlan.id).where(models.OnboardingPlan.application_id == application_id).limit(1)
    )
    if exists:
        return
    app = db.get(models.Application, application_id)
    if not app:
        return
    hr = app.hiring_request
    cand = app.candidate
    details = {
        "entity": "EZ", "status": "Onboarding",
        "compensation": (hr.budget_ctc if hr else "") or "",
        "location": (hr.location if hr else "") or "",
        "department": (hr.department if hr else "") or "",
        "email": (cand.email if cand else "") or "",
        "contact": (cand.phone if cand else "") or "",
        "joining_date": "", "reporting_manager": "", "approving_manager": "",
    }
    db.add(models.OnboardingPlan(
        application_id=app.id, candidate_id=app.candidate_id,
        role_position=hr.position if hr else "",
        tasks=onboarding_template.build_tasks(), induction=[], tools=[], buddy="",
        details=details, ai_provider="template",
    ))

# Template-backed types render the EZ Lab letters/contracts/NDA deterministically; the rest
# fall back to the AI/mock free-text generator.
AI_DOC_TYPES = {"employment_agreement", "contractor_agreement"}
DOC_TYPES = set(DOC_TYPE_TEMPLATE) | AI_DOC_TYPES

# Allowed legal entities for the inline Entity edit (mirrors render.ENTITIES / the generate form).
_ENTITY_CHOICES = {"EZ", "AEZ"}


class DocumentFieldsRequest(BaseModel):
    """Lightweight inline edits to the offer-administration fields shown in the docs list.
    personal_email is stored on the document column; joining_date (terms['start_date']) and
    entity (terms['entity']) are persisted into the document's terms dict WITHOUT re-rendering
    the legal text. All fields are optional — only the keys provided are updated.
    """

    personal_email: str | None = None
    joining_date: str | None = None
    entity: str | None = None


def _context(app: models.Application, terms: dict) -> dict:
    """Free-text context for the legacy AI document path (nda / contractor / employment_agreement)."""
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


def _autofill(app: models.Application) -> dict:
    """Everything we can fill from existing candidate + role data; HR overrides the rest via terms."""
    cand = app.candidate
    hr = app.hiring_request
    job = hr.job if hr else None
    return {
        "name": (cand.name if cand else "") or "",
        "email": (cand.email if cand else "") or "",
        "contact": (cand.phone if cand else "") or "",
        "designation": hr.position if hr else "",
        "department": hr.department if hr else "",
        "location": hr.location if hr else "",
        "annual_ctc": hr.budget_ctc if hr else "",  # display + parsed into the comp table
        "responsibilities": (list(job.responsibilities) if job and job.responsibilities else None),
        "entity": "EZ",
        "company": settings.COMPANY_NAME,
    }


def template_context(app: models.Application, terms: dict) -> dict:
    """Raw context for an EZ Lab template: autofill from candidate + role, then HR-entered `terms`
    override anything truthy."""
    ctx = _autofill(app)
    ctx.update({k: v for k, v in (terms or {}).items() if v not in (None, "", [])})
    return ctx


# Document.terms key -> the display field shown in the Offer & Docs table.
def _enrich_doc(db: Session, d: models.Document) -> None:
    cand = db.get(models.Candidate, d.candidate_id)
    app = db.get(models.Application, d.application_id) if d.application_id else None
    hr = app.hiring_request if app else None
    t = d.terms or {}
    d.candidate_name = t.get("name") or (cand.name if cand else "")
    d.email = t.get("email") or (cand.email if cand else "")
    d.contact = t.get("contact") or (cand.phone if cand else "")
    d.position = t.get("designation") or (hr.position if hr else "")
    d.department = t.get("department") or (hr.department if hr else "")
    d.compensation = str(t.get("annual_ctc") or (hr.budget_ctc if hr else "") or "")
    d.location = t.get("location") or (hr.location if hr else "")
    d.joining_date = t.get("start_date") or ""
    d.entity = t.get("entity") or "EZ"
    d.reporting_manager = t.get("manager") or ""
    d.approving_manager = t.get("approving_manager") or ""
    d.has_upload = bool(d.upload_file)
    # personal_email is a real column on the model; DocumentOut reads it directly.


@router.get("/templates", response_model=list[schemas.DocumentTemplateOut])
def get_templates():
    return list_templates()


@router.post("/generate", response_model=schemas.DocumentOut)
def generate(req: schemas.GenerateDocumentRequest, db: Session = Depends(get_db)):
    if req.doc_type not in DOC_TYPES:
        raise HTTPException(422, f"doc_type must be one of {sorted(DOC_TYPES)}")
    app = db.get(models.Application, req.application_id)
    if not app:
        raise HTTPException(404, "Application not found")

    template_key = req.template_key or DOC_TYPE_TEMPLATE.get(req.doc_type, "")
    if template_key in TEMPLATES:
        rendered = render_document(template_key, template_context(app, req.terms or {}))
        doc = models.Document(
            application_id=app.id, candidate_id=app.candidate_id,
            doc_type=rendered["doc_type"], template_key=template_key,
            title=rendered["title"], content=rendered["content"], blocks=rendered["blocks"],
            terms=req.terms or {}, status="draft", ai_provider="template",
        )
        provider = "template"
    else:
        result, provider = ai.generate_document(req.doc_type, _context(app, req.terms or {}))
        doc = models.Document(
            application_id=app.id, candidate_id=app.candidate_id, doc_type=req.doc_type,
            title=result.get("title", req.doc_type.replace("_", " ").title()),
            content=result.get("content", ""), blocks=[],
            terms=req.terms or {}, status="draft", ai_provider=provider,
        )
    db.add(doc)
    db.flush()
    log(db, "document.generated", "document", doc.id, {"provider": provider, "doc_type": doc.doc_type, "template_key": template_key, "application_id": app.id})
    db.commit()
    db.refresh(doc)
    _enrich_doc(db, doc)
    return doc


@router.post("/{doc_id}/regenerate", response_model=schemas.DocumentOut)
def regenerate(doc_id: int, req: schemas.RegenerateDocumentRequest, db: Session = Depends(get_db)):
    """Re-render a draft document in place with edited terms / a different EZ Lab template."""
    doc = db.get(models.Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.status == "approved":
        raise HTTPException(409, "An approved document can't be regenerated")
    app = db.get(models.Application, doc.application_id) if doc.application_id else None
    if not app:
        raise HTTPException(422, "Document has no application to regenerate from")
    template_key = req.template_key or doc.template_key or DOC_TYPE_TEMPLATE.get(doc.doc_type, "")
    if template_key in TEMPLATES:
        rendered = render_document(template_key, template_context(app, req.terms or {}))
        doc.doc_type = rendered["doc_type"]
        doc.template_key = template_key
        doc.title = rendered["title"]
        doc.content = rendered["content"]
        doc.blocks = rendered["blocks"]
        doc.ai_provider = "template"
    elif doc.doc_type in AI_DOC_TYPES:
        # Legacy AI-drafted doc (nda / employment_agreement / contractor_agreement) — re-draft via AI.
        result, provider = ai.generate_document(doc.doc_type, _context(app, req.terms or {}))
        doc.template_key = ""
        doc.title = result.get("title", doc.title)
        doc.content = result.get("content", "")
        doc.blocks = []
        doc.ai_provider = provider
        template_key = ""
    else:
        raise HTTPException(422, f"template_key must be one of {sorted(TEMPLATES)}")
    doc.terms = req.terms or {}
    log(db, "document.regenerated", "document", doc.id, {"template_key": template_key, "doc_type": doc.doc_type})
    db.commit()
    db.refresh(doc)
    _enrich_doc(db, doc)
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
    _enrich_doc(db, doc)
    return doc


@router.get("", response_model=list[schemas.DocumentOut])
def list_documents(application_id: int | None = None, candidate_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(models.Document).order_by(models.Document.created_at.desc())
    if application_id:
        stmt = stmt.where(models.Document.application_id == application_id)
    if candidate_id:
        stmt = stmt.where(models.Document.candidate_id == candidate_id)
    docs = db.scalars(stmt).all()
    for d in docs:  # enrich (transient attrs) so the Offer & Docs table can show every field
        _enrich_doc(db, d)
    return docs


@router.post("/{doc_id}/upload", response_model=schemas.DocumentOut)
def upload_document_file(doc_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Attach a recruiter-uploaded file (e.g. the signed offer PDF) to this entry."""
    doc = db.get(models.Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    data = file.file.read(_MAX_DOC_UPLOAD_BYTES + 1)
    if len(data) > _MAX_DOC_UPLOAD_BYTES:
        raise HTTPException(413, "File is too large (max 25 MB)")
    if not data:
        raise HTTPException(422, "Please attach a file")
    doc.upload_filename = file.filename or "document.pdf"
    doc.upload_mime = file.content_type or "application/pdf"
    doc.upload_size = len(data)
    doc.upload_file = data
    log(db, "document.uploaded", "document", doc.id, {"filename": doc.upload_filename, "size": doc.upload_size})
    db.commit()
    db.refresh(doc)
    _enrich_doc(db, doc)
    return doc


@router.get("/{doc_id}/upload-file")
def get_document_upload(doc_id: int, db: Session = Depends(get_db)):
    """Stream the recruiter-uploaded file inline (preview / download)."""
    doc = db.get(models.Document, doc_id)
    if not doc or doc.upload_file is None:
        raise HTTPException(404, "No uploaded file on this document")
    safe = re.sub(r'[\r\n"\x00-\x1f]+', "", doc.upload_filename or "document.pdf") or "document.pdf"
    return Response(
        content=doc.upload_file,
        media_type=doc.upload_mime or "application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{safe}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/{doc_id}/move-to-onboarding", response_model=schemas.DocumentOut)
def move_to_onboarding(doc_id: int, body: schemas.MoveToOnboardingRequest, db: Session = Depends(get_db)):
    """Mark this entry as moved to onboarding. Setting it on creates the candidate's onboarding
    tracker (the only way a candidate enters the Onboarding page)."""
    doc = db.get(models.Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    doc.move_to_onboarding = bool(body.move)
    if doc.move_to_onboarding and doc.application_id:
        _ensure_onboarding_plan(db, doc.application_id)
    log(db, "document.move_to_onboarding", "document", doc.id, {"move": doc.move_to_onboarding})
    db.commit()
    db.refresh(doc)
    _enrich_doc(db, doc)
    return doc


@router.patch("/{doc_id}/fields", response_model=schemas.DocumentOut)
def update_document_fields(doc_id: int, body: DocumentFieldsRequest, db: Session = Depends(get_db)):
    """Inline-edit the offer-administration fields (personal email, joining date, entity) without
    re-rendering the legal text. These stay editable until the candidate is moved to onboarding —
    once `move_to_onboarding` is set they're locked, since the document is in effect issued."""
    doc = db.get(models.Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.move_to_onboarding:
        raise HTTPException(409, "Fields are locked once the candidate has moved to onboarding")

    if body.personal_email is not None:
        doc.personal_email = body.personal_email.strip()

    terms = dict(doc.terms or {})  # copy so SQLAlchemy detects the JSON change on reassignment
    if body.joining_date is not None:
        terms["start_date"] = body.joining_date.strip()
    if body.entity is not None:
        ent = (body.entity or "").strip().upper()
        if ent and ent not in _ENTITY_CHOICES:
            raise HTTPException(422, f"entity must be one of {sorted(_ENTITY_CHOICES)}")
        terms["entity"] = ent or "EZ"
    doc.terms = terms

    log(db, "document.fields_updated", "document", doc.id, {
        "personal_email": doc.personal_email, "start_date": terms.get("start_date"), "entity": terms.get("entity"),
    })
    db.commit()
    db.refresh(doc)
    _enrich_doc(db, doc)
    return doc


@router.get("/{doc_id}", response_model=schemas.DocumentOut)
def get_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.get(models.Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    _enrich_doc(db, doc)
    return doc
