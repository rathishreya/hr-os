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
from ..deps import current_user
from ..services import calendar_invite, mailer, security
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
    # Keeps {name}/{link}/{code} placeholders — filled per candidate at send time (the link and code
    # differ per application, so they MUST stay placeholders to be correct for multiple recipients).
    return (
        f"Hi {{name}},\n\nThanks for your interest in {role or 'the role'} at {company}. As the next "
        f"step, we'd like you to complete a short online video interview — you can take it anytime, "
        f"right from your browser.\n\nStart here: {{link}}\n\n"
        f"To confirm it's you, enter this access code when you open the link:  {{code}}\n\n"
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
        "code": security.interview_code(application_id, settings.SECRET_KEY),
    }


@router.post("/send")
def send_invite(req: SendVideoInviteRequest, db: Session = Depends(get_db), user: models.User = Depends(current_user)):
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
                   "company": settings.COMPANY_NAME, "link": _interview_link(app_id),
                   "code": security.interview_code(app_id, settings.SECRET_KEY)}
        subject = _fill(req.subject or _default_subject(role, settings.COMPANY_NAME), mapping)
        body = _fill(req.body or _default_body(role, settings.COMPANY_NAME), mapping)
        rec = mailer.compose(
            db, to_email=cand.email or "", to_name=cand.name or "", template="interview_invite",
            role=role, subject=subject, body=body, candidate_id=cand.id, application_id=app.id,
            sender_user=user,
        )
        counts[rec.status if rec.status in counts else "failed"] += 1
    log(db, "video_interview.invited", "application", None,
        {"count": len(req.application_ids), **counts})
    db.commit()
    return {"total": len(req.application_ids), **counts}


# ── Live interview rounds: schedule email (date/time + auto meeting link + calendar .ics) ────────
# Used by the preview-and-send popup shown after scheduling ANY live round (screening/technical/
# round_x/final). Works off the created round rows (which already carry the meeting link).

def _round_label(r: "models.InterviewRound") -> str:
    return f"Round {r.round_number} · {(r.interview_type or '').replace('_', ' ').title()}"


def _fmt_when(scheduled_at: str) -> str:
    start = calendar_invite.parse_local_dt(scheduled_at or "")
    if not start:
        return "To be confirmed — we'll follow up with a time"
    return start.strftime("%A, %d %b %Y · %I:%M %p") + " (local time — a calendar invite is attached)"


def _invite_subject(role: str, company: str) -> str:
    return f"Interview scheduled — {role or 'your application'} at {company}"


def _invite_body() -> str:
    # Keeps {name}/{round}/{when}/{where} tokens — filled per round at send time (each round has its
    # own slot + meeting link). {role}/{company}/{sender} are pre-filled at draft (constant).
    return (
        "Hi {name},\n\nYour {round} for the {role} role at {company} has been scheduled.\n\n"
        "When: {when}\nWhere / join link: {where}\n\n"
        "A calendar invite is attached — add it to your calendar. If this time doesn't work, just "
        "reply to this email.\n\nBest regards,\n{sender}"
    )


class RoundInviteSendRequest(BaseModel):
    round_ids: list[int]
    subject: str | None = None
    body: str | None = None


@router.post("/round-draft")
def round_draft(round_id: int, db: Session = Depends(get_db)):
    """Suggested schedule email for a created round, plus the resolved when/where for the preview
    card. `body` keeps {name}/{round}/{when}/{where}; `where` is the (auto-created) meeting link."""
    r = db.get(models.InterviewRound, round_id)
    if not r:
        raise HTTPException(404, "Interview round not found")
    app = db.get(models.Application, r.application_id)
    role = app.hiring_request.position if (app and app.hiring_request) else ""
    company = settings.COMPANY_NAME
    const = {"role": role, "company": company, "sender": settings.EMAIL_FROM_NAME}
    return {
        "subject": _fill(_invite_subject(role, company), const),
        "body": _fill(_invite_body(), const),
        "when": _fmt_when(r.scheduled_at or ""),
        "where": r.location_or_link or "",
        "round": _round_label(r),
    }


@router.post("/round-send")
def round_send(req: RoundInviteSendRequest, db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    """Email the schedule (date/time + meeting link) to each round's candidate, with a calendar
    (.ics) invite attached. subject/body may use {name}/{role}/{company}/{round}/{when}/{where}."""
    counts = {"sent": 0, "logged": 0, "failed": 0}
    rounds_by_id = {r.id: r for r in db.scalars(
        select(models.InterviewRound).where(models.InterviewRound.id.in_(req.round_ids))
    )}
    apps_by_id = {ap.id: ap for ap in db.scalars(
        select(models.Application)
        .where(models.Application.id.in_({r.application_id for r in rounds_by_id.values()}))
        .options(selectinload(models.Application.candidate),
                 selectinload(models.Application.hiring_request))
    )}
    for rid in req.round_ids:
        r = rounds_by_id.get(rid)
        app = apps_by_id.get(r.application_id) if r else None
        if not r or not app or not app.candidate:
            counts["failed"] += 1
            continue
        cand = app.candidate
        role = app.hiring_request.position if app.hiring_request else ""
        where = r.location_or_link or "Will be shared before the interview"
        mapping = {
            "name": cand.name or "there", "role": role, "company": settings.COMPANY_NAME,
            "sender": settings.EMAIL_FROM_NAME, "round": _round_label(r),
            "when": _fmt_when(r.scheduled_at or ""), "where": where,
        }
        subject = _fill(req.subject or _invite_subject(role, settings.COMPANY_NAME), mapping)
        body = _fill(req.body or _invite_body(), mapping)
        ics = None
        start = calendar_invite.parse_local_dt(r.scheduled_at or "")
        if start:
            ics = calendar_invite.build_ics(
                summary=f"{_round_label(r)} — {role}", start=start,
                duration_minutes=r.duration_minutes or 60,
                description=(f"Interview for {role} at {settings.COMPANY_NAME}."
                            + (f" Join: {r.location_or_link}" if r.location_or_link else "")),
                location=r.location_or_link or "",
                uid=f"hros-round-{r.id}-{start.strftime('%Y%m%dT%H%M%S')}@hr-os",
                organizer_email=settings.EMAIL_FROM, organizer_name=settings.EMAIL_FROM_NAME,
                attendees=[cand.email] if cand.email else [],
            )
        rec = mailer.compose(
            db, to_email=cand.email or "", to_name=cand.name or "", template="interview_invite",
            role=role, subject=subject, body=body, candidate_id=cand.id, application_id=app.id, ics=ics,
            sender_user=user,
        )
        counts[rec.status if rec.status in counts else "failed"] += 1
    log(db, "interview.invite_sent", "interview_round", None, {"count": len(req.round_ids), **counts})
    db.commit()
    return {"total": len(req.round_ids), **counts}
