"""Onboarding — EZ Lab 100-day phased tracker + checklist tracking for hired candidates."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services import onboarding_template
from ..services.recruitment import log

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


def _seed_details(app: models.Application) -> dict:
    """Autofill the hire-detail fields from candidate + role; HR fills the rest on the tracker."""
    hr = app.hiring_request
    cand = app.candidate
    return {
        "entity": "EZ",
        "status": "Onboarding",
        "compensation": (hr.budget_ctc if hr else "") or "",
        "location": (hr.location if hr else "") or "",
        "department": (hr.department if hr else "") or "",
        "email": (cand.email if cand else "") or "",
        "contact": (cand.phone if cand else "") or "",
        "joining_date": "",
        "reporting_manager": "",
        "approving_manager": "",
    }


def _enrich_plan(db: Session, p: models.OnboardingPlan) -> None:
    cand = db.get(models.Candidate, p.candidate_id)
    app = db.get(models.Application, p.application_id) if p.application_id else None
    hr = app.hiring_request if app else None
    d = p.details or {}
    p.candidate_name = cand.name if cand else ""
    p.email = d.get("email") or (cand.email if cand else "")
    p.contact = d.get("contact") or (cand.phone if cand else "")
    p.position = p.role_position or (hr.position if hr else "")
    p.department = d.get("department") or (hr.department if hr else "")


@router.post("/generate", response_model=schemas.OnboardingOut)
def generate(req: schemas.GenerateOnboardingRequest, db: Session = Depends(get_db)):
    app = db.get(models.Application, req.application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    # Idempotent: one tracker per application. Return the existing plan rather than creating a
    # duplicate (which would orphan checked-off tasks + HR-filled details).
    existing = db.scalars(
        select(models.OnboardingPlan)
        .where(models.OnboardingPlan.application_id == app.id)
        .order_by(models.OnboardingPlan.created_at.desc())
        .limit(1)
    ).first()
    if existing:
        _enrich_plan(db, existing)
        return existing
    hr = app.hiring_request
    plan = models.OnboardingPlan(
        application_id=app.id,
        candidate_id=app.candidate_id,
        role_position=hr.position if hr else "",
        tasks=onboarding_template.build_tasks(),
        induction=[],
        tools=[],
        buddy="",
        details=_seed_details(app),
        ai_provider="template",
    )
    db.add(plan)
    db.flush()
    log(db, "onboarding.generated", "onboarding", plan.id, {"application_id": app.id, "tasks": len(plan.tasks)})
    db.commit()
    db.refresh(plan)
    _enrich_plan(db, plan)
    return plan


@router.get("", response_model=list[schemas.OnboardingOut])
def list_plans(application_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(models.OnboardingPlan).order_by(models.OnboardingPlan.created_at.desc())
    if application_id:
        stmt = stmt.where(models.OnboardingPlan.application_id == application_id)
    plans = db.scalars(stmt).all()
    for p in plans:
        _enrich_plan(db, p)
    return plans


@router.get("/{plan_id}", response_model=schemas.OnboardingOut)
def get_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.get(models.OnboardingPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Onboarding plan not found")
    _enrich_plan(db, plan)
    return plan


@router.patch("/{plan_id}/task", response_model=schemas.OnboardingOut)
def toggle_task(plan_id: int, body: schemas.ToggleTaskRequest, db: Session = Depends(get_db)):
    plan = db.get(models.OnboardingPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Onboarding plan not found")
    tasks = [dict(t) for t in (plan.tasks or [])]
    for t in tasks:
        if t.get("id") == body.task_id:
            t["done"] = body.done
    plan.tasks = tasks  # reassign so SQLAlchemy detects the JSON change
    db.commit()
    db.refresh(plan)
    _enrich_plan(db, plan)
    return plan


@router.patch("/{plan_id}/details", response_model=schemas.OnboardingOut)
def update_details(plan_id: int, body: schemas.UpdateOnboardingDetailsRequest, db: Session = Depends(get_db)):
    """Update the HR-filled hire details shown on the tracker (entity, compensation, managers, ...)."""
    plan = db.get(models.OnboardingPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Onboarding plan not found")
    plan.details = {**(plan.details or {}), **(body.details or {})}
    log(db, "onboarding.details_updated", "onboarding", plan.id, {"keys": sorted((body.details or {}).keys())})
    db.commit()
    db.refresh(plan)
    _enrich_plan(db, plan)
    return plan
