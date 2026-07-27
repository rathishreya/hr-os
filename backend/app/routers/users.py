"""User & role management.

Login isn't enforced yet — this is a team directory + role assignment. A user's roles
decide where they're placed in the tool (e.g. a 'panellist' becomes selectable on
interview rounds). Passwords are stored hashed; an optional credential email can be sent.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import current_user
from ..config import settings
from ..database import get_db
from ..services import mailer, security
from ..services.recruitment import log

router = APIRouter(prefix="/api/users", tags=["users"])

_VALID_ROLES = set(schemas.ROLE_CHOICES)


def _clean_roles(roles: list[str] | None) -> list[str]:
    out = [r.strip().lower() for r in (roles or []) if r and r.strip().lower() in _VALID_ROLES]
    return out or ["recruiter"]


def _out(u: models.User) -> dict:
    d = schemas.UserOut.model_validate(u).model_dump()
    d["has_password"] = bool(u.password_hash)
    return d


@router.get("")
def list_users(role: str = "", active: bool | None = None, db: Session = Depends(get_db)):
    rows = db.scalars(select(models.User).order_by(models.User.created_at.desc())).all()
    if role:
        r = role.strip().lower()
        rows = [u for u in rows if r in (u.roles or [])]
    if active is not None:
        rows = [u for u in rows if bool(u.active) == active]
    return [_out(u) for u in rows]


@router.post("", status_code=201)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db),
                actor: models.User = Depends(current_user)):
    email = (payload.email or "").strip().lower()
    if not (payload.name or "").strip() or not email:
        raise HTTPException(422, "Name and email are required.")
    if db.scalar(select(models.User).where(models.User.email == email)):
        raise HTTPException(409, "A user with that email already exists.")

    plain = payload.password or security.generate_password()
    user = models.User(
        name=payload.name.strip(),
        email=email,
        phone=(payload.phone or "").strip(),
        title=(payload.title or "").strip(),
        roles=_clean_roles(payload.roles),
        password_hash=security.hash_password(plain),
        active=True,
    )
    db.add(user)
    db.flush()
    log(db, "user.created", "user", user.id, {"roles": user.roles})

    credentials_email = None
    if payload.send_credentials and email:
        subject = f"Your {settings.COMPANY_NAME} HR-OS account"
        body = (
            f"Hi {user.name or 'there'},\n\n"
            f"An account has been created for you on {settings.COMPANY_NAME} HR-OS.\n\n"
            f"Email: {email}\n"
            f"Temporary password: {plain}\n"
            f"Role(s): {', '.join(user.roles)}\n\n"
            f"Please keep these credentials safe.\n\n{settings.EMAIL_FROM_NAME}"
        )
        rec = mailer.compose(db, to_email=email, to_name=user.name, template="custom", subject=subject, body=body, sender_user=actor)
        credentials_email = rec.status

    db.commit()
    db.refresh(user)
    out = _out(user)
    out["credentials_email"] = credentials_email
    return out


@router.patch("/{user_id}")
def update_user(user_id: int, payload: schemas.UserUpdate, db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"]:
        data["email"] = data["email"].strip().lower()
    if "roles" in data:
        data["roles"] = _clean_roles(data["roles"])
    if "password" in data:
        pw = data.pop("password")
        if pw:
            user.password_hash = security.hash_password(pw)
    for k, v in data.items():
        setattr(user, k, v)
    log(db, "user.updated", "user", user.id, {"fields": list(data.keys())})
    db.commit()
    db.refresh(user)
    return _out(user)


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    log(db, "user.deleted", "user", user_id, {})
    db.commit()
