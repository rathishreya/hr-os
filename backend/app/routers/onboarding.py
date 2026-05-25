"""Onboarding — AI-generated plan + checklist tracking for hired candidates."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services.ai import ai
from ..services.recruitment import log

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


@router.post("/generate", response_model=schemas.OnboardingOut)
def generate(req: schemas.GenerateOnboardingRequest, db: Session = Depends(get_db)):
    app = db.get(models.Application, req.application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    hr = app.hiring_request
    cand = app.candidate
    ctx = {
        "candidate_name": cand.name or "the new hire",
        "position": hr.position,
        "department": hr.department,
        "work_mode": hr.work_mode,
        "skills": (cand.parsed or {}).get("skills", []),
    }
    result, provider = ai.generate_onboarding(ctx)
    tasks = [
        {"id": i, "title": t.get("title", ""), "category": t.get("category", ""),
         "owner": t.get("owner", ""), "done": False}
        for i, t in enumerate(result.get("tasks", []))
    ]
    plan = models.OnboardingPlan(
        application_id=app.id,
        candidate_id=app.candidate_id,
        role_position=hr.position,
        tasks=tasks,
        induction=result.get("induction", []),
        tools=result.get("tools", []),
        buddy=result.get("buddy", ""),
        ai_provider=provider,
    )
    db.add(plan)
    db.flush()
    log(db, "onboarding.generated", "onboarding", plan.id, {"provider": provider, "application_id": app.id, "tasks": len(tasks)})
    db.commit()
    db.refresh(plan)
    return plan


@router.get("", response_model=list[schemas.OnboardingOut])
def list_plans(application_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(models.OnboardingPlan).order_by(models.OnboardingPlan.created_at.desc())
    if application_id:
        stmt = stmt.where(models.OnboardingPlan.application_id == application_id)
    return db.scalars(stmt).all()


@router.get("/{plan_id}", response_model=schemas.OnboardingOut)
def get_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.get(models.OnboardingPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Onboarding plan not found")
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
    return plan
