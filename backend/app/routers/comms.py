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


@router.post("/send", response_model=schemas.EmailOut)
def send_email(req: schemas.SendEmailRequest, db: Session = Depends(get_db)):
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


@router.get("/emails", response_model=list[schemas.EmailOut])
def list_emails(candidate_id: int | None = None, application_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(models.EmailMessage).order_by(models.EmailMessage.created_at.desc())
    if candidate_id:
        stmt = stmt.where(models.EmailMessage.candidate_id == candidate_id)
    if application_id:
        stmt = stmt.where(models.EmailMessage.application_id == application_id)
    return db.scalars(stmt.limit(100)).all()
