"""Minimal iCalendar (.ics) builder — no third-party dependency.

Produces a single-VEVENT REQUEST that email clients (Gmail, Outlook, Apple Mail) render as
an "Add to calendar" invite. Times are emitted as floating local time (the wall-clock time the
recruiter entered), which is the least surprising behaviour for an interview slot.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone


def parse_local_dt(value: str) -> datetime | None:
    """Parse a datetime-local string ("YYYY-MM-DDTHH:MM"[":SS]) into a naive datetime."""
    v = (value or "").strip()
    if not v:
        return None
    try:
        return datetime.fromisoformat(v)
    except ValueError:
        return None


def _esc(text: str) -> str:
    """Escape an ICS text value (RFC 5545 §3.3.11)."""
    return (
        str(text or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def build_ics(
    *,
    summary: str,
    start: datetime,
    duration_minutes: int = 60,
    description: str = "",
    location: str = "",
    uid: str,
    organizer_email: str = "",
    organizer_name: str = "",
    attendees: list[str] | None = None,
) -> str:
    """Return the text of a .ics invite for a single event."""
    end = start + timedelta(minutes=max(1, int(duration_minutes or 60)))
    fmt = "%Y%m%dT%H%M%S"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//HR-OS//Interview Scheduler//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:{_esc(uid)}",
        f"DTSTAMP:{stamp}",
        f"DTSTART:{start.strftime(fmt)}",
        f"DTEND:{end.strftime(fmt)}",
        f"SUMMARY:{_esc(summary)}",
    ]
    if description:
        lines.append(f"DESCRIPTION:{_esc(description)}")
    if location:
        lines.append(f"LOCATION:{_esc(location)}")
    if organizer_email:
        cn = f';CN="{_esc(organizer_name)}"' if organizer_name else ""
        lines.append(f"ORGANIZER{cn}:mailto:{organizer_email}")
    for a in (attendees or []):
        a = (a or "").strip()
        if a and "@" in a:
            lines.append(f"ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:{a}")
    lines += ["STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(lines) + "\r\n"
