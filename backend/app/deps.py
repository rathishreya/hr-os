"""Auth dependencies — resolve the current user from the request (set by the auth gate
middleware in main.py) and enforce role requirements."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from . import models
from .database import get_db


def current_user(request: Request, db: Session = Depends(get_db)) -> models.User:
    """The authenticated user. The middleware has already validated the token and set
    request.state.user_id for gated routes; this loads the row (and 401s if it's gone)."""
    uid = getattr(request.state, "user_id", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.get(models.User, uid)
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_roles(*roles: str):
    """Dependency factory: require the user to hold at least one of `roles` (admin always allowed)."""
    allowed = {r.lower() for r in roles}

    def _checker(user: models.User = Depends(current_user)) -> models.User:
        held = {r.lower() for r in (user.roles or [])}
        if "admin" in held or held & allowed:
            return user
        raise HTTPException(status_code=403, detail="You don't have permission to do that.")

    return _checker
