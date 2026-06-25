"""Authentication — login (email + password → signed token) and the current-user lookup.

Tokens are HMAC-signed and stateless (see services/security.py). The auth gate middleware
in main.py enforces them on /api/* (except the public allowlist); this router issues them.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..deps import current_user
from ..services import mailer, security
from ..services.recruitment import log

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_out(u: models.User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "title": u.title, "roles": u.roles or []}


@router.post("/login")
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    user = db.scalar(select(models.User).where(func.lower(models.User.email) == email))
    if not user or not user.active or not security.verify_password(payload.password or "", user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = security.create_token(user.id, settings.SECRET_KEY, settings.TOKEN_TTL_HOURS)
    log(db, "auth.login", "user", user.id, {})
    db.commit()
    return {"token": token, "user": _user_out(user)}


@router.get("/me")
def me(user: models.User = Depends(current_user)):
    return _user_out(user)


def _no_users(db: Session) -> bool:
    return db.scalar(select(models.User.id).limit(1)) is None


@router.get("/can-signup")
def can_signup(db: Session = Depends(get_db)):
    """Tell the UI whether to show the Create-account form. The first user can always
    sign up (and becomes admin); after that it depends on ALLOW_SIGNUP."""
    first = _no_users(db)
    return {
        "open": first or settings.ALLOW_SIGNUP,
        "first_user": first,
        "domain": settings.SIGNUP_ALLOWED_DOMAIN or "",
    }


@router.post("/signup")
def signup(payload: schemas.SignupRequest, db: Session = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    name = (payload.name or "").strip()
    if not name or "@" not in email:
        raise HTTPException(422, "Enter your name and a valid email.")
    first = _no_users(db)
    if not first and not settings.ALLOW_SIGNUP:
        raise HTTPException(403, "Sign-ups are closed. Ask an admin to add you in Settings → Users.")
    domain = (settings.SIGNUP_ALLOWED_DOMAIN or "").strip().lower()
    if domain and not email.endswith("@" + domain):
        raise HTTPException(403, f"Sign-ups are restricted to @{domain} email addresses.")
    if db.scalar(select(models.User).where(func.lower(models.User.email) == email)):
        raise HTTPException(409, "An account with that email already exists — try signing in.")

    if first:
        roles = ["admin"]  # the first user owns the workspace
    else:
        role = (settings.SIGNUP_DEFAULT_ROLE or "recruiter").strip().lower()
        roles = [role if role in schemas.ROLE_CHOICES else "recruiter"]

    user = models.User(name=name, email=email, roles=roles,
                       password_hash=security.hash_password(payload.password), active=True)
    db.add(user)
    db.flush()
    token = security.create_token(user.id, settings.SECRET_KEY, settings.TOKEN_TTL_HOURS)
    log(db, "auth.signup", "user", user.id, {"first_user": first, "roles": roles})
    db.commit()
    return {"token": token, "user": _user_out(user)}


@router.post("/forgot-password")
def forgot_password(payload: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Email a one-hour, single-use reset link. Always returns the same response so it can't be
    used to discover which emails have accounts. Without SMTP, the link is logged (or an admin can
    reset the password directly in Settings → Users)."""
    email = (payload.email or "").strip().lower()
    user = db.scalar(select(models.User).where(func.lower(models.User.email) == email))
    if user and user.active:
        token = security.create_reset_token(user.id, user.password_hash, settings.SECRET_KEY, ttl_minutes=60)
        base = (settings.PUBLIC_BASE_URL or "").rstrip("/")
        link = f"{base}/reset-password?token={token}"
        body = (
            f"Hi {user.name or 'there'},\n\n"
            f"We received a request to reset your {settings.COMPANY_NAME} password. "
            f"Open the link below to set a new one — it expires in 1 hour:\n\n{link}\n\n"
            f"If you didn't request this, you can ignore this email; your password won't change."
        )
        try:
            mailer.compose(db, to_email=user.email, to_name=user.name, template="password_reset",
                           subject=f"Reset your {settings.COMPANY_NAME} password", body=body)
        except Exception:
            pass
        log(db, "auth.forgot_password", "user", user.id, {})
        db.commit()
    return {"ok": True, "message": "If an account exists for that email, a reset link is on its way."}


@router.post("/reset-password")
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    uid = security.reset_token_uid(payload.token)
    user = db.get(models.User, uid) if uid else None
    if not user or not user.active or security.verify_reset_token(payload.token, user.password_hash, settings.SECRET_KEY) != user.id:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Request a new one.")
    user.password_hash = security.hash_password(payload.password)  # invalidates the used link
    log(db, "auth.reset_password", "user", user.id, {})
    db.commit()
    token = security.create_token(user.id, settings.SECRET_KEY, settings.TOKEN_TTL_HOURS)  # sign them in
    return {"ok": True, "token": token, "user": _user_out(user)}


@router.post("/change-password")
def change_password(payload: schemas.ChangePasswordRequest, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    if not security.verify_password(payload.current_password or "", user.password_hash):
        raise HTTPException(status_code=400, detail="Your current password is incorrect.")
    user.password_hash = security.hash_password(payload.new_password)
    log(db, "auth.change_password", "user", user.id, {})
    db.commit()
    return {"ok": True}
