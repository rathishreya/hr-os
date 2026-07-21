"""Email a candidate their async AI video-interview link (recruiter action — auth-gated).

Mirrors the assessment send flow: draft a message that carries the interview link, preview/edit it
in a popup, then send it to one or more candidates. The link target (/interview/{application_id})
is a PUBLIC candidate-facing page, so the candidate needs no login to take the interview — but
THIS router (sending the email) is auth-gated, unlike the public /api/video-interview endpoints.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import models
from ..config import settings
from ..database import get_db
from ..services import mailer
from ..services.recruitment import log

router = APIRouter(prefix="/api/interview-invite", tags=["interview-invite"])

_PLACEHOLDER = re.compile(r"\{(\w+)\}")


def _fill(text: str, mapping: dict) -> str:
    # Single pass so a value containing a token isn't re-expanded.
    return _PLACEHOLDER.sub(lambda m: str(mapping.get(m.group(1), m.group(0))), text or "")


def _interview_link(application_id: int) -> str:
    base = (settings.PUBLIC_BASE_URL or "").rstrip("/")
    return f"{base}/interview/{application_id}"


def _default_subject(role: str, company: str) -> str:
    return f"Video interview — next step for {role or 'your application'} at {company}"


def _default_body(role: str, company: str) -> str:
    # Keeps {name} and {link} placeholders — filled per candidate at send time (the link differs
    # per application, so it MUST stay a placeholder to be correct for multiple recipients).
    return (
        f"Hi {{name}},\n\nThanks for your interest in {role or 'the role'} at {company}. As the next "
        f"step, we'd like you to complete a short online video interview — you can take it anytime, "
        f"right from your browser.\n\nStart here: {{link}}\n\n"
        f"You'll record answers to a few questions on camera; it takes about 10-15 minutes. Please use "
        f"a device with a working camera and microphone, in a quiet, well-lit spot.\n\n"
        f"If you have any questions, just reply to this email.\n\nBest regards,\n{settings.EMAIL_FROM_NAME}"
    )


class SendVideoInviteRequest(BaseModel):
    application_ids: list[int]
    subject: str | None = None
    body: str | None = None


@router.post("/draft")
def draft_invite(application_id: int, db: Session = Depends(get_db)):
    """Suggested invite email for this candidate's video interview. `body` keeps {name}/{link}
    tokens; `link` is the resolved URL for this application, returned for on-screen preview."""
    app = db.get(models.Application, application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    role = app.hiring_request.position if app.hiring_request else ""
    company = settings.COMPANY_NAME
    return {
        "subject": _default_subject(role, company),
        "body": _default_body(role, company),
        "link": _interview_link(application_id),
    }


@router.post("/send")
def send_invite(req: SendVideoInviteRequest, db: Session = Depends(get_db)):
    """Email the video-interview link to one or more candidates. subject/body may use
    {name}/{role}/{company}/{link} — filled per candidate (the link is per application)."""
    counts = {"sent": 0, "logged": 0, "failed": 0}
    apps_by_id = {ap.id: ap for ap in db.scalars(
        select(models.Application)
        .where(models.Application.id.in_(req.application_ids))
        .options(selectinload(models.Application.candidate),
                 selectinload(models.Application.hiring_request))
    )}
    for app_id in req.application_ids:
        app = apps_by_id.get(app_id)
        if not app or not app.candidate:
            counts["failed"] += 1
            continue
        cand = app.candidate
        role = app.hiring_request.position if app.hiring_request else ""
        mapping = {"name": cand.name or "there", "role": role,
                   "company": settings.COMPANY_NAME, "link": _interview_link(app_id)}
        subject = _fill(req.subject or _default_subject(role, settings.COMPANY_NAME), mapping)
        body = _fill(req.body or _default_body(role, settings.COMPANY_NAME), mapping)
        rec = mailer.compose(
            db, to_email=cand.email or "", to_name=cand.name or "", template="interview_invite",
            role=role, subject=subject, body=body, candidate_id=cand.id, application_id=app.id,
        )
        counts[rec.status if rec.status in counts else "failed"] += 1
    log(db, "video_interview.invited", "application", None,
        {"count": len(req.application_ids), **counts})
    db.commit()
    return {"total": len(req.application_ids), **counts}
