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

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import current_user
from ..services import mailer
from ..services.documents import settled_entity
from ..services.onboarding import (
    audience as aud, context as ctxs, mails as ml, schedule, sessions as sess, steps as st,
)
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
        "mails": [ml.as_dict(t) for t in ml.TEMPLATES],
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


def _states_for(db: Session, plan_ids: list[int]) -> dict[int, dict[str, models.OnboardingStepState]]:
    """The same thing for many plans in one query, for the views that read every plan at once."""
    if not plan_ids:
        return {}
    out: dict[int, dict[str, models.OnboardingStepState]] = {}
    for r in db.scalars(select(models.OnboardingStepState)
                        .where(models.OnboardingStepState.plan_id.in_(plan_ids))):
        out.setdefault(r.plan_id, {})[r.step_key] = r
    return out


#: checklist step key -> session key, for the sessions that appear on a joiner's checklist.
_STEP_TO_SESSION = {d.step_key: d.key for d in sess.CATALOGUE if d.step_key}


def _sittings_for(db: Session, candidate_id: int) -> dict[str, dict]:
    """The sitting each session step refers to, for one candidate, keyed by step.

    A session can run many times; the one that matters to a joiner is the one they were invited to.
    Where they are on more than one, the next one still to come wins, falling back to the most
    recent that has already happened, because after the event the question changes from "when is
    it" to "did they go".
    """
    rows = db.execute(
        select(models.SessionAttendee, models.SessionOccurrence)
        .join(models.SessionOccurrence,
              models.SessionOccurrence.id == models.SessionAttendee.occurrence_id)
        .where(models.SessionAttendee.candidate_id == candidate_id)
    ).all()
    now = datetime.now()
    best: dict[str, tuple] = {}
    for attendee, occ in rows:
        key = occ.session_key
        current = best.get(key)
        if current is None:
            best[key] = (attendee, occ)
            continue
        _prev_a, prev = current
        # Prefer an upcoming sitting; among upcoming take the soonest, among past take the latest.
        prev_future = bool(prev.starts_at and prev.starts_at >= now)
        this_future = bool(occ.starts_at and occ.starts_at >= now)
        if this_future and not prev_future:
            best[key] = (attendee, occ)
        elif this_future == prev_future and occ.starts_at and prev.starts_at:
            better = occ.starts_at < prev.starts_at if this_future else occ.starts_at > prev.starts_at
            if better:
                best[key] = (attendee, occ)

    out: dict[str, dict] = {}
    for step_key, session_key in _STEP_TO_SESSION.items():
        found = best.get(session_key)
        if not found:
            continue
        attendee, occ = found
        d = sess.BY_KEY.get(session_key)
        out[step_key] = {
            "occurrence_id": occ.id,
            "session_key": session_key,
            "session_name": d.name if d else session_key,
            "starts_at": occ.starts_at,
            "mode": occ.mode,
            "location": occ.location,
            "meet_link": occ.meet_link,
            "invites_sent_at": occ.invites_sent_at,
            "attended": attendee.attended,
            "attendee_id": attendee.id,
        }
    return out


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
    plans = list(db.scalars(select(models.OnboardingPlan).order_by(models.OnboardingPlan.id.desc())))
    prefetched = ctxs.bulk_contexts(db, plans)
    all_states = _states_for(db, [p.id for p in plans])
    for plan in plans:
        pre = prefetched.get(plan.id) or {}
        cand = pre.get("candidate")
        entity = pre.get("entity") or "EZ"
        states = all_states.get(plan.id, {})
        joining = pre.get("joining") or ""
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
    sittings = _sittings_for(db, plan.candidate_id)
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
            # When this step is a session, the sitting on the calendar is where its date lives.
            "sitting": sittings.get(s.key),
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
        # Attendance is recorded in two places by nature: on the checklist a person is walking
        # down, and on the sitting's register. Writing only one of them is how they end up
        # disagreeing about whether somebody turned up, so a tick here reaches both.
        sitting = _sittings_for(db, plan.candidate_id).get(step_key)
        if sitting:
            attendee = db.get(models.SessionAttendee, sitting["attendee_id"])
            if attendee:
                attendee.attended = body.attended
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


# ── the mails ───────────────────────────────────────────────────────────────────────────────
# Nothing here sends by itself. Every mail is drafted, shown, and sent by a person pressing send.
# A step the checklist marks as automatic is one the People team decided needs no judgement, so it
# is queued ready-to-go rather than waiting for someone to compose it. The send is still theirs.

def _plan_mail_context(db: Session, plan: models.OnboardingPlan) -> tuple[dict, str]:
    joining = _joining_of(db, plan)
    mode = ctxs.work_mode(db, plan)
    return ctxs.merge_context(db, plan, joining=joining), mode


#: Merge fields a session mail fills per person as it goes out, rather than once in the draft.
PER_RECIPIENT = {"Name"}


def _sent_map(state) -> dict:
    return (state.sent_mails if state else {}) or {}


@router.get("/plan/{plan_id}/mails")
def plan_mails(plan_id: int, db: Session = Depends(get_db),
               _user: models.User = Depends(current_user)):
    """Every mail this candidate's checklist sends, in checklist order, with what is still missing
    from each. The UI opens one, reads it, and sends it."""
    plan = db.get(models.OnboardingPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Onboarding plan not found")
    cand = db.get(models.Candidate, plan.candidate_id)
    entity = _plan_entity(db, plan)
    states = _states(db, plan.id)
    ctx, mode = _plan_mail_context(db, plan)
    due = schedule.due_dates(_joining_of(db, plan), st.steps_for(entity))
    today = date.today()

    rows = []
    for s in st.steps_for(entity):
        for t in ml.for_step(s.key, mode):
            sent = _sent_map(states.get(s.key)).get(t.key)
            d = due.get(s.key)
            missing = ml.unfilled(t.subject + "\n" + t.body, ctx)
            rows.append({
                "template_key": t.key, "name": t.name, "to": t.to, "mode": t.mode,
                "step_key": s.key, "step_label": s.label,
                "sending": "auto" if s.auto else "hr",
                "due_on": d.isoformat() if d else None,
                "sent_at": sent,
                "missing": missing,
                "state": ("Sent" if sent else
                          "Overdue" if d and d < today else
                          "Due" if d and d == today else "Waiting"),
            })
    return {"plan_id": plan.id, "candidate": (cand.name if cand else "") or "",
            "entity": entity, "mode": mode, "mails": rows}


@router.get("/plan/{plan_id}/mails/{template_key}")
def mail_draft(plan_id: int, template_key: str, db: Session = Depends(get_db),
               _user: models.User = Depends(current_user)):
    """The draft exactly as it will go out. Read it, change what you want, then send it."""
    plan = db.get(models.OnboardingPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Onboarding plan not found")
    t = ml.BY_KEY.get(template_key)
    if not t:
        raise HTTPException(404, "No such mail template")
    ctx, _mode = _plan_mail_context(db, plan)
    to_email, to_name = ctxs.recipient(db, plan, t.to, ctx)
    state = _states(db, plan.id).get(t.step_key or "")
    return {
        "template_key": t.key, "name": t.name, "to_role": t.to,
        "to": to_email, "to_name": to_name,
        "cc": ctxs.cc_list(ctx, t.cc),
        "subject": ml.render(t.subject, ctx),
        "body": ml.render(t.body, ctx),
        "missing": ml.unfilled(t.subject + "\n" + t.body, ctx),
        "sent_at": _sent_map(state).get(t.key),
        "note": t.note,
    }


def _record_sent(db: Session, plan_id: int, t, mode: str) -> None:
    """Mark one mail as gone against its step, so the checklist and the queues never disagree.

    Shared by the single send and the bulk send: two copies of this would drift, and the thing
    they would drift about is whether somebody gets the same mail twice.
    """
    if not t.step_key:
        return
    row = db.scalar(
        select(models.OnboardingStepState)
        .where(models.OnboardingStepState.plan_id == plan_id,
               models.OnboardingStepState.step_key == t.step_key)
    )
    if not row:
        row = models.OnboardingStepState(plan_id=plan_id, step_key=t.step_key)
        db.add(row)
    stamp = datetime.now(timezone.utc)
    row.sent_mails = {**(row.sent_mails or {}), t.key: stamp.isoformat()}
    row.sent_at = stamp
    # Only the LAST mail on a step completes it. The ISO step is not done when the course
    # credentials go out; it is done when the quiz has gone too.
    remaining = [x for x in ml.for_step(t.step_key, mode) if x.key not in (row.sent_mails or {})]
    if not remaining and row.status != "Done":
        row.status = "Done"


class MailSend(BaseModel):
    subject: str
    body: str
    to: str | None = None
    cc: list[str] | None = None


@router.post("/plan/{plan_id}/mails/{template_key}/send")
def send_mail(plan_id: int, template_key: str, payload: MailSend, db: Session = Depends(get_db),
              user: models.User = Depends(current_user)):
    plan = db.get(models.OnboardingPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Onboarding plan not found")
    t = ml.BY_KEY.get(template_key)
    if not t:
        raise HTTPException(404, "No such mail template")
    ctx, mode = _plan_mail_context(db, plan)
    default_to, to_name = ctxs.recipient(db, plan, t.to, ctx)
    to_email = (payload.to or default_to or "").strip()
    if not to_email:
        raise HTTPException(422, f"No address on file for the {t.to}. Add one before sending this.")

    msg = mailer.compose(
        db, to_email=to_email, to_name=to_name,
        template=f"onboarding:{t.key}",
        subject=payload.subject, body=payload.body,
        cc=payload.cc if payload.cc is not None else ctxs.cc_list(ctx, t.cc),
        candidate_id=plan.candidate_id, application_id=plan.application_id,
        sender_user=user,
    )

    _record_sent(db, plan_id, t, mode)

    log(db, "onboarding.mail_sent", "onboarding_plan", plan_id,
        {"template": t.key, "to": to_email, "by": getattr(user, "email", "")})
    db.commit()
    return {"ok": True, "email_id": msg.id, "status": msg.status, "to": to_email}


@router.get("/occurrences/{occ_id}/mails/{template_key}")
def session_mail_draft(occ_id: int, template_key: str, db: Session = Depends(get_db),
                       _user: models.User = Depends(current_user)):
    """A session mail, with the sitting's own date and time filled in. One draft goes to everyone
    who was invited, so the preview shows the list rather than a single address."""
    occ = db.get(models.SessionOccurrence, occ_id)
    if not occ:
        raise HTTPException(404, "No such sitting")
    t = ml.BY_KEY.get(template_key)
    if not t or t.session_key != occ.session_key:
        raise HTTPException(404, "That mail does not belong to this session")
    ctx = ctxs.session_context(occ)
    people = db.scalars(
        select(models.SessionAttendee).where(models.SessionAttendee.occurrence_id == occ.id)
    ).all()
    # The feedback mail goes only to the people who actually came; the invite goes to everyone.
    wanted = people if t.session_role == "invite" else [p for p in people if p.attended]
    return {
        "template_key": t.key, "name": t.name, "session": occ.session_key,
        "recipients": [{"id": p.id, "name": p.name, "email": p.email, "attended": p.attended}
                       for p in wanted if p.email],
        "subject": ml.render(t.subject, ctx),
        "body": ml.render(t.body, ctx),
        # {{Name}} is filled per person as the mail goes out, so it is not something HR supplies
        # here. Listing it as missing would send them hunting for a field that does not exist.
        "missing": [f for f in ml.unfilled(t.subject + "\n" + t.body, ctx)
                    if f not in PER_RECIPIENT],
        "per_recipient": sorted(PER_RECIPIENT),
        "sent_at": occ.invites_sent_at if t.session_role == "invite" else None,
        "note": t.note,
    }


@router.post("/occurrences/{occ_id}/mails/{template_key}/send")
def send_session_mail(occ_id: int, template_key: str, payload: MailSend,
                      db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    occ = db.get(models.SessionOccurrence, occ_id)
    if not occ:
        raise HTTPException(404, "No such sitting")
    t = ml.BY_KEY.get(template_key)
    if not t or t.session_key != occ.session_key:
        raise HTTPException(404, "That mail does not belong to this session")
    people = db.scalars(
        select(models.SessionAttendee).where(models.SessionAttendee.occurrence_id == occ.id)
    ).all()
    wanted = people if t.session_role == "invite" else [p for p in people if p.attended]
    wanted = [p for p in wanted if (p.email or "").strip()]
    if not wanted:
        raise HTTPException(422, "Nobody on this sitting has an address to send to.")

    stamp = datetime.now(timezone.utc)
    sent = 0
    for p in wanted:
        # One draft, many people: the greeting is filled in for each of them rather than going out
        # as a literal {{Name}}, which is the whole point of not treating this as a single mail.
        person = {"Name": p.name or ""}
        mailer.compose(
            db, to_email=p.email, to_name=p.name or "",
            template=f"onboarding:{t.key}",
            subject=ml.render(payload.subject, person),
            body=ml.render(payload.body, person),
            candidate_id=p.candidate_id, sender_user=user,
        )
        sent += 1
        if t.session_role != "invite":
            p.feedback_sent_at = stamp
    if t.session_role == "invite":
        occ.invites_sent_at = stamp
    log(db, "onboarding.session_mail_sent", "session_occurrence", occ.id,
        {"template": t.key, "count": sent, "by": getattr(user, "email", "")})
    db.commit()
    return {"ok": True, "sent": sent}


@router.get("/mails")
def all_mails(db: Session = Depends(get_db), _user: models.User = Depends(current_user)):
    """Every onboarding mail in the system in one place: the ones that draft themselves, the ones
    a person writes, who each is for, when it falls due, and whether it has gone.

    This is the answer to "what is about to go out in my name" — a question nobody should have to
    open twelve candidates to answer."""
    today = date.today()
    rows = []

    # Everything about every plan up front. Asked one plan at a time this cost about thirteen
    # queries per joiner and grew linearly, which against a database across the internet is the
    # difference between a page that opens and one that hangs.
    plans = list(db.scalars(select(models.OnboardingPlan).order_by(models.OnboardingPlan.id.desc())))
    prefetched = ctxs.bulk_contexts(db, plans)
    all_states = _states_for(db, [p.id for p in plans])

    for plan in plans:
        pre = prefetched.get(plan.id) or {}
        cand = pre.get("candidate")
        entity = pre.get("entity") or "EZ"
        states = all_states.get(plan.id, {})
        ctx, mode = pre.get("ctx") or {}, pre.get("mode") or ml.CAMPUS
        due = schedule.due_dates(pre.get("joining") or "", st.steps_for(entity))
        for s in st.steps_for(entity):
            for t in ml.for_step(s.key, mode):
                sent = _sent_map(states.get(s.key)).get(t.key)
                d = due.get(s.key)
                rows.append({
                    "kind": "Candidate",
                    "template_key": t.key, "name": t.name,
                    "sending": "Automatic" if s.auto else "HR reviews",
                    "to": t.to, "entity": entity, "mode": t.mode,
                    "who": (cand.name if cand else "") or "",
                    "plan_id": plan.id, "occurrence_id": None,
                    "step_key": s.key, "step_label": s.label,
                    "due_on": d.isoformat() if d else None,
                    "sent_at": sent,
                    "state": ("Sent" if sent else
                              "Overdue" if d and d < today else
                              "Due today" if d and d == today else "Waiting"),
                    "missing": ml.unfilled(t.subject + "\n" + t.body, ctx),
                })

    for occ in db.scalars(select(models.SessionOccurrence).order_by(models.SessionOccurrence.starts_at)):
        d = sess.BY_KEY.get(occ.session_key)
        if not d:
            continue
        invite_on = schedule.invite_date(occ.starts_at, d.invite_weeks_before, d.invite_weekday)
        for t in ml.for_session(occ.session_key, occ.mode or ml.CAMPUS):
            is_invite = t.session_role == "invite"
            on = invite_on if is_invite else (occ.starts_at.date() if occ.starts_at else None)
            sent = occ.invites_sent_at if is_invite else None
            rows.append({
                "kind": "Session",
                "template_key": t.key, "name": t.name,
                # A session mail goes to a room full of people, so it always gets read first.
                "sending": "HR reviews",
                "to": t.to, "entity": occ.entity, "mode": t.mode,
                "who": d.name,
                "plan_id": None, "occurrence_id": occ.id,
                "step_key": None, "step_label": ml.BY_KEY[t.key].session_role or "",
                "due_on": on.isoformat() if on else None,
                "sent_at": sent,
                "state": ("Sent" if sent else
                          "Overdue" if on and on < today else
                          "Due today" if on and on == today else "Waiting"),
                "missing": [],
            })
    return rows


# ── doing the same thing to several at once ─────────────────────────────────────────────────
# Sending one mail to six joiners is one decision, not six, and moving a week of sittings after a
# room change is one decision too. What is NOT shared is the text: each joiner's copy is rendered
# from their own paperwork, so a bulk send is six personal mails, never one mail with six people
# on it. The preview shows one of them so nobody sends blind.

class BulkMail(BaseModel):
    plan_ids: list[int]
    template_key: str


@router.post("/mails/bulk-preview")
def bulk_mail_preview(payload: BulkMail, db: Session = Depends(get_db),
                      _user: models.User = Depends(current_user)):
    """What a bulk send would do: who it reaches, who it cannot, and one real draft to read.

    The sample is a genuine rendered draft for the first recipient, not a template with the tokens
    left in, because the point of reading before sending is to see what a person will actually get.
    """
    t = ml.BY_KEY.get(payload.template_key)
    if not t:
        raise HTTPException(404, "No such mail template")
    plans = list(db.scalars(select(models.OnboardingPlan)
                            .where(models.OnboardingPlan.id.in_(payload.plan_ids or []))))
    prefetched = ctxs.bulk_contexts(db, plans)

    recipients, skipped, sample = [], [], None
    for plan in plans:
        pre = prefetched.get(plan.id) or {}
        ctx, mode, entity = pre.get("ctx") or {}, pre.get("mode"), pre.get("entity") or "EZ"
        name = ctx.get("Name") or (pre.get("candidate").name if pre.get("candidate") else "")

        # A step the entity does not have is a mail that does not exist for that person.
        step = st.BY_KEY.get(t.step_key or "")
        if step and entity not in step.entities:
            skipped.append({"plan_id": plan.id, "name": name,
                            "why": f"{step.label} is not part of {entity} onboarding"})
            continue
        # The in-campus copy must not go to a remote joiner.
        if t.mode != ml.BOTH and t.mode != mode:
            other = [x for x in ml.for_step(t.step_key or "", mode) if x.key != t.key]
            skipped.append({"plan_id": plan.id, "name": name,
                            "why": f"works {mode}, so they get "
                                   + (other[0].name if other else "the other version")})
            continue
        to_email, to_name = ctxs.recipient(db, plan, t.to, ctx)
        if not to_email:
            skipped.append({"plan_id": plan.id, "name": name,
                            "why": f"no address on file for the {t.to}"})
            continue

        already = _sent_map(_states(db, plan.id).get(t.step_key or "")).get(t.key)
        recipients.append({"plan_id": plan.id, "name": name, "to": to_email,
                           "to_name": to_name, "sent_at": already,
                           "missing": ml.unfilled(t.subject + "\n" + t.body, ctx)})
        if sample is None:
            sample = {"for": name, "to": to_email,
                      "cc": ctxs.cc_list(ctx, t.cc),
                      "subject": ml.render(t.subject, ctx),
                      "body": ml.render(t.body, ctx)}

    return {"template_key": t.key, "name": t.name, "to_role": t.to,
            "recipients": recipients, "skipped": skipped, "sample": sample}


@router.post("/mails/bulk-send")
def bulk_mail_send(payload: BulkMail, db: Session = Depends(get_db),
                   user: models.User = Depends(current_user)):
    """Send one template to several joiners, each rendered from their own details."""
    preview = bulk_mail_preview(payload, db=db, _user=user)
    t = ml.BY_KEY[payload.template_key]
    sent, failed = [], []

    for r in preview["recipients"]:
        plan = db.get(models.OnboardingPlan, r["plan_id"])
        if not plan:
            continue
        ctx, mode = _plan_mail_context(db, plan)
        try:
            mailer.compose(
                db, to_email=r["to"], to_name=r["to_name"],
                template=f"onboarding:{t.key}",
                subject=ml.render(t.subject, ctx), body=ml.render(t.body, ctx),
                cc=ctxs.cc_list(ctx, t.cc),
                candidate_id=plan.candidate_id, application_id=plan.application_id,
                sender_user=user,
            )
        except Exception as e:                      # one bad address must not stop the other five
            failed.append({"plan_id": plan.id, "name": r["name"], "error": str(e)[:200]})
            continue
        _record_sent(db, plan.id, t, mode)
        sent.append({"plan_id": plan.id, "name": r["name"], "to": r["to"]})

    log(db, "onboarding.bulk_mail_sent", "onboarding_plan", 0,
        {"template": t.key, "sent": len(sent), "failed": len(failed),
         "by": getattr(user, "email", "")})
    db.commit()
    return {"sent": sent, "failed": failed, "skipped": preview["skipped"]}


class BulkOccurrenceMail(BaseModel):
    occurrence_ids: list[int]
    session_role: str = "invite"


@router.post("/occurrences/bulk-mail")
def bulk_session_mail(payload: BulkOccurrenceMail, db: Session = Depends(get_db),
                      user: models.User = Depends(current_user)):
    """Send the same part of the mail run for several sittings: every invite still to go out."""
    occs = list(db.scalars(select(models.SessionOccurrence)
                           .where(models.SessionOccurrence.id.in_(payload.occurrence_ids or []))))
    done, skipped = [], []
    stamp = datetime.now(timezone.utc)

    for occ in occs:
        d = sess.BY_KEY.get(occ.session_key)
        templates = [t for t in ml.for_session(occ.session_key, occ.mode or ml.CAMPUS)
                     if t.session_role == payload.session_role]
        if not templates:
            skipped.append({"id": occ.id, "name": d.name if d else occ.session_key,
                            "why": f"has no {payload.session_role} mail"})
            continue
        t = templates[0]
        ctx = ctxs.session_context(occ)
        people = db.scalars(
            select(models.SessionAttendee).where(models.SessionAttendee.occurrence_id == occ.id)
        ).all()
        wanted = people if t.session_role == "invite" else [p for p in people if p.attended]
        wanted = [p for p in wanted if (p.email or "").strip()]
        if not wanted:
            skipped.append({"id": occ.id, "name": d.name if d else occ.session_key,
                            "why": "nobody to send to"})
            continue

        subject, body = ml.render(t.subject, ctx), ml.render(t.body, ctx)
        for p in wanted:
            person = {"Name": p.name or ""}
            mailer.compose(db, to_email=p.email, to_name=p.name or "",
                           template=f"onboarding:{t.key}",
                           subject=ml.render(subject, person), body=ml.render(body, person),
                           candidate_id=p.candidate_id, sender_user=user)
            if t.session_role != "invite":
                p.feedback_sent_at = stamp
        if t.session_role == "invite":
            occ.invites_sent_at = stamp
        done.append({"id": occ.id, "name": d.name if d else occ.session_key, "count": len(wanted)})

    log(db, "onboarding.bulk_session_mail", "session_occurrence", 0,
        {"role": payload.session_role, "sittings": len(done), "by": getattr(user, "email", "")})
    db.commit()
    return {"sent": done, "skipped": skipped}


class BulkReschedule(BaseModel):
    occurrence_ids: list[int]
    #: Either move every sitting by this many days, or put them all on this date and keep the time.
    shift_days: int | None = None
    move_to: date | None = None


@router.post("/occurrences/bulk-reschedule")
def bulk_reschedule(payload: BulkReschedule, db: Session = Depends(get_db),
                    user: models.User = Depends(current_user)):
    """Move several sittings at once, keeping the time of day.

    Shifting by days is the common case: the room went, so the whole week slides. Moving to one
    date collapses several onto a single day, which is what happens when sessions are combined.
    """
    if payload.shift_days is None and payload.move_to is None:
        raise HTTPException(422, "Say how far to move them: shift_days, or a date in move_to.")
    occs = list(db.scalars(select(models.SessionOccurrence)
                           .where(models.SessionOccurrence.id.in_(payload.occurrence_ids or []))))
    moved = []
    for occ in occs:
        if not occ.starts_at:
            continue
        was = occ.starts_at
        length = (occ.ends_at - occ.starts_at) if occ.ends_at else timedelta(hours=1)
        if payload.shift_days is not None:
            occ.starts_at = was + timedelta(days=payload.shift_days)
        else:
            occ.starts_at = datetime.combine(payload.move_to, was.time())
        occ.ends_at = occ.starts_at + length
        # The invite was written for the old date, so it has to go again.
        occ.invites_sent_at = None
        d = sess.BY_KEY.get(occ.session_key)
        moved.append({"id": occ.id, "name": d.name if d else occ.session_key,
                      "was": was.isoformat(), "now": occ.starts_at.isoformat(),
                      "invite_due": (schedule.invite_date(occ.starts_at, d.invite_weeks_before,
                                                          d.invite_weekday).isoformat()
                                     if d else None)})

    log(db, "onboarding.bulk_reschedule", "session_occurrence", 0,
        {"count": len(moved), "shift_days": payload.shift_days,
         "move_to": payload.move_to.isoformat() if payload.move_to else None,
         "by": getattr(user, "email", "")})
    db.commit()
    return {"moved": moved}


# ── who a mail goes to ──────────────────────────────────────────────────────────────────────
# A joiner's welcome letter has one reader. A POSH briefing or a Pulse Survey goes to the room, or
# to the whole company, which is why an audience is a RULE ("everyone with a login") rather than a
# frozen list of names. It resolves at the moment of sending, and the composer shows the resolved
# names first so nobody presses send on a number they have not looked at.

@router.get("/audiences")
def audiences(occurrence_id: int | None = None, db: Session = Depends(get_db),
              _user: models.User = Depends(current_user)):
    """The groups a mail can be addressed to, each with how many people it reaches right now."""
    saved = [
        {"id": g.id, "name": g.name, "note": g.note, "count": len(g.members or [])}
        for g in db.scalars(select(models.RecipientGroup).order_by(models.RecipientGroup.name))
    ]
    return {"groups": aud.catalogue(db, occurrence_id), "saved": saved}


class AudienceSpec(BaseModel):
    groups: list[str] = []
    saved: list[int] = []
    emails: list[str] = []


@router.post("/audiences/preview")
def audience_preview(spec: AudienceSpec, occurrence_id: int | None = None,
                     db: Session = Depends(get_db), _user: models.User = Depends(current_user)):
    """The actual people an audience reaches, deduplicated, each saying which list named them."""
    people = aud.resolve(db, spec.model_dump(), occurrence_id)
    return {"count": len(people), "people": people}


class GroupIn(BaseModel):
    name: str
    note: str = ""
    members: list[dict] = []          # [{name, email}]


@router.get("/groups")
def list_groups(db: Session = Depends(get_db), _user: models.User = Depends(current_user)):
    return [
        {"id": g.id, "name": g.name, "note": g.note, "members": g.members or [],
         "created_by": g.created_by, "updated_at": g.updated_at}
        for g in db.scalars(select(models.RecipientGroup).order_by(models.RecipientGroup.name))
    ]


@router.post("/groups", status_code=201)
def create_group(body: GroupIn, db: Session = Depends(get_db),
                 user: models.User = Depends(current_user)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(422, "A list needs a name.")
    members = _clean_members(body.members)
    if not members:
        raise HTTPException(422, "A list needs at least one address.")
    g = models.RecipientGroup(name=name, note=(body.note or "").strip(), members=members,
                              created_by=getattr(user, "email", ""))
    db.add(g)
    log(db, "onboarding.group_created", "recipient_group", 0,
        {"name": name, "members": len(members), "by": getattr(user, "email", "")})
    db.commit()
    return {"id": g.id, "name": g.name, "note": g.note, "members": g.members}


@router.patch("/groups/{group_id}")
def update_group(group_id: int, body: GroupIn, db: Session = Depends(get_db),
                 user: models.User = Depends(current_user)):
    g = db.get(models.RecipientGroup, group_id)
    if not g:
        raise HTTPException(404, "No such list")
    if body.name is not None and body.name.strip():
        g.name = body.name.strip()
    g.note = (body.note or "").strip()
    g.members = _clean_members(body.members)
    log(db, "onboarding.group_updated", "recipient_group", g.id,
        {"members": len(g.members), "by": getattr(user, "email", "")})
    db.commit()
    return {"id": g.id, "name": g.name, "note": g.note, "members": g.members}


@router.delete("/groups/{group_id}", status_code=204)
def delete_group(group_id: int, db: Session = Depends(get_db),
                 user: models.User = Depends(current_user)):
    g = db.get(models.RecipientGroup, group_id)
    if not g:
        raise HTTPException(404, "No such list")
    log(db, "onboarding.group_deleted", "recipient_group", g.id,
        {"name": g.name, "by": getattr(user, "email", "")})
    db.delete(g)
    db.commit()


def _clean_members(rows: list[dict]) -> list[dict]:
    """Keep the rows that carry a usable address, deduplicated, in the order they were given."""
    out, seen = [], set()
    for m in rows or []:
        email = str((m or {}).get("email") or "").strip()
        if not email or "@" not in email or email.lower() in seen:
            continue
        seen.add(email.lower())
        out.append({"name": str((m or {}).get("name") or "").strip(), "email": email})
    return out


# ── sending a session's mail, with or without a sitting ─────────────────────────────────────

def _template_for_role(session_key: str, role: str, occ) -> "ml.MailTemplate":
    """The actual letter behind a role chip.

    The catalogue shows a session's mails by the PART they play - invite, feedback - because that
    is what the People team calls them. Which of the two written versions goes out depends on where
    the sitting is held, so the mode has to come from the sitting rather than from the chip.
    """
    mode = (occ.mode if occ and occ.mode else ml.CAMPUS)
    if mode not in (ml.CAMPUS, ml.REMOTE):
        mode = ml.CAMPUS
    for t in ml.for_session(session_key, mode):
        if t.session_role == role:
            return t
    # A session with only one version of that mail: mode does not narrow anything.
    for t in ml.TEMPLATES:
        if t.session_key == session_key and t.session_role == role:
            return t
    raise HTTPException(404, "That mail does not belong to this session")


@router.get("/sessions/{session_key}/mails/{role}")
def session_catalogue_mail(session_key: str, role: str, occurrence_id: int | None = None,
                           on: date | None = None, at: str | None = None,
                           db: Session = Depends(get_db),
                           _user: models.User = Depends(current_user)):
    """A session mail drafted from the catalogue, so it can be sent without opening the calendar.

    A sitting fills in the date, the weekday, the time and the meeting link. Without one those
    tokens stay standing in the text for HR to type, which is the honest state of a mail about a
    session nobody has scheduled yet.
    """
    d = sess.BY_KEY.get(session_key)
    if not d:
        raise HTTPException(404, "No such session")
    occ = db.get(models.SessionOccurrence, occurrence_id) if occurrence_id else None
    t = _template_for_role(session_key, role, occ)
    ctx = ctxs.session_context(occ)
    # A date typed into the composer wins over the sitting's. Somebody sending an invite for a
    # session that is not on the calendar yet still needs to say when it is, and somebody
    # correcting a time in the letter should not have to move the sitting first.
    ctx.update(ctxs.when_context(on, at))
    # Every sitting of this session, so the composer can offer them.
    sittings = [
        {"id": o.id, "starts_at": o.starts_at, "mode": o.mode, "entity": o.entity,
         "invites_sent_at": o.invites_sent_at,
         "attendees": db.scalar(select(func.count(models.SessionAttendee.id))
                                .where(models.SessionAttendee.occurrence_id == o.id)) or 0}
        for o in db.scalars(select(models.SessionOccurrence)
                            .where(models.SessionOccurrence.session_key == session_key)
                            .order_by(models.SessionOccurrence.starts_at))
    ]
    default_audience = (occ.audience if occ and occ.audience else None) or _default_audience(t, occ)
    return {
        "template_key": t.key, "name": t.name, "session": session_key, "session_name": d.name,
        "session_role": t.session_role, "role": role, "mode": t.mode,
        "subject": ml.render(t.subject, ctx),
        "body": ml.render(t.body, ctx),
        "missing": [f for f in ml.unfilled(t.subject + "\n" + t.body, ctx) if f not in PER_RECIPIENT],
        "per_recipient": sorted(PER_RECIPIENT),
        "sittings": sittings,
        "occurrence_id": occ.id if occ else None,
        # What the date and time boxes should show: the sitting's, unless one was typed.
        "on": (on.isoformat() if on else
               (occ.starts_at.date().isoformat() if occ and occ.starts_at else "")),
        "at": (at or (occ.starts_at.strftime("%H:%M") if occ and occ.starts_at else "")),
        "audience": default_audience,
        "note": t.note,
    }


def _default_audience(t, occ) -> dict:
    """What this mail is addressed to before anybody changes it.

    An invite goes to whoever is on the sitting; a feedback mail goes to the people who actually
    turned up; a chase-up goes to the people who did not. Those are three different lists and
    getting them the wrong way round is the mistake this exists to prevent.
    """
    if not occ:
        return {"groups": [], "saved": [], "emails": []}
    if t.session_role == "invite":
        return {"groups": ["sitting"], "saved": [], "emails": []}
    if t.session_role == "non_attendees":
        return {"groups": ["sitting_absent"], "saved": [], "emails": []}
    return {"groups": ["sitting_attended"], "saved": [], "emails": []}


class SessionMailSend(BaseModel):
    subject: str
    body: str
    audience: AudienceSpec
    occurrence_id: int | None = None


@router.post("/sessions/{session_key}/mails/{role}/send")
def send_session_catalogue_mail(session_key: str, role: str, payload: SessionMailSend,
                                db: Session = Depends(get_db),
                                user: models.User = Depends(current_user)):
    """Send a session mail to a resolved audience, one personalised copy each."""
    occ = db.get(models.SessionOccurrence, payload.occurrence_id) if payload.occurrence_id else None
    t = _template_for_role(session_key, role, occ)
    people = aud.resolve(db, payload.audience.model_dump(), occ.id if occ else None)
    if not people:
        raise HTTPException(422, "That audience reaches nobody. Pick a group or type an address.")

    stamp = datetime.now(timezone.utc)
    sent = 0
    for p in people:
        # One draft, many readers: the greeting is filled per person rather than going out as a
        # literal {{Name}}.
        person = {"Name": p.get("name") or ""}
        mailer.compose(db, to_email=p["email"], to_name=p.get("name") or "",
                       template=f"onboarding:{t.key}",
                       subject=ml.render(payload.subject, person),
                       body=ml.render(payload.body, person),
                       candidate_id=p.get("candidate_id"), sender_user=user)
        sent += 1

    if occ:
        # Remember the audience so the next mail for this sitting starts where this one did.
        occ.audience = payload.audience.model_dump()
        if t.session_role == "invite":
            occ.invites_sent_at = stamp
        else:
            ids = {p.get("attendee_id") for p in people if p.get("attendee_id")}
            if ids:
                for a in db.scalars(select(models.SessionAttendee)
                                    .where(models.SessionAttendee.id.in_(ids))):
                    a.feedback_sent_at = stamp

    log(db, "onboarding.session_mail_sent", "session_occurrence", occ.id if occ else 0,
        {"template": t.key, "count": sent, "by": getattr(user, "email", "")})
    db.commit()
    return {"ok": True, "sent": sent}
