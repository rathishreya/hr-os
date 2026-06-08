"""Reusable assessments — uploaded files (take-home tasks, tests) that recruiters
attach to an assessment interview round and/or email to candidates."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..services import mailer
from ..services.ai import ai
from ..services.recruitment import log

router = APIRouter(prefix="/api/assessments", tags=["assessments"])

_MAX_ASSESSMENT_BYTES = 25 * 1024 * 1024  # 25 MB cap per uploaded assessment


def _assessment_link(assessment_id: int) -> str:
    base = (settings.PUBLIC_BASE_URL or "").rstrip("/")
    return f"{base}/api/assessments/{assessment_id}/file"


def _default_subject(a: "models.Assessment", role: str) -> str:
    return f"{a.name} — next step for {role or 'your application'}"


def _default_body(a: "models.Assessment", role: str, company: str, link: str) -> str:
    desc = (a.description or "").strip()
    return (
        f"Hi {{name}},\n\nThanks for your interest in {role or 'the role'} at {company}. As the next "
        f"step, please complete this assessment: {a.name}.\n\nAccess it here: {link}\n\n"
        + (f"{desc}\n\n" if desc else "")
        + "Please reply to this email once you're done, and let us know if you have any questions.\n\n"
        f"Best regards,\n{settings.EMAIL_FROM_NAME}\n{company}"
    )


_PLACEHOLDER = re.compile(r"\{(name|role|company|assessment|link)\}")


def _fill(text: str, mapping: dict) -> str:
    # Single pass so a value that itself contains a placeholder token isn't re-expanded.
    return _PLACEHOLDER.sub(lambda m: str(mapping.get(m.group(1), m.group(0))), text or "")


@router.get("", response_model=list[schemas.AssessmentOut])
def list_assessments(db: Session = Depends(get_db)):
    return db.scalars(select(models.Assessment).order_by(models.Assessment.created_at.desc())).all()


@router.post("", response_model=schemas.AssessmentOut)
async def create_assessment(request: Request, db: Session = Depends(get_db)):
    """Create an assessment from one or more uploaded files.

    Reads the multipart form directly and collects EVERY uploaded file regardless of the field
    name ('files', 'file', or anything else), so it can never 422 on a field-name mismatch.
    """
    form = await request.form()
    name = str(form.get("name") or "").strip()
    description = str(form.get("description") or "").strip()
    if not name:
        raise HTTPException(422, "Assessment name is required")
    uploads = [v for _, v in form.multi_items() if hasattr(v, "filename") and v.filename]
    if not uploads:
        raise HTTPException(422, "Please attach at least one file")

    a = models.Assessment(name=name, description=description)
    db.add(a)
    db.flush()
    first_data: bytes | None = None
    for up in uploads:
        data = await up.read(_MAX_ASSESSMENT_BYTES + 1)
        if len(data) > _MAX_ASSESSMENT_BYTES:
            raise HTTPException(413, f"'{up.filename}' is too large (max 25 MB per file)")
        if not data:
            continue
        af = models.AssessmentFile(
            assessment_id=a.id,
            filename=up.filename or "assessment",
            mime=up.content_type or "application/octet-stream",
            size=len(data),
            file=data,
        )
        db.add(af)
        if first_data is None:
            # Mirror the first file into the legacy columns (preview link / older callers).
            first_data = data
            a.filename, a.mime, a.size, a.file = af.filename, af.mime, af.size, data
    if first_data is None:
        raise HTTPException(422, "Please attach at least one non-empty file")
    db.flush()
    log(db, "assessment.created", "assessment", a.id, {"name": a.name, "files": len(a.files)})
    db.commit()
    db.refresh(a)
    return a


def _file_response(filename: str, mime: str, blob: bytes) -> Response:
    # Strip CR/LF/quotes/control chars from the (uploader-controlled) filename to prevent
    # response-header injection, and send nosniff so the browser won't MIME-sniff the blob.
    safe = re.sub(r'[\r\n"\x00-\x1f]+', "", filename or "assessment") or "assessment"
    return Response(
        content=blob,
        media_type=mime or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{safe}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{assessment_id}/file")
def get_assessment_file(assessment_id: int, db: Session = Depends(get_db)):
    """Stream the first/primary file (back-compat preview + the link emailed to candidates)."""
    a = db.get(models.Assessment, assessment_id)
    if not a or a.file is None:
        raise HTTPException(404, "Assessment file not found")
    return _file_response(a.filename, a.mime, a.file)


@router.get("/{assessment_id}/files/{file_id}")
def get_assessment_file_by_id(assessment_id: int, file_id: int, db: Session = Depends(get_db)):
    """Stream a specific file within a multi-file assessment."""
    af = db.get(models.AssessmentFile, file_id)
    if not af or af.assessment_id != assessment_id or af.file is None:
        raise HTTPException(404, "Assessment file not found")
    return _file_response(af.filename, af.mime, af.file)


@router.post("/{assessment_id}/draft-email", response_model=schemas.DraftAssessmentEmailOut)
def draft_email(assessment_id: int, req: schemas.DraftAssessmentEmailRequest, db: Session = Depends(get_db)):
    """Return a suggested email (template or AI-drafted) for sending this assessment. The body keeps
    a literal {name} placeholder so it personalizes per candidate at send time."""
    a = db.get(models.Assessment, assessment_id)
    if not a:
        raise HTTPException(404, "Assessment not found")
    role = ""
    if req.application_id:
        app = db.get(models.Application, req.application_id)
        if app and app.hiring_request:
            role = app.hiring_request.position
    company = settings.COMPANY_NAME
    link = _assessment_link(assessment_id)
    if req.use_ai:
        result, provider = ai.assessment_email({
            "role": role, "company": company, "sender": settings.EMAIL_FROM_NAME,
            "assessment_name": a.name, "link": link, "description": a.description,
        })
        subject = result.get("subject") or _default_subject(a, role)
        body = result.get("body") or _default_body(a, role, company, link)
    else:
        provider = "template"
        subject, body = _default_subject(a, role), _default_body(a, role, company, link)
    return schemas.DraftAssessmentEmailOut(subject=subject, body=body, provider=provider)


@router.post("/{assessment_id}/send", response_model=schemas.SendAssessmentOut)
def send_assessment(assessment_id: int, req: schemas.SendAssessmentRequest, db: Session = Depends(get_db)):
    """Send the assessment (as an email with the access link) to one or more candidates. The subject/body
    may use {name}, {role}, {company}, {assessment}, {link} placeholders — filled per candidate."""
    a = db.get(models.Assessment, assessment_id)
    if not a:
        raise HTTPException(404, "Assessment not found")
    link = _assessment_link(assessment_id)
    counts = {"sent": 0, "logged": 0, "failed": 0}
    for app_id in req.application_ids:
        app = db.get(models.Application, app_id)
        if not app or not app.candidate:
            counts["failed"] += 1
            continue
        cand = app.candidate
        role = app.hiring_request.position if app.hiring_request else ""
        mapping = {"name": cand.name or "there", "role": role, "company": settings.COMPANY_NAME,
                   "assessment": a.name, "link": link}
        subject = _fill(req.subject or _default_subject(a, role), mapping)
        body = _fill(req.body or _default_body(a, role, settings.COMPANY_NAME, link), mapping)
        rec = mailer.compose(
            db, to_email=cand.email or "", to_name=cand.name or "", template="assessment",
            role=role, subject=subject, body=body, candidate_id=cand.id, application_id=app.id,
        )
        counts[rec.status if rec.status in counts else "failed"] += 1
    log(db, "assessment.sent", "assessment", assessment_id, {"count": len(req.application_ids), **counts})
    db.commit()
    return schemas.SendAssessmentOut(total=len(req.application_ids), **counts)


@router.delete("/{assessment_id}", status_code=204)
def delete_assessment(assessment_id: int, db: Session = Depends(get_db)):
    a = db.get(models.Assessment, assessment_id)
    if a:
        db.delete(a)
        log(db, "assessment.deleted", "assessment", assessment_id, {})
        db.commit()
    return Response(status_code=204)
