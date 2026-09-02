"""The onboarding module: the checklist a candidate is on, the session catalogue, and the calendar.

Three views, one set of definitions. The checklist steps and the session catalogue live in
services/onboarding as code because they are the People team's process rather than data anybody
types; what is stored here is a candidate's own answers, the sittings of each session, and who
came to them.

Everything is entity-scoped. A candidate's entity is settled by their first document
(services/documents/entity.py), and a step the spec removes for that entity is not returned at
all — the API does not hand the UI a field it must then know to hide.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import current_user
from ..services.documents import settled_entity
from ..services.onboarding import schedule, sessions as sess, steps as st
from ..services.recruitment import log

router = APIRouter(prefix="/api/onboarding-module", tags=["onboarding-module"])


# ── definitions ─────────────────────────────────────────────────────────────────────────────
@router.get("/definitions")
def definitions(_user: models.User = Depends(current_user)):
    """The checklist and the catalogue. The UI renders from this, so a step added here appears
    without a frontend deploy."""
    return {
        "phases": [{"id": p, "title": t} for p, t in st.PHASES],
        "statuses": list(st.STATUSES),
        "steps": [st.as_dict(s) for s in st.STEPS],
        "sessions": [sess.as_dict(s) for s in sess.CATALOGUE],
        "frequencies": [{"id": f, "label": lbl} for f, lbl in sess.FREQUENCIES],
        "modes": [{"id": m, "label": lbl} for m, lbl in sess.MODES],
    }


# ── view 1: the candidates on onboarding, and one candidate's checklist ─────────────────────
def _plan_entity(db: Session, plan: models.OnboardingPlan) -> str:
    return settled_entity(db, plan.candidate_id) or "EZ"


def _joining_of(db: Session, plan: models.OnboardingPlan) -> str:
    """The joining date, from their paperwork. Free text in this system, which is why every date
    helper here parses rather than assumes."""
    d = db.scalars(
        select(models.Document)
        .where(models.Document.candidate_id == plan.candidate_id)
        .order_by(models.Document.id)
    ).first()
    if d and (d.terms or {}).get("start_date"):
        return str(d.terms["start_date"])
    return str((plan.details or {}).get("joining_date") or "")


def _states(db: Session, plan_id: int) -> dict[str, models.OnboardingStepState]:
    rows = db.scalars(
        select(models.OnboardingStepState).where(models.OnboardingStepState.plan_id == plan_id)
    ).all()
    return {r.step_key: r for r in rows}


def _progress(entity: str, states: dict) -> dict:
    """Done over everything that still counts. NA is excluded from the denominator, because a step
    marked not-applicable is not work anybody is going to do."""
    # A step nobody has touched has no row at all, so read through a default rather than
    # indexing — the first candidate on a new checklist has none of them.
    def status_of(key: str) -> str:
        row = states.get(key)
        return row.status if row else "Pending"

    keys = [s.key for s in st.steps_for(entity) if s.kind != "derived"]
    counted = [k for k in keys if status_of(k) != "NA"]
    done = [k for k in counted if status_of(k) == "Done"]
    return {
        "total": len(keys), "counted": len(counted), "done": len(done),
        "percent": round(len(done) / len(counted) * 100) if counted else 0,
    }


@router.get("/board")
def board(db: Session = Depends(get_db), _user: models.User = Depends(current_user)):
    """Everyone on onboarding: where they are, and what is overdue. View 1's list."""
    today = date.today()
    out = []
    for plan in db.scalars(select(models.OnboardingPlan).order_by(models.OnboardingPlan.id.desc())):
        cand = db.get(models.Candidate, plan.candidate_id)
        entity = _plan_entity(db, plan)
        states = _states(db, plan.id)
        joining = _joining_of(db, plan)
        due = schedule.due_dates(joining, st.steps_for(entity))
        overdue = [
            k for k, d in due.items()
            if d < today and (states.get(k).status if states.get(k) else "Pending") != "Done"
        ]
        nxt = sorted([(d, k) for k, d in due.items()
                      if d >= today and (states.get(k).status if states.get(k) else "Pending") != "Done"])
        out.append({
            "plan_id": plan.id,
            "candidate_id": plan.candidate_id,
            "candidate_name": (cand.name if cand else "") or "",
            "email": (cand.email if cand else "") or "",
            "entity": entity,
            "role": plan.role_position or "",
            "joining_date": joining,
            "progress": _progress(entity, states),
            "overdue": len(overdue),
            "next_due": {"step": nxt[0][1], "on": nxt[0][0].isoformat()} if nxt else None,
            "status": plan.status,
        })
    return out


@router.get("/plan/{plan_id}")
def plan_detail(plan_id: int, db: Session = Depends(get_db), _user: models.User = Depends(current_user)):
    """One candidate's checklist: only the steps their entity has, each with its state and the
    working day it falls due."""
    plan = db.get(models.OnboardingPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Onboarding plan not found")
    cand = db.get(models.Candidate, plan.candidate_id)
    entity = _plan_entity(db, plan)
    states = _states(db, plan.id)
    joining = _joining_of(db, plan)
    due = schedule.due_dates(joining, st.steps_for(entity))
    today = date.today()

    rows = []
    for s in st.steps_for(entity):
        state = states.get(s.key)
        d = due.get(s.key)
        status = state.status if state else "Pending"
        rows.append({
            **st.as_dict(s),
            "status": status,
            "value": state.value if state else "",
            "comments": (state.comments if state else {}) or {},
            "attended": state.attended if state else None,
            "scheduled_at": state.scheduled_at if state else None,
            "sent_at": state.sent_at if state else None,
            "due_on": d.isoformat() if d else None,
            "overdue": bool(d and d < today and status != "Done"),
        })
    return {
        "plan_id": plan.id,
        "candidate_id": plan.candidate_id,
        "candidate_name": (cand.name if cand else "") or "",
        "email": (cand.email if cand else "") or "",
        "entity": entity,
        "role": plan.role_position or "",
        "joining_date": joining,
        "progress": _progress(entity, states),
        "steps": rows,
    }


class StepPatch(BaseModel):
    status: str | None = None
    value: str | None = None
    comments: dict | None = None
    attended: bool | None = None
    scheduled_at: datetime | None = None
    mark_sent: bool | None = None


@router.patch("/plan/{plan_id}/step/{step_key}")
def update_step(plan_id: int, step_key: str, body: StepPatch, db: Session = Depends(get_db),
                user: models.User = Depends(current_user)):
    plan = db.get(models.OnboardingPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Onboarding plan not found")
    step = st.BY_KEY.get(step_key)
    if not step:
        raise HTTPException(404, "No such step")
    entity = _plan_entity(db, plan)
    if entity not in step.entities:
        raise HTTPException(409, f"{step.label} does not apply to a {entity} candidate.")
    if body.status is not None and body.status not in st.STATUSES:
        raise HTTPException(422, f"status must be one of {list(st.STATUSES)}")

    row = db.scalar(
        select(models.OnboardingStepState)
        .where(models.OnboardingStepState.plan_id == plan_id,
               models.OnboardingStepState.step_key == step_key)
    )
    if not row:
        row = models.OnboardingStepState(plan_id=plan_id, step_key=step_key)
        db.add(row)

    if body.status is not None:
        row.status = body.status
    if body.value is not None:
        row.value = body.value
    if body.comments is not None:
        row.comments = dict(body.comments)
    if body.attended is not None:
        row.attended = body.attended
    if body.scheduled_at is not None:
        row.scheduled_at = body.scheduled_at
    if body.mark_sent:
        row.sent_at = datetime.now(timezone.utc)

    log(db, "onboarding.step_updated", "onboarding_plan", plan_id,
        {"step": step_key, "status": row.status, "by": getattr(user, "email", "")})
    db.commit()
    return plan_detail(plan_id, db=db, _user=user)


# ── view 3: the calendar of sittings ────────────────────────────────────────────────────────
def _occurrence_out(db: Session, o: models.SessionOccurrence) -> dict:
    d = sess.BY_KEY.get(o.session_key)
    people = db.scalars(
        select(models.SessionAttendee).where(models.SessionAttendee.occurrence_id == o.id)
    ).all()
    return {
        "id": o.id, "session_key": o.session_key,
        "name": d.name if d else o.session_key,
        "frequency": d.frequency if d else "",
        "entity": o.entity, "mode": o.mode, "location": o.location, "meet_link": o.meet_link,
        "starts_at": o.starts_at, "ends_at": o.ends_at, "status": o.status,
        "invites_sent_at": o.invites_sent_at, "notes": o.notes,
        "invite_due": (schedule.invite_date(o.starts_at, d.invite_weeks_before, d.invite_weekday).isoformat()
                       if d and o.starts_at else None),
        "attendees": [
            {"id": p.id, "candidate_id": p.candidate_id, "name": p.name, "email": p.email,
             "attended": p.attended, "feedback_sent_at": p.feedback_sent_at}
            for p in people
        ],
    }


@router.get("/occurrences")
def list_occurrences(entity: str | None = None, db: Session = Depends(get_db),
                     _user: models.User = Depends(current_user)):
    stmt = select(models.SessionOccurrence).order_by(models.SessionOccurrence.starts_at)
    if entity:
        stmt = stmt.where(models.SessionOccurrence.entity == entity.upper())
    return [_occurrence_out(db, o) for o in db.scalars(stmt).all()]


class OccurrenceIn(BaseModel):
    session_key: str
    entity: str = "EZ"
    starts_at: datetime
    ends_at: datetime | None = None
    mode: str | None = None
    location: str = ""
    meet_link: str = ""
    notes: str = ""


@router.post("/occurrences", status_code=201)
def create_occurrence(body: OccurrenceIn, db: Session = Depends(get_db),
                      user: models.User = Depends(current_user)):
    d = sess.BY_KEY.get(body.session_key)
    if not d:
        raise HTTPException(404, "No such session")
    entity = body.entity.upper()
    if entity not in d.entities:
        raise HTTPException(409, f"{d.name} does not run for {entity}.")
    o = models.SessionOccurrence(
        session_key=body.session_key, entity=entity, starts_at=body.starts_at,
        ends_at=body.ends_at, mode=body.mode or d.mode, location=body.location,
        meet_link=body.meet_link, notes=body.notes,
    )
    db.add(o)
    db.flush()
    log(db, "onboarding.session_scheduled", "session_occurrence", o.id,
        {"session": body.session_key, "entity": entity, "starts_at": body.starts_at.isoformat()})
    db.commit()
    db.refresh(o)
    return _occurrence_out(db, o)


class OccurrencePatch(BaseModel):
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    mode: str | None = None
    location: str | None = None
    meet_link: str | None = None
    status: str | None = None
    notes: str | None = None


@router.patch("/occurrences/{occ_id}")
def update_occurrence(occ_id: int, body: OccurrencePatch, db: Session = Depends(get_db),
                      user: models.User = Depends(current_user)):
    """Move or cancel a sitting. This is the reschedule the calendar view needs."""
    o = db.get(models.SessionOccurrence, occ_id)
    if not o:
        raise HTTPException(404, "Sitting not found")
    was = o.starts_at
    for f in ("starts_at", "ends_at", "mode", "location", "meet_link", "status", "notes"):
        v = getattr(body, f)
        if v is not None:
            setattr(o, f, v)
    if body.starts_at is not None and body.starts_at != was:
        log(db, "onboarding.session_rescheduled", "session_occurrence", o.id,
            {"from": was.isoformat() if was else None, "to": body.starts_at.isoformat(),
             "by": getattr(user, "email", "")})
    db.commit()
    db.refresh(o)
    return _occurrence_out(db, o)


class AttendeeIn(BaseModel):
    candidate_id: int | None = None
    name: str = ""
    email: str = ""


@router.post("/occurrences/{occ_id}/attendees", status_code=201)
def add_attendee(occ_id: int, body: AttendeeIn, db: Session = Depends(get_db),
                 _user: models.User = Depends(current_user)):
    if not db.get(models.SessionOccurrence, occ_id):
        raise HTTPException(404, "Sitting not found")
    p = models.SessionAttendee(occurrence_id=occ_id, candidate_id=body.candidate_id,
                               name=body.name, email=body.email)
    db.add(p)
    db.commit()
    return _occurrence_out(db, db.get(models.SessionOccurrence, occ_id))


class AttendancePatch(BaseModel):
    attended: bool


@router.patch("/attendees/{attendee_id}")
def mark_attendance(attendee_id: int, body: AttendancePatch, db: Session = Depends(get_db),
                    _user: models.User = Depends(current_user)):
    """Who turned up. The feedback mail goes by this, so it is per person and not a headcount."""
    p = db.get(models.SessionAttendee, attendee_id)
    if not p:
        raise HTTPException(404, "Attendee not found")
    p.attended = body.attended
    db.commit()
    return _occurrence_out(db, db.get(models.SessionOccurrence, p.occurrence_id))
