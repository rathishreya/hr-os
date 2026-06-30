"""Training & Placement Officer (TPO) directory — for campus hiring outreach."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services.recruitment import log

router = APIRouter(prefix="/api/tpos", tags=["tpos"])


@router.get("", response_model=list[schemas.TPOOut])
def list_tpos(db: Session = Depends(get_db)):
    return db.scalars(select(models.TPO).order_by(models.TPO.college, models.TPO.name)).all()


@router.post("", response_model=schemas.TPOOut, status_code=201)
def create_tpo(payload: schemas.TPOCreate, db: Session = Depends(get_db)):
    if not (payload.name or "").strip() and not (payload.college or "").strip():
        raise HTTPException(422, "A name or college is required.")
    tpo = models.TPO(
        kind=(payload.kind or "college").strip().lower() or "college",
        name=payload.name.strip(),
        college=payload.college.strip(),
        email=(payload.email or "").strip(),
        phone=(payload.phone or "").strip(),
        linkedin=(payload.linkedin or "").strip(),
        designation=(payload.designation or "").strip(),
        address=(payload.address or "").strip(),
        notes=(payload.notes or "").strip(),
    )
    db.add(tpo)
    db.flush()
    log(db, "tpo.created", "tpo", tpo.id, {"college": tpo.college})
    db.commit()
    db.refresh(tpo)
    return tpo


@router.patch("/{tpo_id}", response_model=schemas.TPOOut)
def update_tpo(tpo_id: int, payload: schemas.TPOUpdate, db: Session = Depends(get_db)):
    tpo = db.get(models.TPO, tpo_id)
    if not tpo:
        raise HTTPException(404, "TPO not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(tpo, k, (v or "").strip() if isinstance(v, str) else v)
    db.commit()
    db.refresh(tpo)
    return tpo


@router.delete("/{tpo_id}", status_code=204)
def delete_tpo(tpo_id: int, db: Session = Depends(get_db)):
    tpo = db.get(models.TPO, tpo_id)
    if not tpo:
        raise HTTPException(404, "TPO not found")
    db.delete(tpo)
    log(db, "tpo.deleted", "tpo", tpo_id, {})
    db.commit()
