"""Google Calendar / Meet integration (OAuth).

Lets a recruiter connect their own Google account so a scheduled interview round gets a REAL
Google Meet link + a calendar event on their calendar. Google Meet links can't be self-minted
(unlike Jitsi) — they only come from the Calendar API, authenticated as a Workspace user — so we
do a standard OAuth authorization-code flow and store the per-user refresh token.

Only stdlib + httpx (already a dep) — no google client libraries needed.
"""
from __future__ import annotations

import base64
import json
import time
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
_CAL_SCOPE = "https://www.googleapis.com/auth/calendar.events"
_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
_SCOPE = f"{_CAL_SCOPE} {_SEND_SCOPE}"


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


# ── Workspace domain-wide delegation (service-account impersonation) ─────────────
# When a Workspace super-admin has authorized a service account, the server can act AS any user
# in the domain (send from their Gmail, create events on their calendar) with NO per-user OAuth.

_deleg_cache: dict = {}  # (subject_email, scope) -> (access_token, expiry_epoch)


def _load_delegation_sa() -> dict | None:
    raw = (settings.GOOGLE_DELEGATION_SA_JSON or "").strip()
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            return None
    path = (settings.GOOGLE_DELEGATION_SA_FILE or "").strip()
    if path:
        try:
            with open(path, encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            return None
    return None


def delegation_available() -> bool:
    """True when a delegation service account is configured and parseable."""
    return settings.google_delegation_configured and _load_delegation_sa() is not None


def _delegated_token(subject_email: str, scope: str) -> str:
    """An access token that acts AS `subject_email` for `scope`, via the delegated SA (JWT-bearer
    with a `sub` impersonation claim). Cached per (subject, scope) until shortly before expiry."""
    key = (subject_email, scope)
    now = time.time()
    cached = _deleg_cache.get(key)
    if cached and cached[1] - 120 > now:
        return cached[0]
    sa = _load_delegation_sa()
    if not sa or not sa.get("client_email") or not sa.get("private_key"):
        raise RuntimeError("delegation service account missing or invalid")
    import jwt  # PyJWT; RS256 needs the 'cryptography' backend (in requirements-prod)
    iat = int(now)
    assertion = jwt.encode(
        {"iss": sa["client_email"], "sub": subject_email, "scope": scope,
         "aud": _TOKEN_ENDPOINT, "iat": iat, "exp": iat + 3600},
        sa["private_key"], algorithm="RS256",
    )
    resp = httpx.post(_TOKEN_ENDPOINT, data={
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion,
    }, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    tok = data["access_token"]
    _deleg_cache[key] = (tok, now + int(data.get("expires_in", 3600)))
    return tok


def _gmail_post(access_token: str, raw_message: bytes) -> None:
    raw = base64.urlsafe_b64encode(raw_message).decode("ascii")
    resp = httpx.post(
        _GMAIL_SEND_ENDPOINT,
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        json={"raw": raw}, timeout=30,
    )
    resp.raise_for_status()


def gmail_send(refresh_token: str, raw_message: bytes) -> None:
    """Send a pre-built RFC-822 message THROUGH the user's Gmail via their OWN OAuth connection.
    Lands a copy in their Sent folder, from their real address. Raises on error (caller falls back
    to the shared provider). `raw_message` is msg.as_bytes()."""
    _gmail_post(_access_token(refresh_token), raw_message)


def gmail_send_as(user_email: str, raw_message: bytes) -> None:
    """Same, but via Workspace domain-wide delegation (impersonate the user) — no per-user OAuth."""
    _gmail_post(_delegated_token(user_email, _SEND_SCOPE), raw_message)


def _insert_meet_event(
    access_token: str, *, summary: str, start: datetime, duration_minutes: int,
    description: str, attendees: list[str], request_id: str, timezone: str | None = None,
) -> str:
    """Create a Calendar event with a Google Meet conference (given an access token) and return the
    Meet link (or ''). sendUpdates=none so Google does NOT email attendees — our own preview-and-send
    flow is the single notification. The event still lands on the organizer's calendar."""
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
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
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


def create_meet_event(refresh_token: str, **kw) -> str:
    """Create a Meet event via the user's OWN OAuth connection. See _insert_meet_event for kwargs."""
    return _insert_meet_event(_access_token(refresh_token), **kw)


def create_meet_event_as(user_email: str, **kw) -> str:
    """Create a Meet event AS the user via Workspace domain-wide delegation — no per-user OAuth."""
    return _insert_meet_event(_delegated_token(user_email, _CAL_SCOPE), **kw)
