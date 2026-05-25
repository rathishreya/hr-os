"""Job (JD) read + publish."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
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
