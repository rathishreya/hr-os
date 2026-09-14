"""What an automatic sender WOULD send, and what is stopping each one.

This module answers the question without doing anything about it. It has no send call, imports no
mailer, and cannot post an email however it is invoked — deliberately, because switching automatic
onboarding mail on is the moment nobody reviews a draft again, and the only honest way to earn that
is to show the queue first and let a person read it.

A mail is DUE when all of these hold:

    the step is marked auto in the checklist       steps.Step.auto
    the step has a due working day                 steps.Step.due_working_day
    the plan has a joining date we can parse       routers.onboarding_module._joining_of
    that working day has arrived                   schedule.working_day(joining, n) <= today
    this template is not already in sent_mails     OnboardingStepState.sent_mails

and it is SENDABLE only when, in addition, nothing in `blockers` came back. Everything that would
stop it is reported per mail rather than summed, because "3 blocked" tells an operator nothing and
"no address on file for the manager" tells them what to go and fix.

Known reasons a due mail is not sendable, each of which this reports rather than papering over:

  no-recipient        the role this mail is addressed to has no address we can resolve
  unfilled-fields     a {{token}} has no value; _guard would refuse this send
  unresolved-links    the body carries a [words](#key) whose address nobody has supplied yet.
                      _guard does NOT catch these — it only looks at {{tokens}} — so a mail can
                      pass the guard and still reach a candidate reading "[link needed]"
  already-done-by-hand
                      the step is ticked Done but carries no sent_mails record. Ticking a step
                      Done goes through update_step, which never writes sent_mails, so a mail the
                      People team sent by hand looks unsent to anything reading that field. Sending
                      here would be sending it a second time.
  leaving
                      a last working day has been recorded for this person. Everything automatic
                      stops the moment that date is entered — a 45th-day certification chase to
                      somebody who has resigned is the worst mail this system could send, and it
                      is the one a date-driven scheduler would send most eagerly.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ... import models
from ..documents.entity import entity_of
from . import context as ctxs
from . import mails as ml
from . import richtext as rt
from . import schedule as sc
from . import steps as st


#: Who automatic ONBOARDING mail goes out as. Named here rather than left to settings.EMAIL_FROM,
#: which is a different person: EMAIL_FROM is shweta.dwivedi@ezworks.io and this is Sweta Singh.
#: Two similar names, two different inboxes — falling back to the general one would quietly send
#: every joiner's welcome letter from the wrong person.
ONBOARDING_SENDER = "sweta.singh@ezworks.io"


def sender_address() -> str:
    return ONBOARDING_SENDER


def sender_user(db: Session):
    """The User row to send as, so mailer.resolve_identity can use her own mailbox where she has
    connected one. None when she has no account — the caller then falls back to the shared
    identity rather than failing to send at all."""
    return db.scalar(
        select(models.User).where(func.lower(models.User.email) == ONBOARDING_SENDER)
    )


def _has_left(states: dict) -> bool:
    """Has a last working day been recorded? Everything automatic stops from that moment."""
    row = states.get("lwd")
    return bool(row and str(row.value or "").strip())


def _entity_of_plan(db: Session, plan: models.OnboardingPlan) -> str:
    """Which entity's checklist this plan follows — the same rule the rest of the app uses: the
    candidate's earliest document settles it, and with no document at all we assume EZ."""
    doc = db.scalars(
        select(models.Document)
        .where(models.Document.candidate_id == plan.candidate_id)
        .order_by(models.Document.id)
    ).first()
    return entity_of(doc) if doc else "EZ"


def _states(db: Session, plan_id: int) -> dict[str, models.OnboardingStepState]:
    return {
        r.step_key: r
        for r in db.scalars(
            select(models.OnboardingStepState)
            .where(models.OnboardingStepState.plan_id == plan_id)
        )
    }


def due_mails(db: Session, *, today: date | None = None,
              plan_id: int | None = None) -> list[dict]:
    """Every automatic mail that has fallen due, with its blockers. Sends nothing.

    `today` is injectable so this can be asked "what would you send on 1 March?" without waiting
    for 1 March — which is the only way to check a schedule before it runs.
    """
    from ...routers.onboarding_module import _joining_of, _link_overrides

    today = today or date.today()
    overrides = _link_overrides(db)

    stmt = select(models.OnboardingPlan)
    if plan_id is not None:
        stmt = stmt.where(models.OnboardingPlan.id == plan_id)
    plans = db.scalars(stmt).all()

    out: list[dict] = []
    for plan in plans:
        cand = db.get(models.Candidate, plan.candidate_id)
        joining_raw = _joining_of(db, plan)
        joining = sc._as_date(joining_raw)
        entity = _entity_of_plan(db, plan)
        states = _states(db, plan.id)
        leaving = _has_left(states)
        ctx, mode = None, None

        for step in st.steps_for(entity):
            if not (step.auto and step.due_working_day is not None):
                continue

            row = states.get(step.key)
            sent = (row.sent_mails if row else {}) or {}
            when = sc.working_day(joining, step.due_working_day) if joining else None

            for t in ml.for_step(step.key, ctxs.work_mode(db, plan)):
                if t.key in sent:
                    continue                      # already gone; nothing to report

                # Build the merge context lazily — five queries a plan, and most plans have
                # nothing due at all.
                if ctx is None:
                    ctx, mode = ctxs.merge_context(db, plan, joining=joining_raw), ctxs.work_mode(db, plan)

                to_email, to_name = ctxs.recipient(db, plan, t.to, ctx)
                subject, body = ml.render(t.subject, ctx), ml.render(t.body, ctx)

                blockers: list[str] = []
                if not joining:
                    blockers.append("no-joining-date")
                if not to_email:
                    blockers.append("no-recipient")
                if ml.fields(subject + "\n" + body):
                    blockers.append("unfilled-fields")
                if rt.unresolved(t.body, overrides):
                    blockers.append("unresolved-links")
                if row is not None and row.status == "Done":
                    blockers.append("already-done-by-hand")
                if leaving:
                    blockers.append("leaving")

                out.append({
                    "plan_id": plan.id,
                    "candidate": (cand.name if cand else "") or "",
                    "entity": entity,
                    "mode": mode,
                    "step": step.label,
                    "step_key": step.key,
                    "template": t.key,
                    "mail": t.name,
                    "due_working_day": step.due_working_day,
                    "joining": joining_raw,
                    "due_on": when.isoformat() if when else "",
                    "overdue_days": (today - when).days if when and when <= today else 0,
                    "to": to_email,
                    "to_name": to_name,
                    "to_role": t.to,
                    "cc": ctxs.cc_list(ctx, t.cc),
                    "subject": rt.strip(subject),
                    "blockers": blockers,
                    "sendable": not blockers and bool(when) and when <= today,
                    "due_yet": bool(when) and when <= today,
                })
    out.sort(key=lambda r: (r["due_on"] or "9999", r["candidate"], r["template"]))
    return out


def summary(db: Session, *, today: date | None = None) -> dict:
    """One line an operator can act on, plus the counts behind it."""
    rows = due_mails(db, today=today)
    due = [r for r in rows if r["due_yet"]]
    blocked: dict[str, int] = {}
    for r in due:
        for b in r["blockers"]:
            blocked[b] = blocked.get(b, 0) + 1
    return {
        "as_of": (today or date.today()).isoformat(),
        "sends_as": sender_address(),
        "plans_considered": len({r["plan_id"] for r in rows}),
        "auto_mails_tracked": len(rows),
        "due_now": len(due),
        "would_send": sum(1 for r in due if r["sendable"]),
        "blocked": blocked,
        "not_due_yet": sum(1 for r in rows if not r["due_yet"]),
    }
