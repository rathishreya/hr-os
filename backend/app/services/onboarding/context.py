"""What fills a mail's merge fields, gathered from what the company already knows.

Nobody should retype a joining date that is already on the offer letter. This walks the trail the
candidate has already left through the system, newest and most authoritative first, and hands back
the {{Name}} / {{Date of Joining}} / {{Reporting Manager}} dictionary the templates read:

    the offer paperwork (Offer & Docs)  ->  terms HR typed and signed off on
    the hiring request                  ->  the role, team, department, manager, work mode
    the candidate record                ->  name, email, phone
    the onboarding form they filled     ->  anything they told us themselves
    the checklist                       ->  their go-to person, once somebody names one

Fields nobody can supply are simply absent, and mails.render leaves those tokens standing so HR
sees what is still theirs to type.

Two ways in. `merge_context` answers for ONE plan and reads what it needs as it goes.
`bulk_contexts` answers for MANY in a fixed number of queries: same precedence, same fallbacks,
same answers, but the all-mails view was costing about thirteen round trips per joiner and that
grows linearly against a database on the other side of the internet.
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ... import models
from ..documents.entity import entity_of
from . import mails
from .schedule import _as_date

_MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August",
           "September", "October", "November", "December")
_DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def _pretty(d) -> str:
    """A date the way the People team writes it in these mails: 14th March 2026."""
    if isinstance(d, datetime):
        d = d.date()
    if not isinstance(d, date):
        return str(d or "")
    n = d.day
    suffix = "th" if 11 <= n <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix} {_MONTHS[d.month - 1]} {d.year}"


def _first(*values) -> str:
    for v in values:
        text = str(v or "").strip()
        if text:
            return text
    return ""


def _joining(*values) -> str:
    """The joining date the way these mails say it: "7th September 2026", not "2026-09-07".

    HR types this date in a dozen shapes on the offer letter, so parse first and only fall back to
    the raw string when it is something this code cannot read."""
    raw = _first(*values)
    parsed = _as_date(raw)
    return _pretty(parsed) if parsed else raw


def _email_for(lookup, who: str) -> str:
    """A manager is stored as a name in the hiring request and sometimes as an address. Take the
    address when it is one, otherwise look the person up by name. Returns "" rather than guessing,
    because a wrong Cc on a welcome mail is worse than a missing one."""
    who = (who or "").strip()
    if not who:
        return ""
    if "@" in who:
        return who
    return lookup(who) or ""


def _user_lookup(db: Session):
    """Name -> address, memoised for the life of one request."""
    cache: dict[str, str] = {}

    def look(name: str) -> str:
        if name not in cache:
            u = db.scalar(select(models.User).where(models.User.name == name))
            cache[name] = (u.email if u else "") or ""
        return cache[name]

    return look


def _first_document(db: Session, candidate_id: int) -> models.Document | None:
    """The earliest document decides, the same rule the one-entity check uses."""
    return db.scalars(
        select(models.Document)
        .where(models.Document.candidate_id == candidate_id)
        .order_by(models.Document.id)
    ).first()


def _mode_from(hr, answers: dict) -> str:
    mode = str(getattr(hr, "work_mode", "") or "").lower()
    if mode == "remote":
        return mails.REMOTE
    if not mode:
        # No hiring request on the application (a directly-added hire). The onboarding form asks
        # where they will work; fall back to that before assuming an office.
        if "remote" in str((answers or {}).get("work_location") or "").lower():
            return mails.REMOTE
    return mails.CAMPUS


def _assemble(plan, cand, hr, doc, answers: dict, go_to: str, lookup) -> dict:
    """The merge dictionary, from rows somebody else has already fetched."""
    terms = (doc.terms if doc else {}) or {}
    details = plan.details or {}
    manager = _first(terms.get("manager"), details.get("reporting_manager"),
                     getattr(hr, "hiring_manager", ""))
    hod = _first(details.get("approving_manager"), terms.get("approving_manager"))
    ctx = {
        "Name": _first(terms.get("name"), getattr(cand, "name", ""), (answers or {}).get("full_name")),
        "Date of Joining": _joining(terms.get("start_date"), details.get("joining_date")),
        "Designation": _first(terms.get("designation"), getattr(hr, "position", ""),
                              plan.role_position),
        "Team": _first(terms.get("team"), getattr(hr, "team", "")),
        "Department": _first(terms.get("department"), details.get("department"),
                             getattr(hr, "department", "")),
        "Reporting Manager": manager,
        "Reporting Manager Email": _email_for(lookup, manager),
        "Department Head": hod,
        "Department Head Email": _email_for(lookup, hod),
        "Go to Person": go_to or "",
        "Year": str(date.today().year),
    }
    return {k: v for k, v in ctx.items() if v not in (None, "")}


def work_mode(db: Session, plan: models.OnboardingPlan) -> str:
    """In campus or remote. The People team writes two versions of most mails and this is what
    picks one, so it reads the role's own work mode rather than asking again."""
    app = db.get(models.Application, plan.application_id) if plan.application_id else None
    hr = app.hiring_request if app else None
    if str(getattr(hr, "work_mode", "") or "").lower():
        return _mode_from(hr, {})
    sub = db.scalar(
        select(models.OnboardingSubmission)
        .where(models.OnboardingSubmission.candidate_id == plan.candidate_id)
        .order_by(models.OnboardingSubmission.id.desc())
    )
    return _mode_from(hr, (sub.answers if sub else {}) or {})


def merge_context(db: Session, plan: models.OnboardingPlan, *, joining: str = "",
                  extra: dict | None = None) -> dict:
    """The merge dictionary for one candidate's mails."""
    cand = db.get(models.Candidate, plan.candidate_id)
    app = db.get(models.Application, plan.application_id) if plan.application_id else None
    hr = app.hiring_request if app else None
    doc = _first_document(db, plan.candidate_id)
    sub = db.scalar(
        select(models.OnboardingSubmission)
        .where(models.OnboardingSubmission.candidate_id == plan.candidate_id)
        .order_by(models.OnboardingSubmission.id.desc())
    )
    go_to = db.scalar(
        select(models.OnboardingStepState)
        .where(models.OnboardingStepState.plan_id == plan.id,
               models.OnboardingStepState.step_key == "go_to_person")
    )
    ctx = _assemble(plan, cand, hr, doc, (sub.answers if sub else {}) or {},
                    (go_to.value if go_to else ""), _user_lookup(db))
    if joining:
        ctx["Date of Joining"] = _joining(joining)
    ctx.update({k: v for k, v in (extra or {}).items() if v not in (None, "")})
    return {k: v for k, v in ctx.items() if v not in (None, "")}


def bulk_contexts(db: Session, plans: list) -> dict[int, dict]:
    """Everything the all-mails view needs about every plan, in a fixed number of queries.

    Returns {plan_id: {"ctx", "mode", "entity", "joining", "candidate"}}. One query per KIND of row
    rather than per plan, so adding the fiftieth joiner costs nothing extra.
    """
    if not plans:
        return {}
    cand_ids = {p.candidate_id for p in plans}
    app_ids = {p.application_id for p in plans if p.application_id}
    plan_ids = [p.id for p in plans]

    cands = {c.id: c for c in db.scalars(
        select(models.Candidate).where(models.Candidate.id.in_(cand_ids)))}
    apps = {a.id: a for a in db.scalars(
        select(models.Application).where(models.Application.id.in_(app_ids)))} if app_ids else {}

    # Earliest document per candidate — the one that settles their entity and carries the terms.
    docs: dict[int, models.Document] = {}
    for d in db.scalars(select(models.Document)
                        .where(models.Document.candidate_id.in_(cand_ids))
                        .order_by(models.Document.id)):
        docs.setdefault(d.candidate_id, d)

    # Latest submission per candidate.
    subs: dict[int, models.OnboardingSubmission] = {}
    for s in db.scalars(select(models.OnboardingSubmission)
                        .where(models.OnboardingSubmission.candidate_id.in_(cand_ids))
                        .order_by(models.OnboardingSubmission.id.desc())):
        subs.setdefault(s.candidate_id, s)

    go_tos = {r.plan_id: (r.value or "") for r in db.scalars(
        select(models.OnboardingStepState).where(
            models.OnboardingStepState.plan_id.in_(plan_ids),
            models.OnboardingStepState.step_key == "go_to_person"))}

    lookup = _user_lookup(db)
    out: dict[int, dict] = {}
    for p in plans:
        cand = cands.get(p.candidate_id)
        app = apps.get(p.application_id)
        # hiring_request is a relationship; touching it can lazy-load, but the set of applications
        # is already in the identity map and there are far fewer roles than joiners.
        hr = app.hiring_request if app else None
        doc = docs.get(p.candidate_id)
        answers = (subs[p.candidate_id].answers if p.candidate_id in subs else {}) or {}
        terms = (doc.terms if doc else {}) or {}
        out[p.id] = {
            "ctx": _assemble(p, cand, hr, doc, answers, go_tos.get(p.id, ""), lookup),
            "mode": _mode_from(hr, answers),
            # Empty means UNSET, and the board reads it as EZ; see documents/entity.py.
            "entity": (entity_of(doc) if doc else "") or "EZ",
            "joining": str(terms.get("start_date") or (p.details or {}).get("joining_date") or ""),
            "candidate": cand,
        }
    return out


def session_context(occurrence: models.SessionOccurrence | None) -> dict:
    """The date, day and time of one sitting, for a session mail."""
    if not occurrence or not occurrence.starts_at:
        return {}
    start = occurrence.starts_at
    out = {
        "Session Date": _pretty(start),
        "Week Day": _DAYS[start.weekday()],
        "Session Time": start.strftime("%I:%M %p").lstrip("0"),
    }
    if occurrence.meet_link:
        out["Meeting Link"] = occurrence.meet_link
    return out


def when_context(on, at: str | None = None) -> dict:
    """The date and time somebody typed, in the shape the templates read.

    Only the parts that were actually given: passing a date without a time must not blank out the
    time the sitting already knows, so an empty answer contributes nothing rather than an empty
    string that would overwrite it."""
    out: dict[str, str] = {}
    d = _as_date(on)
    if d:
        out["Session Date"] = _pretty(d)
        out["Week Day"] = _DAYS[d.weekday()]
    text = (at or "").strip()
    if text:
        try:
            h, _, m = text.partition(":")
            hour, minute = int(h), int(m or 0)
            suffix = "AM" if hour < 12 else "PM"
            twelve = hour % 12 or 12
            out["Session Time"] = f"{twelve}:{minute:02d} {suffix}"
        except ValueError:
            out["Session Time"] = text
    return out


def recipient(db: Session, plan: models.OnboardingPlan, to: str, ctx: dict) -> tuple[str, str]:
    """Who a template addresses, as (email, name). The candidate for most of them; the manager or
    the department head for the few that are written to them."""
    if to == mails.MANAGER:
        return ctx.get("Reporting Manager Email", ""), ctx.get("Reporting Manager", "")
    if to == mails.HOD:
        return ctx.get("Department Head Email", ""), ctx.get("Department Head", "")
    cand = db.get(models.Candidate, plan.candidate_id)
    doc = _first_document(db, plan.candidate_id)
    email = _first((doc.terms or {}).get("email") if doc else "", getattr(cand, "email", ""))
    return email, ctx.get("Name", "")


def cc_list(ctx: dict, cc: tuple[str, ...]) -> list[str]:
    by_role = {mails.MANAGER: ctx.get("Reporting Manager Email", ""),
               mails.HOD: ctx.get("Department Head Email", "")}
    return [a for a in (by_role.get(r, "") for r in cc) if a]
