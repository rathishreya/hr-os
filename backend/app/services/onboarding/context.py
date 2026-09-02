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
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ... import models
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


def _joining(*values) -> str:
    """The joining date the way these mails say it: "7th September 2026", not "2026-09-07".

    HR types this date in a dozen shapes on the offer letter, so parse first and only fall back to
    the raw string when it is something this code cannot read."""
    raw = _first(*values)
    parsed = _as_date(raw)
    return _pretty(parsed) if parsed else raw


def _first(*values) -> str:
    for v in values:
        text = str(v or "").strip()
        if text:
            return text
    return ""


def _email_for(db: Session, who: str) -> str:
    """A manager is stored as a name in the hiring request and sometimes as an address. Take the
    address when it is one, otherwise look the person up by name. Returns "" rather than guessing,
    because a wrong Cc on a welcome mail is worse than a missing one."""
    who = (who or "").strip()
    if not who:
        return ""
    if "@" in who:
        return who
    u = db.scalar(select(models.User).where(models.User.name == who))
    return (u.email if u else "") or ""


def _first_document(db: Session, candidate_id: int) -> models.Document | None:
    """The earliest document decides, the same rule the one-entity check uses."""
    return db.scalars(
        select(models.Document)
        .where(models.Document.candidate_id == candidate_id)
        .order_by(models.Document.id)
    ).first()


def work_mode(db: Session, plan: models.OnboardingPlan) -> str:
    """In campus or remote. The People team writes two versions of most mails and this is what
    picks one, so it reads the role's own work mode rather than asking again."""
    app = db.get(models.Application, plan.application_id) if plan.application_id else None
    hr = app.hiring_request if app else None
    mode = str(getattr(hr, "work_mode", "") or "").lower()
    if mode == "remote":
        return mails.REMOTE
    if not mode:
        # No hiring request on the application (a directly-added hire). The onboarding form asks
        # where they will work; fall back to that before assuming an office.
        sub = db.scalar(
            select(models.OnboardingSubmission)
            .where(models.OnboardingSubmission.candidate_id == plan.candidate_id)
            .order_by(models.OnboardingSubmission.id.desc())
        )
        answered = str(((sub.answers if sub else {}) or {}).get("work_location") or "").lower()
        if "remote" in answered:
            return mails.REMOTE
    return mails.CAMPUS


def merge_context(db: Session, plan: models.OnboardingPlan, *, joining: str = "",
                  extra: dict | None = None) -> dict:
    """The merge dictionary for one candidate's mails."""
    cand = db.get(models.Candidate, plan.candidate_id)
    app = db.get(models.Application, plan.application_id) if plan.application_id else None
    hr = app.hiring_request if app else None
    doc = _first_document(db, plan.candidate_id)
    terms = (doc.terms if doc else {}) or {}
    details = plan.details or {}
    sub = db.scalar(
        select(models.OnboardingSubmission)
        .where(models.OnboardingSubmission.candidate_id == plan.candidate_id)
        .order_by(models.OnboardingSubmission.id.desc())
    )
    answers = (sub.answers if sub else {}) or {}
    go_to = db.scalar(
        select(models.OnboardingStepState)
        .where(models.OnboardingStepState.plan_id == plan.id,
               models.OnboardingStepState.step_key == "go_to_person")
    )

    manager = _first(terms.get("manager"), details.get("reporting_manager"),
                     getattr(hr, "hiring_manager", ""))
    hod = _first(details.get("approving_manager"), terms.get("approving_manager"))

    ctx = {
        "Name": _first(terms.get("name"), getattr(cand, "name", ""), answers.get("full_name")),
        "Date of Joining": _joining(joining, terms.get("start_date"), details.get("joining_date")),
        "Designation": _first(terms.get("designation"), getattr(hr, "position", ""),
                              plan.role_position),
        "Team": _first(terms.get("team"), getattr(hr, "team", "")),
        "Department": _first(terms.get("department"), details.get("department"),
                             getattr(hr, "department", "")),
        "Reporting Manager": manager,
        "Reporting Manager Email": _email_for(db, manager),
        "Department Head": hod,
        "Department Head Email": _email_for(db, hod),
        "Go to Person": (go_to.value if go_to else "") or "",
        "Year": str(date.today().year),
    }
    ctx.update({k: v for k, v in (extra or {}).items() if v not in (None, "")})
    return {k: v for k, v in ctx.items() if v not in (None, "")}


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
