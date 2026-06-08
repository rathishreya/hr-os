"""AI screening interview endpoints — start, answer (chat), fetch."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services import screening

router = APIRouter(prefix="/api/screening", tags=["screening"])


def _out(interview: models.ScreeningInterview) -> schemas.ScreeningOut:
    data = schemas.ScreeningOut.model_validate(interview)
    data.current_question = screening.current_question(interview)
    return data


@router.post("/start", response_model=schemas.ScreeningOut)
def start(req: schemas.StartScreeningRequest, db: Session = Depends(get_db)):
    app = db.get(models.Application, req.application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    interview = screening.start_interview(db, app)
    db.commit()
    db.refresh(interview)
    return _out(interview)


@router.post("/{interview_id}/answer", response_model=schemas.ScreeningOut)
def answer(interview_id: int, req: schemas.AnswerRequest, db: Session = Depends(get_db)):
    interview = db.get(models.ScreeningInterview, interview_id)
    if not interview:
        raise HTTPException(404, "Interview not found")
    if interview.status == "completed":
        raise HTTPException(409, "Interview already completed")
    screening.submit_answer(db, interview, req.answer)
    db.commit()
    db.refresh(interview)
    return _out(interview)


@router.get("/{interview_id}", response_model=schemas.ScreeningOut)
def get_interview(interview_id: int, db: Session = Depends(get_db)):
    interview = db.get(models.ScreeningInterview, interview_id)
    if not interview:
        raise HTTPException(404, "Interview not found")
    return _out(interview)


@router.get("", response_model=list[schemas.ScreeningOut])
def list_interviews(application_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(models.ScreeningInterview).order_by(models.ScreeningInterview.created_at.desc())
    if application_id:
        stmt = stmt.where(models.ScreeningInterview.application_id == application_id)
    return [_out(i) for i in db.scalars(stmt).all()]

