"""When each step falls due.

The spec counts in WORKING days from the joining date — "automate on the 45th working day", "set
the calendar on the 100th day". Counting calendar days instead would chase somebody a fortnight
early on a 90-day step, so the arithmetic matters.

Working day 1 is the joining date itself when that is a weekday, otherwise the next weekday: the
first mail goes out on their first day at work, not the Saturday they signed.

Holidays are NOT modelled. EZ hires in India and the UAE, whose holiday calendars differ and are
neither in this codebase nor in any system it talks to, so a due date here is weekday-accurate and
holiday-blind. It is a date to chase somebody by, not a legal deadline — and the People team can
see and move every one of them.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

WEEKEND = {5, 6}  # Saturday, Sunday


def _as_date(value) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d %B %Y", "%d %b %Y", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def working_day(start, n: int) -> date | None:
    """The date `n` working days from `start`, where working day 1 is the first weekday on or
    after `start`. Returns None when the joining date is unusable — a missing date must not
    silently become today."""
    d = _as_date(start)
    if d is None or n is None or n < 1:
        return None
    while d.weekday() in WEEKEND:      # a Saturday joining date starts on the Monday
        d += timedelta(days=1)
    counted = 1
    while counted < n:
        d += timedelta(days=1)
        if d.weekday() not in WEEKEND:
            counted += 1
    return d


def due_dates(joining, steps) -> dict[str, date]:
    """Every step's due date for one candidate, keyed by step. Steps with no working-day rule are
    absent rather than None, so a caller cannot mistake "no deadline" for "overdue"."""
    out: dict[str, date] = {}
    for s in steps:
        if s.due_working_day:
            d = working_day(joining, s.due_working_day)
            if d:
                out[s.key] = d
    return out


def invite_date(sitting, weeks_before: int = 1, weekday: int = 4):
    """When a session's invite should go out: 10:00 on the Friday of the week before, per the
    catalogue. Returns the date; the time is the session definition's own."""
    d = _as_date(sitting)
    if d is None:
        return None
    d -= timedelta(weeks=max(0, weeks_before))
    # step back to the requested weekday within that week
    while d.weekday() != weekday:
        d -= timedelta(days=1)
    return d
