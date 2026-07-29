"""Google Calendar / Meet integration (OAuth).

Lets a recruiter connect their own Google account so a scheduled interview round gets a REAL
Google Meet link + a calendar event on their calendar. Google Meet links can't be self-minted
(unlike Jitsi) — they only come from the Calendar API, authenticated as a Workspace user — so we
do a standard OAuth authorization-code flow and store the per-user refresh token.

Only stdlib + httpx (already a dep) — no google client libraries needed.
"""
from __future__ import annotations

import base64
import urllib.parse
from datetime import datetime, timedelta

import httpx

from ..config import settings

_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
_EVENTS_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
_GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
# calendar.events → create the interview event + its Meet conference (no read of other calendars).
# gmail.send → send the candidate email THROUGH the user's Gmail so it lands in their Sent folder,
# from their real address. Both are allowed without Google verification on an Internal Workspace app.
_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
_SCOPE = f"https://www.googleapis.com/auth/calendar.events {_SEND_SCOPE}"


def redirect_uri() -> str:
    base = (settings.PUBLIC_BASE_URL or "").rstrip("/")
    return f"{base}/api/google/callback"


def auth_url(state: str) -> str:
    """The Google consent URL to send the user to. `state` is our signed token identifying the
    user (verified in the callback). access_type=offline + prompt=consent → we get a refresh token."""
    params = {
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": _SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    return f"{_AUTH_ENDPOINT}?{urllib.parse.urlencode(params)}"


def exchange_code(code: str) -> dict:
    """Trade the authorization code for tokens. Returns Google's token JSON (refresh_token,
    access_token, ...). Raises on HTTP error."""
    resp = httpx.post(_TOKEN_ENDPOINT, data={
        "code": code,
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
        "redirect_uri": redirect_uri(),
        "grant_type": "authorization_code",
    }, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _access_token(refresh_token: str) -> str:
    """Mint a fresh access token from a stored refresh token."""
    resp = httpx.post(_TOKEN_ENDPOINT, data={
        "refresh_token": refresh_token,
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
        "grant_type": "refresh_token",
    }, timeout=30)
    resp.raise_for_status()
    return resp.json()["access_token"]


def gmail_send(refresh_token: str, raw_message: bytes) -> None:
    """Send a pre-built RFC-822 message THROUGH the user's Gmail (Gmail API). Unlike SES/SendGrid,
    this lands a copy in the user's Sent folder and goes out from their real address. Raises on
    error (caller falls back to the shared provider). `raw_message` is msg.as_bytes()."""
    access = _access_token(refresh_token)
    raw = base64.urlsafe_b64encode(raw_message).decode("ascii")
    resp = httpx.post(
        _GMAIL_SEND_ENDPOINT,
        headers={"Authorization": f"Bearer {access}", "Content-Type": "application/json"},
        json={"raw": raw}, timeout=30,
    )
    resp.raise_for_status()


def create_meet_event(
    refresh_token: str, *, summary: str, start: datetime, duration_minutes: int,
    description: str, attendees: list[str], request_id: str, timezone: str | None = None,
) -> str:
    """Create a Calendar event with a Google Meet conference and return the Meet link (or '').

    Sent with sendUpdates=none so Google does NOT email attendees — our own preview-and-send flow
    is the single notification (its email + .ics already carries this link). The event still lands
    on the organizer's (recruiter's) calendar.
    """
    access = _access_token(refresh_token)
    end = start + timedelta(minutes=max(15, duration_minutes or 60))
    tz = timezone or settings.COMPANY_TIMEZONE
    body = {
        "summary": summary,
        "description": description,
        "start": {"dateTime": start.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": tz},
        "end": {"dateTime": end.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": tz},
        "attendees": [{"email": e} for e in attendees if e],
        "conferenceData": {"createRequest": {
            "requestId": request_id,
            "conferenceSolutionKey": {"type": "hangoutsMeet"},
        }},
        "reminders": {"useDefault": True},
    }
    resp = httpx.post(
        _EVENTS_ENDPOINT,
        params={"conferenceDataVersion": 1, "sendUpdates": "none"},
        headers={"Authorization": f"Bearer {access}", "Content-Type": "application/json"},
        json=body, timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    link = data.get("hangoutLink") or ""
    if not link:
        for ep in (data.get("conferenceData", {}) or {}).get("entryPoints", []) or []:
            if ep.get("entryPointType") == "video" and ep.get("uri"):
                link = ep["uri"]
                break
    return link
