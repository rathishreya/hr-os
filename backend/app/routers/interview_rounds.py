"""Interview planning — schedule rounds, panelists, slots, and capture feedback."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services.recruitment import log

router = APIRouter(prefix="/api/interview-rounds", tags=["interview-rounds"])

VALID_TYPES = {
    "phone_screen", "technical", "system_design", "cultural", "hr",
    "panel", "final", "assignment", "other",
}
VALID_STATUS = {"draft", "scheduled", "completed", "cancelled", "no_show"}


def _next_round_number(db: Session, application_id: int) -> int:
    rows = db.scalars(
        select(models.InterviewRound.round_number)
        .where(models.InterviewRound.application_id == application_id)
    ).all()
    return (max(rows) + 1) if rows else 1


@router.get("", response_model=list[schemas.InterviewRoundOut])
def list_rounds(application_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(models.InterviewRound).order_by(
        models.InterviewRound.round_number.asc(),
        models.InterviewRound.scheduled_at.asc(),
    )
    if application_id is not None:
        stmt = stmt.where(models.InterviewRound.application_id == application_id)
    return db.scalars(stmt).all()


@router.post("", response_model=schemas.InterviewRoundOut)
def create_round(body: schemas.InterviewRoundCreate, db: Session = Depends(get_db)):
    app = db.get(models.Application, body.application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    itype = body.interview_type if body.interview_type in VALID_TYPES else "other"
    status = body.status if body.status in VALID_STATUS else "scheduled"
    round_no = body.round_number if body.round_number > 0 else _next_round_number(db, body.application_id)

    row = models.InterviewRound(
        application_id=body.application_id,
        round_number=round_no,
        interview_type=itype,
        status=status,
        scheduled_at=body.scheduled_at.strip(),
        duration_minutes=max(15, min(body.duration_minutes, 480)),
        panelists=[p.strip() for p in body.panelists if p and str(p).strip()],
        location_or_link=body.location_or_link.strip(),
        notes=body.notes.strip(),
        feedback=body.feedback.strip(),
    )
    db.add(row)
    db.flush()
    log(db, "interview.round_created", "interview_round", row.id, {
        "application_id": body.application_id,
        "round": round_no,
        "type": itype,
    })
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{round_id}", response_model=schemas.InterviewRoundOut)
def update_round(round_id: int, body: schemas.InterviewRoundUpdate, db: Session = Depends(get_db)):
    row = db.get(models.InterviewRound, round_id)
    if not row:
        raise HTTPException(404, "Interview round not found")
    data = body.model_dump(exclude_unset=True)
    if "interview_type" in data and data["interview_type"] not in VALID_TYPES:
        data["interview_type"] = "other"
    if "status" in data and data["status"] not in VALID_STATUS:
        data.pop("status")
    if "panelists" in data:
        data["panelists"] = [p.strip() for p in data["panelists"] if p and str(p).strip()]
    if "duration_minutes" in data:
        data["duration_minutes"] = max(15, min(data["duration_minutes"], 480))
    for key, val in data.items():
        setattr(row, key, val.strip() if isinstance(val, str) else val)
    row.updated_at = datetime.now(timezone.utc)
    log(db, "interview.round_updated", "interview_round", row.id, {"fields": list(data.keys())})
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{round_id}", status_code=204)
def delete_round(round_id: int, db: Session = Depends(get_db)):
    row = db.get(models.InterviewRound, round_id)
    if not row:
        raise HTTPException(404, "Interview round not found")
    log(db, "interview.round_deleted", "interview_round", row.id, {"application_id": row.application_id})
    db.delete(row)
    db.commit()
