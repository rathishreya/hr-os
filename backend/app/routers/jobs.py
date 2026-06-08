"""Job (JD) read + publish."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..services.distribution import dispatch
from ..services.recruitment import log

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


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


@router.patch("/{job_id}", response_model=schemas.JobOut)
def update_job(job_id: int, body: schemas.JobUpdate, db: Session = Depends(get_db)):
    """Apply human edits to an AI-generated JD. Only the fields sent are changed."""
    job = db.get(models.Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    data = body.model_dump(exclude_unset=True)
    for key, val in data.items():
        if key in _JOB_LIST_FIELDS and isinstance(val, list):
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
