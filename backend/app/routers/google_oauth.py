"""Connect a user's Google account (OAuth) for real Google Meet links on interview rounds.

Flow: the frontend calls /connect (auth'd) to get a consent URL and sends the browser there;
Google redirects back to /callback (PUBLIC — no Authorization header on a browser redirect, so it's
secured by our signed `state` token instead); we store the refresh token on the user. See
[[services/gcal]] for the token exchange + event creation.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .. import models
from ..config import settings
from ..database import get_db
from ..deps import current_user
from ..services import gcal, security

router = APIRouter(prefix="/api/google", tags=["google"])


def _app_redirect(status: str) -> RedirectResponse:
    base = (settings.PUBLIC_BASE_URL or "").rstrip("/")
    return RedirectResponse(f"{base}/settings?google={status}")


@router.get("/status")
def status(user: models.User = Depends(current_user)) -> dict:
    """Whether Google Calendar is set up server-side, and whether THIS user has connected it."""
    return {
        "configured": settings.google_oauth_configured,
        "connected": bool((user.google_refresh_token or "").strip()),
        "email": user.email,
    }


@router.get("/connect")
def connect(user: models.User = Depends(current_user)) -> dict:
    """Return the Google consent URL for the frontend to redirect to. The user id is carried in a
    short-lived signed `state` so the (unauthenticated) callback can attribute the tokens."""
    if not settings.google_oauth_configured:
        return {"configured": False, "auth_url": ""}
    state = security.create_token(user.id, settings.SECRET_KEY, ttl_hours=1)
    return {"configured": True, "auth_url": gcal.auth_url(state)}


@router.get("/callback")
def callback(state: str = "", code: str = "", error: str = "", db: Session = Depends(get_db)):
    """Google redirects here after consent. PUBLIC route (browser navigation) — trust comes from the
    signed `state`, not an auth header. Stores the refresh token and bounces back into the app."""
    if error or not code or not state:
        return _app_redirect("error")
    uid = security.decode_token(state, settings.SECRET_KEY)
    if not uid:
        return _app_redirect("error")
    try:
        tokens = gcal.exchange_code(code)
    except Exception:
        return _app_redirect("error")
    refresh = (tokens.get("refresh_token") or "").strip()
    user = db.get(models.User, uid)
    if not user:
        return _app_redirect("error")
    if refresh:                      # Google omits it if the user had already consented — keep the old one then.
        user.google_refresh_token = refresh
        db.commit()
    return _app_redirect("connected")


@router.delete("/disconnect")
def disconnect(db: Session = Depends(get_db), user: models.User = Depends(current_user)) -> dict:
    user.google_refresh_token = ""
    db.commit()
    return {"connected": False}
