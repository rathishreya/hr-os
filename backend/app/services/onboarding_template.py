"""EZ Lab 100-day onboarding plan — the real "updated 100 day plan" sheet.

Each step has a TYPE that drives how the tracker renders + tracks it:
  status   — a Done / Pending / NA dropdown (the default tracked item)
  session  — a scheduled event: has a working-day, a date, attendance, and status. Shows in the
             Sessions view and can be rescheduled / shifted.
  email    — an automated mail ("Automate w fields" / "Automate on Nth working day"); tracked as
             Done/Pending/NA but flagged as automated so HR knows it fires itself.
  link     — a URL field (e.g. LinkedIn profile).
  fill     — a short free-text value (e.g. MBTI personality type, go-to person name).
  comment  — a notes field.
  percent  — auto-calculated checklist completion.

"Remove" rows from the sheet are intentionally dropped. The candidate-identity fields
(name / joining date / LWD / role) are auto-picked and live in the plan's `details`, not here.

build_tasks(joining_date) returns the flat item list the OnboardingPlan stores; when a joining
date is known each scheduled item also gets a concrete `date` (joining + N working days).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

# (label, group, type, working_day_offset|None, owner, automation_note, is_session)
# working_day_offset is counted in BUSINESS days from the joining date (0 = joining day).
STEPS: list[tuple[str, str, str, int | None, str, str, bool]] = [
    # ---- Pre-joining ----
    ("Documents verification", "Pre-joining", "status", 0, "HR", "", False),
    ("Welcome to EZ mail", "Pre-joining", "email", 0, "HR", "Automated with fields", False),
    ("Mail to HOD / manager", "Pre-joining", "email", 0, "HR", "Automated with fields", False),
    ("Mail: Culture & Life at EZ", "Pre-joining", "email", 0, "HR", "Automated with fields", False),
    ("Mail: First-day overview & dive deeper", "Pre-joining", "email", 0, "HR", "Automated with fields", False),
    ("Hiring feedback form", "Pre-joining", "status", 0, "HR", "", False),
    ("MBTI test — fill personality type", "Pre-joining", "fill", 0, "New hire", "", False),
    ("Policy & FAQ mail + NDA", "Pre-joining", "email", 0, "HR", "Automated with fields", False),
    ("Poster on EZ Life group", "Pre-joining", "status", 0, "HR", "", False),
    # ---- Joining day / Day 1 ----
    ("Induction session", "Joining day", "session", 1, "HR", "Set the date manually", True),
    ("Name the go-to person", "Joining day", "fill", 0, "Manager", "Fill at the start", False),
    ("Meeting 1 with go-to person", "Joining day", "session", 1, "Go-to person", "Auto-scheduled on the 1st working day", True),
    ("Asset allocation + common wallpaper", "Joining day", "status", 1, "IT Admin", "", False),
    ("LinkedIn profile update", "Joining day", "link", 1, "New hire", "", False),
    # ---- Week 1 (day 7) ----
    ("Email manager to share expectations", "Week 1", "email", 7, "Manager", "Automated on the 7th working day", False),
    ("ISO course completion & ISO quiz", "Week 1", "status", 7, "New hire", "", False),
    # ---- Week 2-3 ----
    ("Induction & onboarding feedback form", "Week 2", "status", 15, "New hire", "Automated on the 15th working day", False),
    ("Meet performance buddy (Tue, 6:30–8:30 PM)", "Week 2", "session", 16, "HR", "Schedule manually", True),
    # ---- Sessions (weeks 4–8) ----
    ("Session with Joy", "Sessions", "session", 20, "HR", "Auto email + calendar invite", True),
    ("Feedback on Session with Joy", "Sessions", "status", 20, "New hire", "Email sent as per attendance", False),
    ("Brand EZ session", "Sessions", "session", 22, "HR", "Auto email + calendar invite", True),
    ("Feedback on Brand EZ", "Sessions", "status", 22, "New hire", "Email sent as per attendance", False),
    ("EZ Honor Code session", "Sessions", "session", 25, "HR", "Auto email + calendar invite", True),
    ("Feedback on EZ Honor Code", "Sessions", "status", 25, "New hire", "Email sent as per attendance", False),
    ("Sales deck session", "Sessions", "session", 35, "HR", "Auto email + calendar invite", True),
    ("Feedback on Sales deck", "Sessions", "status", 35, "New hire", "Email sent as per attendance", False),
    # ---- Milestones ----
    ("Monthly HR check-in 1", "Day 30", "session", 30, "HR", "Auto-scheduled on the 30th working day", True),
    ("Certification detail form", "Day 45", "status", 45, "New hire", "Auto email on the 45th working day", False),
    ("Check-in w/ HR: go-to person + manager training feedback", "Day 90", "session", 90, "HR", "Auto-scheduled on the 90th working day", True),
    ("100-day analysis (check-ins, feedback, quiz, pulse check)", "Day 95", "comment", 95, "HR", "Auto reminder on the 95th working day", False),
    ("Completion of 100 days & certification", "Day 100", "session", 100, "HR", "Auto email + calendar invite; upload certificate", True),
    ("Photograph on Team EZ wall", "Day 100", "status", 100, "HR", "", False),
    ("Finish checklist", "Day 100", "percent", 100, "HR", "Auto-calculated", False),
]

# Group order for the tracker timeline.
GROUP_ORDER = ["Pre-joining", "Joining day", "Week 1", "Week 2", "Sessions", "Day 30", "Day 45", "Day 90", "Day 95", "Day 100"]


def add_working_days(start: date, n: int) -> date:
    """Return `start` plus `n` business days (Mon–Fri), skipping weekends."""
    d = start
    step = 1 if n >= 0 else -1
    remaining = abs(n)
    while remaining > 0:
        d = d + timedelta(days=step)
        if d.weekday() < 5:  # 0–4 = Mon–Fri
            remaining -= 1
    return d


def _parse_date(s: str) -> date | None:
    s = (s or "").strip()[:10]
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def schedule_for(joining_date: str, day_offset: int | None) -> str:
    """ISO date for a step `day_offset` working days after joining; "" if unknown."""
    base = _parse_date(joining_date)
    if base is None or day_offset is None:
        return ""
    target = base if day_offset == 0 else add_working_days(base, day_offset)
    return target.isoformat()


def build_tasks(joining_date: str = "") -> list[dict[str, Any]]:
    """The flat onboarding step list stored on the plan. Scheduled items get a concrete date when
    the joining date is known (HR can still override any date on the tracker)."""
    tasks: list[dict[str, Any]] = []
    for i, (label, group, typ, day, owner, automation, is_session) in enumerate(STEPS):
        tasks.append({
            "id": i,
            "label": label,
            "group": group,
            "type": typ,
            "day": day,
            "owner": owner,
            "automation": automation,
            "is_session": is_session,
            "status": "",        # "" | done | pending | na
            "value": "",         # link URL / personality type / go-to person name
            "date": schedule_for(joining_date, day),
            "comments": "",
            "attendance": "",    # "" | present | absent (sessions)
            "done": False,       # kept in sync with status for back-compat / progress
        })
    return tasks


def reschedule_dates(tasks: list[dict[str, Any]], joining_date: str) -> list[dict[str, Any]]:
    """Recompute the auto dates of scheduled steps from a (new) joining date, without touching any
    date HR has manually overridden away from the template default."""
    out = []
    for t in tasks:
        t = dict(t)
        if t.get("day") is not None and not t.get("date_overridden"):
            t["date"] = schedule_for(joining_date, t.get("day"))
        out.append(t)
    return out
