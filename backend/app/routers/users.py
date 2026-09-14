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
from ..deps import current_user, require_roles
from ..config import settings
from ..database import get_db
from ..services import mailer, security
from ..services.recruitment import log

router = APIRouter(prefix="/api/users", tags=["users"])

_VALID_ROLES = set(schemas.ROLE_CHOICES)


def _clean_roles(roles: list[str] | None) -> list[str]:
    out = [r.strip().lower() for r in (roles or []) if r and r.strip().lower() in _VALID_ROLES]
    return out or ["recruiter"]


def _admin_ids(db: Session) -> set[int]:
    """Everyone currently holding the admin role and still active. Used to refuse any change that
    would leave the workspace with no admin — removing the last admin locks everybody out of user
    management, roles and the data export with no way back through the UI."""
    return {
        u.id for u in db.scalars(select(models.User).where(models.User.active.is_(True)))
        if "admin" in (u.roles or [])
    }


def _guard_last_admin(db: Session, *, user: models.User, new_roles=None, deactivating=False,
                      deleting=False) -> None:
    """Refuse a change that would remove the last admin. `new_roles` is the roles about to be set
    (None = unchanged); deactivating/deleting flag the other two ways to drop an admin."""
    admins = _admin_ids(db)
    if user.id not in admins:
        return  # touching a non-admin can never remove the last admin
    losing_admin = deleting or deactivating or (new_roles is not None and "admin" not in new_roles)
    if losing_admin and admins == {user.id}:
        raise HTTPException(409, "This is the last admin — promote someone else to admin first.")


def _out(u: models.User) -> dict:
    d = schemas.UserOut.model_validate(u).model_dump()
    d["has_password"] = bool(u.password_hash)
    return d


@router.get("")
def list_users(role: str = "", active: bool | None = None, db: Session = Depends(get_db),
               _user: models.User = Depends(current_user)):
    """The staff directory. Any signed-in staff member may read it (they need it to pick panellists
    and assignees); it used to require only a valid token with no active-user check."""
    rows = db.scalars(select(models.User).order_by(models.User.created_at.desc())).all()
    if role:
        r = role.strip().lower()
        rows = [u for u in rows if r in (u.roles or [])]
    if active is not None:
        rows = [u for u in rows if bool(u.active) == active]
    return [_out(u) for u in rows]


@router.post("", status_code=201)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db),
                actor: models.User = Depends(require_roles("admin"))):
    """Create an account. Admin-only: this mints credentials and assigns roles, so a non-admin
    could otherwise create themselves a second admin account."""
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
def update_user(user_id: int, payload: schemas.UserUpdate, db: Session = Depends(get_db),
                actor: models.User = Depends(require_roles("admin"))):
    """Edit an account. Admin-only, and with two guards even for an admin: you cannot change your
    OWN roles (so you can't accidentally or maliciously demote yourself and there is always a
    deliberate second person in the loop for privilege changes), and you cannot remove or
    deactivate the last remaining admin. Without the role gate, any signed-in user could PATCH
    themselves to admin or overwrite another account's password."""
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"]:
        data["email"] = data["email"].strip().lower()
    if "roles" in data:
        new_roles = _clean_roles(data["roles"])
        if user.id == actor.id and set(new_roles) != set(user.roles or []):
            raise HTTPException(403, "You can't change your own roles. Ask another admin.")
        _guard_last_admin(db, user=user, new_roles=new_roles)
        data["roles"] = new_roles
    if "active" in data and data["active"] is False:
        _guard_last_admin(db, user=user, deactivating=True)
    if "password" in data:
        pw = data.pop("password")
        if pw:
            user.password_hash = security.hash_password(pw)
    for k, v in data.items():
        setattr(user, k, v)
    log(db, "user.updated", "user", user.id, {"fields": list(data.keys()), "by": actor.email})
    db.commit()
    db.refresh(user)
    return _out(user)


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db),
                actor: models.User = Depends(require_roles("admin"))):
    """Delete an account. Admin-only. You cannot delete yourself (use another admin), and you
    cannot delete the last admin."""
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == actor.id:
        raise HTTPException(403, "You can't delete your own account.")
    _guard_last_admin(db, user=user, deleting=True)
    db.delete(user)
    log(db, "user.deleted", "user", user_id, {"by": actor.email})
    db.commit()
