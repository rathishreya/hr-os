"""Communications — real candidate emails (SMTP) with templates + AI composition."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..deps import current_user
from ..services import mailer

router = APIRouter(prefix="/api/comms", tags=["comms"])


@router.get("/templates")
def list_templates(user: models.User = Depends(current_user)):
    identity = mailer.resolve_identity(user)
    return {
        "templates": [{"key": k, "label": v} for k, v in mailer.TEMPLATE_LABELS.items()],
        # Whether THIS user can send (their own mailbox or the workspace fallback).
        "email_configured": identity["configured"],
        "from": f"{identity['from_name']} <{identity['from_email']}>",
        "personal_mailbox": identity["personal"],
    }


# ── Per-user outbound mailbox (true send-from) ────────────────────────────────
# Any signed-in user can connect their own Gmail/Workspace mailbox so candidate emails
# go out FROM their address. They store a 16-char App Password (NOT their login password);
# we keep it server-side only and never return it.
@router.get("/my-mailbox")
def get_my_mailbox(user: models.User = Depends(current_user)):
    identity = mailer.resolve_identity(user)
    return {
        "email": user.email,
        "name": user.name,
        "connected": bool((user.smtp_password or "").strip()),  # user has set their own App Password
        "active": identity["personal"],                          # actually sending from their mailbox
        "workspace_fallback": bool(settings.SMTP_HOST),          # shared account available if not connected
        "host": settings.SMTP_HOST or "smtp.gmail.com",
    }


@router.put("/my-mailbox")
def set_my_mailbox(payload: schemas.MyMailboxUpdate, db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    # Gmail App Passwords are shown with spaces ("abcd efgh ijkl mnop"); strip them.
    pw = (payload.app_password or "").replace(" ", "").strip()
    user.smtp_password = pw
    security_note = "cleared" if not pw else "saved"
    db.commit()
    return {"connected": bool(pw), "status": security_note}


@router.post("/my-mailbox/test")
def test_my_mailbox(db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    """Send a test email to the user's own address through their resolved mailbox."""
    if not user.email:
        raise HTTPException(422, "Your account has no email address to send a test to.")
    rec = mailer.compose(
        db,
        to_email=user.email,
        to_name=user.name or "there",
        template="custom",
        subject="Test email from your HR-OS mailbox",
        body=(
            f"Hi {user.name or 'there'},\n\nThis confirms your HR-OS mailbox is set up correctly. "
            "Candidate emails you send will go out from this address.\n\n— Sent automatically from Settings → Email"
        ),
        candidate_id=None,
        application_id=None,
        sender_user=user,
    )
    db.commit()
    db.refresh(rec)
    return rec


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
def preview_email(req: schemas.SendEmailRequest, db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    """Render a draft. Normally returns the exact rendered text /send would produce.
    With raw=True it returns the unrendered template (with {name} tokens) for editing."""
    to_email, to_name, role, _candidate_id, _application_id = _resolve_recipient(req, db)
    company = settings.COMPANY_NAME
    identity = mailer.resolve_identity(user)
    if req.raw and not req.use_ai and req.template in mailer.TEMPLATES:
        tpl = mailer.TEMPLATES[req.template]
        subject, body, ai_generated = tpl["subject"], tpl["body"], False
    else:
        ctx = {"name": to_name, "role": role, "company": company, "sender": identity["from_name"]}
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
        "sender": identity["from_name"],
        "from": f"{identity['from_name']} <{identity['from_email']}>",
    }


@router.post("/send", response_model=schemas.EmailOut)
def send_email(req: schemas.SendEmailRequest, db: Session = Depends(get_db), user: models.User = Depends(current_user)):
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
        sender_user=user,
    )
    db.commit()
    db.refresh(rec)
    return rec


@router.post("/send-bulk")
def send_bulk(req: schemas.BulkEmailRequest, db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    """Send the same template to many applications at once. Each email is rendered
    per-candidate (name/role personalized) and persisted. Returns a status tally."""
    edited = bool(req.subject and req.body)  # caller supplied an edited template (with tokens)
    sender_name = mailer.resolve_identity(user)["from_name"]
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
            ctx = {"name": app.candidate.name, "role": role, "company": settings.COMPANY_NAME, "sender": sender_name}
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
            sender_user=user,
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
