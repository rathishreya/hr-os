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
from ..services import mailer
from ..services.documents import settled_entity
from ..services.onboarding import context as ctxs, mails as ml, schedule, sessions as sess, steps as st
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

    # Record it against the step, so the checklist and this queue never disagree about what went.
    if t.step_key:
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
