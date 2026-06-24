"""Job (JD) read + publish + role lifecycle (status state-machine)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..services.distribution import dispatch
from ..services.recruitment import log

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

# Valid role statuses. 'paused' is the auto-pause an on-hold role drops into once it has been
# parked longer than the reopen window — it is reachable only through the lifecycle endpoint
# (and the time-based sweep below), never set directly from the create/edit forms.
ROLE_STATUSES = ("open", "closed", "on_hold", "draft", "paused")
# How long an on-hold role may sit before reopening it is no longer a simple resume: 3 months.
ON_HOLD_REOPEN_DAYS = 90


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def auto_pause_stale_on_hold(db: Session, rows: list[models.HiringRequest]) -> bool:
    """Flip any on-hold role parked longer than the reopen window to 'paused'. Lazy, idempotent
    sweep (no cron needed) — call it before listing/serving roles so the status reflects reality."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=ON_HOLD_REOPEN_DAYS)
    changed = False
    for r in rows:
        if r.status == "on_hold":
            since = _aware(r.status_changed_at) or _aware(r.created_at)
            if since and since < cutoff:
                r.status = "paused"
                r.status_changed_at = datetime.now(timezone.utc)
                log(db, "hiring_request.auto_paused", "hiring_request", r.id, {"after_days": ON_HOLD_REOPEN_DAYS})
                changed = True
    if changed:
        db.commit()
    return changed


@router.post("/lifecycle/{hr_id}/status", response_model=schemas.HiringRequestOut)
def change_role_status(hr_id: int, status: str = Body(..., embed=True), db: Session = Depends(get_db)):
    """Guarded role status transition (the create/edit forms and the jobs list call this instead
    of the plain PATCH so the lifecycle rules are enforced server-side, not just hidden in the UI):

    - 'closed' is terminal — no transition out of it is allowed.
    - An on-hold role can reopen to 'open' only within the 3-month window; reopened later it goes
      to 'paused' instead (it must be deliberately revived from paused).
    - A 'paused' role can be revived back to 'open' (it resets the clock).
    - status_changed_at is stamped on every change so the window is measured from the last move.
    """
    hr = db.get(models.HiringRequest, hr_id)
    if not hr:
        raise HTTPException(404, "Hiring request not found")
    target = (status or "").strip()
    if target not in ROLE_STATUSES:
        raise HTTPException(422, "Invalid status")

    current = hr.status
    if current == target:
        return hr

    # Closed is permanent — block any reopen/edit out of it.
    if current == "closed":
        raise HTTPException(409, "This role is closed and cannot be reopened.")

    # Reopening: from on_hold/paused/draft → open carries the 3-month rule for on_hold.
    if target == "open" and current == "on_hold":
        since = _aware(hr.status_changed_at) or _aware(hr.created_at)
        age = datetime.now(timezone.utc) - since if since else timedelta(0)
        if age > timedelta(days=ON_HOLD_REOPEN_DAYS):
            target = "paused"  # parked too long to simply resume — park it as paused

    hr.status = target
    hr.status_changed_at = datetime.now(timezone.utc)
    log(db, "hiring_request.status_changed", "hiring_request", hr.id, {"from": current, "to": target})
    db.commit()
    db.refresh(hr)
    return hr


# Role-level meta the plain hiring-request PATCH endpoint doesn't currently apply. The jobs
# list edits these inline (New/Replacement dropdown, team) and the edit modal saves the brief,
# so expose a small guarded patch here to actually persist them. Whitelisted to avoid letting
# this become a back-door for arbitrary column writes.
_ROLE_META_FIELDS = {"hire_type", "team", "role_brief"}
_HIRE_TYPES = {"new", "replacement", ""}


@router.patch("/lifecycle/{hr_id}/meta", response_model=schemas.HiringRequestOut)
def update_role_meta(hr_id: int, body: dict = Body(...), db: Session = Depends(get_db)):
    """Persist role-level meta fields (hire_type / team / role_brief) edited from the jobs list
    and the edit-job modal. Only whitelisted keys are applied; unknown keys are ignored."""
    hr = db.get(models.HiringRequest, hr_id)
    if not hr:
        raise HTTPException(404, "Hiring request not found")
    changed: list[str] = []
    for key in _ROLE_META_FIELDS & set(body.keys()):
        val = body.get(key)
        val = "" if val is None else str(val).strip()
        if key == "hire_type":
            val = val.lower()
            if val not in _HIRE_TYPES:
                raise HTTPException(422, "hire_type must be 'new' or 'replacement'")
        setattr(hr, key, val)
        changed.append(key)
    if changed:
        log(db, "hiring_request.meta_updated", "hiring_request", hr.id, {"fields": sorted(changed)})
        db.commit()
        db.refresh(hr)
    return hr


@router.get("", response_model=list[schemas.JobOut])
def list_jobs(db: Session = Depends(get_db)):
    return db.scalars(select(models.Job).order_by(models.Job.created_at.desc())).all()


@router.get("/{job_id}", response_model=schemas.JobOut)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.get(models.Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


_JOB_LIST_FIELDS = {"responsibilities", "requirements", "benefits", "screening_questions", "knockout_questions"}
# These render as bullet lists where a leading indent makes a sub-bullet — so preserve
# leading whitespace (only trim the trailing end), unlike the other list fields.
_NESTABLE_LIST_FIELDS = {"responsibilities", "requirements", "benefits"}


@router.patch("/{job_id}", response_model=schemas.JobOut)
def update_job(job_id: int, body: schemas.JobUpdate, db: Session = Depends(get_db)):
    """Apply human edits to an AI-generated JD. Only the fields sent are changed."""
    job = db.get(models.Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    data = body.model_dump(exclude_unset=True)
    for key, val in data.items():
        if key in _JOB_LIST_FIELDS and isinstance(val, list):
            if key in _NESTABLE_LIST_FIELDS:
                val = [str(x).rstrip() for x in val if str(x).strip()]  # keep leading indent
            else:
                val = [str(x).strip() for x in val if str(x).strip()]
        elif isinstance(val, str):
            val = val.strip()
        setattr(job, key, val)
    log(db, "job.edited", "job", job.id, {"fields": sorted(data.keys())})
    db.commit()
    db.refresh(job)
    return job


@router.post("/{job_id}/publish", response_model=schemas.JobOut)
def publish_job(job_id: int, payload: schemas.PublishRequest | None = None, db: Session = Depends(get_db)):
    job = db.get(models.Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    job.status = "published"
    if payload and payload.platforms:
        job.target_platforms = payload.platforms
    log(db, "job.published", "job", job.id, {"platforms": job.target_platforms or []})
    db.commit()
    db.refresh(job)

    # Best-effort automated direct posting (Google Indexing + LinkedIn). No-op unless
    # configured; wrapped so a distribution hiccup never fails the publish itself.
    if settings.google_indexing_configured or settings.linkedin_configured:
        try:
            dispatch.run(db, job)
            db.commit()
            db.refresh(job)
        except Exception:
            db.rollback()
    return job


@router.patch("/{job_id}/video-questions", response_model=schemas.JobOut)
def set_video_questions(job_id: int, payload: schemas.VideoQuestionsUpdate, db: Session = Depends(get_db)):
    job = db.get(models.Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    job.video_questions = [q.strip() for q in payload.questions if q and q.strip()]
    log(db, "job.video_questions", "job", job.id, {"count": len(job.video_questions)})
    db.commit()
    db.refresh(job)
    return job
