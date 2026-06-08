"""Communications — real candidate emails (SMTP) with templates + AI composition."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..services import mailer

router = APIRouter(prefix="/api/comms", tags=["comms"])


@router.get("/templates")
def list_templates():
    return {
        "templates": [{"key": k, "label": v} for k, v in mailer.TEMPLATE_LABELS.items()],
        "email_configured": settings.email_configured,
        "from": f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>",
    }


def _resolve_recipient(req: schemas.SendEmailRequest, db: Session):
    """Fill recipient name/email/role from an application or candidate id."""
    to_email, to_name, role = req.to_email, req.to_name, req.role
    candidate_id, application_id = req.candidate_id, req.application_id

    if application_id:
        app = db.get(models.Application, application_id)
        if not app:
            raise HTTPException(404, "Application not found")
        candidate_id = app.candidate_id
        to_email = to_email or app.candidate.email
        to_name = to_name or app.candidate.name
        role = role or app.hiring_request.position
    elif candidate_id:
        cand = db.get(models.Candidate, candidate_id)
        if not cand:
            raise HTTPException(404, "Candidate not found")
        to_email = to_email or cand.email
        to_name = to_name or cand.name

    return to_email, to_name, role, candidate_id, application_id


@router.post("/preview")
def preview_email(req: schemas.SendEmailRequest, db: Session = Depends(get_db)):
    """Render a draft. Normally returns the exact rendered text /send would produce.
    With raw=True it returns the unrendered template (with {name} tokens) for editing."""
    to_email, to_name, role, _candidate_id, _application_id = _resolve_recipient(req, db)
    company = settings.COMPANY_NAME
    if req.raw and not req.use_ai and req.template in mailer.TEMPLATES:
        tpl = mailer.TEMPLATES[req.template]
        subject, body, ai_generated = tpl["subject"], tpl["body"], False
    else:
        ctx = {"name": to_name, "role": role, "company": company, "sender": settings.EMAIL_FROM_NAME}
        subject, body, ai_generated = mailer.render_draft(
            req.template, ctx, use_ai=req.use_ai, subject=req.subject, body=req.body
        )
    return {
        "subject": subject,
        "body": body,
        "ai_generated": ai_generated,
        "to_email": to_email or "",
        "to_name": to_name or "",
        "role": role or "",
        "company": company,
        "sender": settings.EMAIL_FROM_NAME,
        "from": f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>",
    }


@router.post("/send", response_model=schemas.EmailOut)
def send_email(req: schemas.SendEmailRequest, db: Session = Depends(get_db)):
    to_email, to_name, role, candidate_id, application_id = _resolve_recipient(req, db)

    if not to_email:
        raise HTTPException(422, "No recipient email — provide to_email or a candidate/application with an email.")

    rec = mailer.compose(
        db,
        to_email=to_email,
        to_name=to_name,
        template=req.template,
        role=role,
        subject=req.subject,
        body=req.body,
        use_ai=req.use_ai,
        candidate_id=candidate_id,
        application_id=application_id,
    )
    db.commit()
    db.refresh(rec)
    return rec


@router.post("/send-bulk")
def send_bulk(req: schemas.BulkEmailRequest, db: Session = Depends(get_db)):
    """Send the same template to many applications at once. Each email is rendered
    per-candidate (name/role personalized) and persisted. Returns a status tally."""
    edited = bool(req.subject and req.body)  # caller supplied an edited template (with tokens)
    sent = logged = failed = skipped = 0
    for app_id in req.application_ids:
        app = db.get(models.Application, app_id)
        if not app or not app.candidate or not app.candidate.email:
            skipped += 1
            continue
        role = app.hiring_request.position if app.hiring_request else ""
        subject = body = None
        if edited:
            # Personalize the edited template per candidate so each gets their own {name}.
            ctx = {"name": app.candidate.name, "role": role, "company": settings.COMPANY_NAME, "sender": settings.EMAIL_FROM_NAME}
            subject = mailer.personalize(req.subject, ctx)
            body = mailer.personalize(req.body, ctx)
        rec = mailer.compose(
            db,
            to_email=app.candidate.email,
            to_name=app.candidate.name,
            template=req.template,
            role=role,
            subject=subject,
            body=body,
            use_ai=req.use_ai and not edited,
            candidate_id=app.candidate_id,
            application_id=app_id,
        )
        if rec.status == "sent":
            sent += 1
        elif rec.status == "logged":
            logged += 1
        else:
            failed += 1
    db.commit()
    return {
        "total": len(req.application_ids),
        "sent": sent,
        "logged": logged,
        "failed": failed,
        "skipped": skipped,  # no email on file
    }


@router.get("/emails", response_model=list[schemas.EmailOut])
def list_emails(candidate_id: int | None = None, application_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(models.EmailMessage).order_by(models.EmailMessage.created_at.desc())
    if candidate_id:
        stmt = stmt.where(models.EmailMessage.candidate_id == candidate_id)
    if application_id:
        stmt = stmt.where(models.EmailMessage.application_id == application_id)
    return db.scalars(stmt.limit(100)).all()
