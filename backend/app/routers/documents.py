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
from ..deps import current_user
from ..services import onboarding_template
from ..services.ai import ai
from ..services.documents import TEMPLATES, list_templates, render_document, template_supports_entity
from ..services.documents import mail as doc_mail
from ..services import mailer
from ..services.documents.registry import default_template_for
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
# A template key is itself a valid doc_type on the wire (the UI sends the key for both).
DOC_TYPES = set(TEMPLATES) | AI_DOC_TYPES

# Allowed legal entities for the inline Entity edit (mirrors render.ENTITIES / the generate form).
_ENTITY_CHOICES = {"EZ", "AEZ"}


def _entity_of(doc: models.Document) -> str:
    """The operating entity a stored document is on. The template is authoritative; terms only
    cover legacy/AI documents that were never drafted from one."""
    tpl = TEMPLATES.get(doc.template_key)
    return (tpl.entity if tpl else "") or (doc.terms or {}).get("entity") or "EZ"


def _settled_entity(db: Session, candidate_id: int, exclude_doc_id: int | None = None) -> str:
    """The entity this candidate is already on, or "" when they have no documents yet.

    A candidate belongs to ONE operating entity: their FIRST document settles it and every later
    one must be issued on the same company's paper. Taking the earliest document rather than, say,
    the majority means the answer never moves as more documents are added — and it stays stable
    for the handful of candidates created before this rule existed whose documents disagree.
    """
    first = db.scalars(
        select(models.Document)
        .where(models.Document.candidate_id == candidate_id)
        .order_by(models.Document.id)
    ).first() if exclude_doc_id is None else next(
        (d for d in db.scalars(
            select(models.Document)
            .where(models.Document.candidate_id == candidate_id)
            .order_by(models.Document.id)
        ) if d.id != exclude_doc_id),
        None,
    )
    return _entity_of(first) if first else ""


def _require_candidate_entity(db: Session, candidate_id: int, template_key: str,
                              terms: dict | None, exclude_doc_id: int | None = None) -> None:
    """Refuse to put a second entity's letter into a candidate's file."""
    settled = _settled_entity(db, candidate_id, exclude_doc_id)
    if not settled:
        return  # no documents yet — this one settles it
    tpl = TEMPLATES.get(template_key)
    wanted = (tpl.entity if tpl else "") or (terms or {}).get("entity") or settled
    if wanted == settled:
        return
    cand = db.get(models.Candidate, candidate_id)
    who = (cand.name if cand else None) or "This candidate"
    raise HTTPException(
        409,
        f"{who} is on {settled}. A candidate can only hold documents from one entity, so a "
        f"document on {wanted} cannot be added to their file. If they belong to {wanted}, delete "
        f"their {settled} documents first.",
    )


def _require_entity_match(template_key: str, entity: str | None) -> None:
    """Refuse to draft an entity's letter from another entity's template — that would put the
    wrong legal name and clause wording on a signed document."""
    if not template_supports_entity(template_key, entity):
        raise HTTPException(422, f"Template '{template_key}' is not issued by entity '{entity}'.")


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
    # The template is authoritative for the operating entity; terms only cover legacy/AI docs
    # with no template. Trusting terms alone rendered AEZ papers on EZ letterhead when a flow
    # forgot to stamp terms["entity"].
    tpl = TEMPLATES.get(d.template_key)
    d.entity = (tpl.entity if tpl else "") or t.get("entity") or "EZ"
    d.reporting_manager = t.get("manager") or ""
    d.approving_manager = t.get("approving_manager") or ""
    d.has_upload = bool(d.upload_file)
    # personal_email is a real column on the model; DocumentOut reads it directly.


@router.get("/templates", response_model=list[schemas.DocumentTemplateOut])
def get_templates(
    entity: str | None = None,
    party_type: str | None = None,
    contract_type: str | None = None,
    doc_type: str | None = None,
):
    """The templates on offer, narrowed by any combination of the four taxonomy axes:
    entity (EZ|AEZ), party_type (agency|individual), contract_type and doc_type."""
    return list_templates(entity, party_type, contract_type, doc_type)


@router.post("/generate", response_model=schemas.DocumentOut)
def generate(req: schemas.GenerateDocumentRequest, db: Session = Depends(get_db)):
    if req.doc_type not in DOC_TYPES:
        raise HTTPException(422, f"doc_type must be one of {sorted(DOC_TYPES)}")
    app = db.get(models.Application, req.application_id)
    if not app:
        raise HTTPException(404, "Application not found")

    template_key = req.template_key or (req.doc_type if req.doc_type in TEMPLATES else default_template_for(req.doc_type))
    _require_entity_match(template_key, (req.terms or {}).get("entity"))
    _require_candidate_entity(db, app.candidate_id, template_key, req.terms)
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
    template_key = req.template_key or doc.template_key or default_template_for(doc.doc_type)
    _require_entity_match(template_key, (req.terms or {}).get("entity"))
    _require_candidate_entity(db, doc.candidate_id, template_key, req.terms, exclude_doc_id=doc.id)
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
    doc.content_html = ""  # a fresh template render supersedes any manual rich-editor edit
    log(db, "document.regenerated", "document", doc.id, {"template_key": template_key, "doc_type": doc.doc_type})
    db.commit()
    db.refresh(doc)
    _enrich_doc(db, doc)
    return doc


import re as _re

_TAG_RE = _re.compile(r"<[^>]+>")
_WS_RE = _re.compile(r"[ \t]*\n[ \t]*")


# Allow-list for recruiter-edited letter HTML — only formatting tags the editor can produce, and
# only the `class` attribute (never style/src/href/on*). Everything else is stripped. This is the
# security boundary for `content_html` (a client-side sanitizer is bypassable and not trusted).
_ALLOWED_TAGS = [
    "h1", "h2", "h3", "h4", "p", "br", "hr", "strong", "b", "em", "i", "u",
    "span", "div", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "pre",
]


def _sanitize_html(html: str) -> str:
    html = html or ""
    if not html.strip():
        return ""
    try:
        import bleach
    except ImportError:  # sanitizer unavailable — never persist raw HTML, degrade to escaped text
        from html import escape
        return escape(html)
    return bleach.clean(html, tags=_ALLOWED_TAGS, attributes={"*": ["class"]}, strip=True, strip_comments=True)


def _html_to_text(html: str) -> str:
    """Rough plain-text rendering of edited HTML, so Copy/email stay sensible after a manual edit."""
    s = html or ""
    s = _re.sub(r"(?i)</(p|div|h[1-6]|li|tr|table|ul|ol)>", "\n", s)
    s = _re.sub(r"(?i)<br\s*/?>", "\n", s)
    s = _TAG_RE.sub("", s)
    s = (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
         .replace("&quot;", '"').replace("&#39;", "'").replace("&nbsp;", " "))
    s = _WS_RE.sub("\n", s)
    return _re.sub(r"\n{3,}", "\n\n", s).strip()


@router.patch("/{doc_id}/content", response_model=schemas.DocumentOut)
def save_document_content(doc_id: int, body: schemas.SaveDocumentContentRequest, db: Session = Depends(get_db)):
    """Persist a manual rich-editor edit of a DRAFT document. Stores the edited HTML (rendered on the
    letterhead by the preview/PDF); an empty string reverts to the generated template blocks. Locked
    once approved or moved to onboarding — the letter is effectively issued."""
    doc = db.get(models.Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.status == "approved":
        raise HTTPException(409, "An approved document can't be edited")
    if doc.move_to_onboarding:
        raise HTTPException(409, "Locked once the candidate has moved to onboarding")
    doc.content_html = _sanitize_html(body.content_html)  # allow-list sanitize (stored-XSS defense)
    if doc.content_html:
        doc.content = _html_to_text(doc.content_html)  # keep the plain-text copy in sync
    if body.title is not None:
        doc.title = body.title.strip()[:200]
    log(db, "document.content_edited", "document", doc.id, {"chars": len(doc.content_html)})
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


# ── Covering email ───────────────────────────────────────────────────────────────────────────
# Sending is deliberately two steps: the recruiter fetches the draft, reviews (and may edit) it,
# then posts it back with the rendered PDF. Nothing is ever mailed straight off a button.


def _mail_context(db: Session, doc: models.Document) -> tuple[str, str, str]:
    """(to_email, full_name, role) for a document's covering mail, from the document's own terms
    first and the candidate/role records as the fallback."""
    _enrich_doc(db, doc)
    return doc.personal_email or doc.email or "", doc.candidate_name or "", doc.position or ""


@router.get("/{doc_id}/email-draft")
def get_email_draft(doc_id: int, db: Session = Depends(get_db)):
    """The covering email for this document, rendered but NOT sent — this is the review step."""
    doc = db.get(models.Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    to_email, full_name, role = _mail_context(db, doc)
    draft = doc_mail.render(doc.template_key or "", full_name=full_name, role=role)
    return {
        **draft,
        "document_id": doc.id,
        "template_key": doc.template_key or "",
        "to_email": to_email,
        "to_name": full_name,
        "attachment_filename": _attachment_name(doc, full_name),
        "already_sent": bool(doc.email_sent_at),
    }


def _attachment_name(doc: models.Document, full_name: str) -> str:
    """A readable filename for the attached document, e.g. 'Offer Letter - Ananya Sharma.pdf'.
    Strips the characters Windows and mail clients choke on so the attachment always opens."""
    base = re.sub(r'[\\/:*?"<>|\r\n]+', " ", doc.title or "Document").strip() or "Document"
    return base if base.lower().endswith(".pdf") else f"{base}.pdf"


class SendDocumentEmailRequest(BaseModel):
    """The reviewed draft, posted back after the recruiter has read (and possibly edited) it.
    `pdf_base64` is the rendered document as produced by the preview/print path, so what the
    candidate receives is exactly what was on screen."""

    to_email: str
    subject: str
    body: str
    cc: list[str] = []
    pdf_base64: str = ""
    filename: str = ""


@router.post("/{doc_id}/send-email", response_model=schemas.EmailOut)
def send_document_email(
    doc_id: int,
    req: SendDocumentEmailRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(current_user),
):
    """Send the reviewed covering mail with the document attached, and stamp the document so the
    UI can show it has already gone out."""
    import base64

    doc = db.get(models.Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    # candidate_name/position are derived by _enrich_doc, not columns — populate before use.
    _enrich_doc(db, doc)
    to_email = (req.to_email or "").strip()
    if not to_email:
        raise HTTPException(422, "No recipient email on this document — add one before sending.")
    if not (req.subject or "").strip():
        raise HTTPException(422, "The email needs a subject.")

    attachments = []
    if req.pdf_base64:
        try:
            content = base64.b64decode(req.pdf_base64, validate=True)
        except Exception as exc:  # noqa: BLE001 - a malformed upload must not 500
            raise HTTPException(422, "The attached document could not be decoded.") from exc
        if len(content) > _MAX_DOC_UPLOAD_BYTES:
            raise HTTPException(413, "The attached document is too large (25 MB limit).")
        attachments.append({
            "filename": req.filename or _attachment_name(doc, doc.candidate_name or ""),
            "content": content,
            "mimetype": "application/pdf",
        })

    rec = mailer.compose(
        db,
        to_email=to_email,
        to_name=doc.candidate_name or "",
        template="custom",
        subject=req.subject,
        body=req.body,
        candidate_id=doc.candidate_id,
        application_id=doc.application_id,
        sender_user=user,
        cc=req.cc or [],
        attachments=attachments or None,
    )
    doc.email_sent_at = datetime.now(timezone.utc)
    log(db, "document.emailed", "document", doc.id, {
        "to": to_email, "cc": req.cc or [], "status": rec.status,
        "attached": bool(attachments), "template_key": doc.template_key,
    })
    db.commit()
    db.refresh(rec)
    return rec
