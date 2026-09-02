"""The onboarding form a candidate fills in after accepting an offer.

Two ways in, because the People team needs both:

  * a PER-CANDIDATE link, signed with the same HMAC the emailed assessment links use, so the form
    arrives knowing who it belongs to and the answers attach to the right record with nobody
    matching names by hand. This is the link the offer letter has always promised.
  * a GENERIC link anyone can be sent, for somebody who is not in the system yet. Those arrive
    unattached and HR points them at a candidate afterwards.

Both are public: the global auth gate in main.py lets them through, the per-candidate one only
when its signature checks out.
"""
from __future__ import annotations

import json
import re
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
# The form parser hands back Starlette's UploadFile, and FastAPI's is a SUBCLASS of it,
# so an isinstance check against the FastAPI one silently matches nothing.
from starlette.datastructures import UploadFile as FormUpload

from .. import models
from ..config import settings
from ..database import get_db
from ..deps import current_user
from ..services import security, storage
from ..services.recruitment import log

router = APIRouter(prefix="/api/onboarding-form", tags=["onboarding-form"])

MAX_FILE_BYTES = 5 * 1024 * 1024      # matches MAX_FILE_BYTES in onboardingFields.js
MAX_FILES = 10                        # eight in the spec, with room to spare
VARIANTS = {"individual", "freelancer", "organization"}


def form_resource(candidate_id: int) -> str:
    """What a per-candidate link's signature covers."""
    return f"onboarding:{int(candidate_id)}:form"


def form_token(candidate_id: int) -> str:
    return security.sign_resource(form_resource(candidate_id), settings.SECRET_KEY)


def form_url(candidate_id: int) -> str:
    """The link to put in an email. Absolute, because it is opened outside the app."""
    base = (settings.PUBLIC_BASE_URL or "").rstrip("/")
    return f"{base}/onboarding-form/{int(candidate_id)}?t={form_token(candidate_id)}"


def _check_token(candidate_id: int, t: str) -> None:
    if not security.verify_resource(form_resource(candidate_id), t or "", settings.SECRET_KEY):
        raise HTTPException(403, "This onboarding link is not valid. Ask your recruiter for a new one.")


# ── public: what the form already knows about you ───────────────────────────────────────────
@router.get("/{candidate_id}/prefill")
def prefill(candidate_id: int, t: str = "", db: Session = Depends(get_db)):
    """Name and email for a signed link, so a candidate is not retyping what we already hold.

    Deliberately thin: a link is a bearer credential, so it returns only what the person opening
    it plainly knows about themselves, never their salary, documents or pipeline history.
    """
    _check_token(candidate_id, t)
    cand = db.get(models.Candidate, candidate_id)
    if not cand:
        raise HTTPException(404, "Candidate not found")
    done = db.scalar(
        select(models.OnboardingSubmission.id)
        .where(models.OnboardingSubmission.candidate_id == candidate_id)
        .limit(1)
    )
    return {
        "candidate_id": cand.id,
        "legal_name": cand.name or "",
        "email": cand.email or "",
        "already_submitted": bool(done),
    }


def _store(db: Session, submission: models.OnboardingSubmission, field_key: str, up: UploadFile) -> None:
    data = up.file.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, f"{up.filename or field_key} is over 5 MB.")
    if not data:
        return
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", up.filename or field_key)[:120]
    row = models.OnboardingUpload(
        submission_id=submission.id, field_key=field_key, filename=safe,
        mime=up.content_type or "application/octet-stream", size=len(data),
    )
    if settings.s3_enabled:
        import io
        key = f"onboarding/{submission.id}/{field_key}-{safe}"
        storage.upload_stream(io.BytesIO(data), key, row.mime)
        row.s3_key = key
    else:
        # No bucket configured (a developer machine): keep it inline so the flow still works.
        row.data = data
    db.add(row)


def _save(db: Session, *, candidate_id: int | None, variant: str, payload: dict,
          files: dict[str, UploadFile]) -> models.OnboardingSubmission:
    if variant not in VARIANTS:
        raise HTTPException(422, f"variant must be one of {sorted(VARIANTS)}")
    if len(files) > MAX_FILES:
        raise HTTPException(413, "Too many files.")

    app_id = None
    if candidate_id:
        app_id = db.scalar(
            select(models.Application.id)
            .where(models.Application.candidate_id == candidate_id)
            .order_by(models.Application.id.desc())
            .limit(1)
        )
    sub = models.OnboardingSubmission(
        candidate_id=candidate_id, application_id=app_id, variant=variant,
        email=str(payload.get("email") or "").strip()[:200],
        legal_name=str(payload.get("legal_name") or "").strip()[:200],
        answers=payload,
    )
    db.add(sub)
    db.flush()          # need the id before the files can be keyed against it
    for key, up in files.items():
        _store(db, sub, key, up)
    log(db, "onboarding.form_submitted", "onboarding_submission", sub.id, {
        "candidate_id": candidate_id, "variant": variant, "files": sorted(files),
    }, actor="candidate")
    db.commit()
    db.refresh(sub)
    return sub


def _collect_files(form) -> dict[str, UploadFile]:
    out: dict[str, UploadFile] = {}
    for key, value in form.multi_items():
        if isinstance(value, FormUpload) and key.startswith("file:"):
            out[key[5:]] = value
    return out


# ── public: submit ──────────────────────────────────────────────────────────────────────────
@router.post("/{candidate_id}/submit", status_code=201)
async def submit_for_candidate(
    request: Request, candidate_id: int, t: str = "", answers: str = Form("{}"),
    variant: str = Form("individual"), db: Session = Depends(get_db),
):
    _check_token(candidate_id, t)
    if not db.get(models.Candidate, candidate_id):
        raise HTTPException(404, "Candidate not found")
    # The signature never expires and cannot be revoked, so the link is a standing credential to
    # file Aadhaar, PAN and bank details against one person. One submission closes it; a genuine
    # correction goes through HR, who can edit what was sent.
    if db.scalar(
        select(models.OnboardingSubmission.id)
        .where(models.OnboardingSubmission.candidate_id == candidate_id)
        .limit(1)
    ):
        raise HTTPException(409, "This form has already been completed. Contact the People team if "
                                 "something needs correcting.")
    form = await request.form()
    sub = _save(db, candidate_id=candidate_id, variant=variant,
                payload=json.loads(answers or "{}"), files=_collect_files(form))
    return {"id": sub.id, "reference": f"ONB-{sub.id:05d}"}


@router.post("/submit", status_code=201)
async def submit_open(
    request: Request, answers: str = Form("{}"), variant: str = Form("individual"),
    db: Session = Depends(get_db),
):
    """The generic link. Nobody is identified, so the submission arrives unattached."""
    form = await request.form()
    sub = _save(db, candidate_id=None, variant=variant,
                payload=json.loads(answers or "{}"), files=_collect_files(form))
    return {"id": sub.id, "reference": f"ONB-{sub.id:05d}"}


# ── HR: read, edit, attach ──────────────────────────────────────────────────────────────────
def _out(db: Session, s: models.OnboardingSubmission) -> dict:
    ups = db.scalars(
        select(models.OnboardingUpload).where(models.OnboardingUpload.submission_id == s.id)
    ).all()
    cand = db.get(models.Candidate, s.candidate_id) if s.candidate_id else None
    return {
        "id": s.id, "reference": f"ONB-{s.id:05d}",
        "candidate_id": s.candidate_id, "application_id": s.application_id,
        "candidate_name": cand.name if cand else "",
        "variant": s.variant, "email": s.email, "legal_name": s.legal_name,
        "answers": s.answers or {}, "status": s.status,
        "submitted_at": s.submitted_at, "updated_at": s.updated_at,
        "files": [
            {"id": u.id, "field_key": u.field_key, "filename": u.filename,
             "mime": u.mime, "size": u.size}
            for u in ups
        ],
    }


@router.get("")
def list_submissions(candidate_id: int | None = None, db: Session = Depends(get_db),
                     _user: models.User = Depends(current_user)):
    stmt = select(models.OnboardingSubmission).order_by(models.OnboardingSubmission.id.desc())
    if candidate_id:
        stmt = stmt.where(models.OnboardingSubmission.candidate_id == candidate_id)
    return [_out(db, s) for s in db.scalars(stmt).all()]


class SubmissionPatch(BaseModel):
    answers: dict | None = None
    variant: str | None = None
    status: str | None = None
    candidate_id: int | None = None    # attach an unattached submission to a candidate


@router.patch("/{sub_id}")
def update_submission(sub_id: int, body: SubmissionPatch, db: Session = Depends(get_db),
                      user: models.User = Depends(current_user)):
    """HR's edit access over what the candidate sent."""
    s = db.get(models.OnboardingSubmission, sub_id)
    if not s:
        raise HTTPException(404, "Submission not found")
    if body.variant is not None:
        if body.variant not in VARIANTS:
            raise HTTPException(422, f"variant must be one of {sorted(VARIANTS)}")
        s.variant = body.variant
    if body.answers is not None:
        s.answers = dict(body.answers)
        s.email = str(s.answers.get("email") or s.email)[:200]
        s.legal_name = str(s.answers.get("legal_name") or s.legal_name)[:200]
    if body.status is not None:
        s.status = body.status
    if body.candidate_id is not None:
        if not db.get(models.Candidate, body.candidate_id):
            raise HTTPException(404, "Candidate not found")
        s.candidate_id = body.candidate_id
    log(db, "onboarding.form_edited", "onboarding_submission", s.id,
        {"by": getattr(user, "email", "")})
    db.commit()
    db.refresh(s)
    return _out(db, s)


@router.get("/uploads/{upload_id}")
def get_upload(upload_id: int, db: Session = Depends(get_db),
               _user: models.User = Depends(current_user)):
    """Stream one uploaded file. Behind the auth gate — these are identity documents."""
    u = db.get(models.OnboardingUpload, upload_id)
    if not u:
        raise HTTPException(404, "File not found")
    if u.s3_key:
        return Response(status_code=307, headers={"Location": storage.presigned_get(u.s3_key)})
    if u.data is None:
        raise HTTPException(404, "File not found")
    safe = re.sub(r'[\r\n"\x00-\x1f]+', "", u.filename or "file") or "file"
    return Response(content=u.data, media_type=u.mime or "application/octet-stream",
                    headers={"Content-Disposition": f'inline; filename="{safe}"',
                             "X-Content-Type-Options": "nosniff"})


@router.get("/{candidate_id}/link")
def get_link(candidate_id: int, db: Session = Depends(get_db),
             _user: models.User = Depends(current_user)):
    """The candidate's own signed form link, for pasting into an email."""
    if not db.get(models.Candidate, candidate_id):
        raise HTTPException(404, "Candidate not found")
    return {"url": form_url(candidate_id)}
