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
from ..services import security
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
