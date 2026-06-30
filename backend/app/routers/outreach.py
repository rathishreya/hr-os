"""Campus outreach — email a hiring request to selected college TPOs (real email via
the mailer; logged when SMTP is off). Each TPO gets a personalised message."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..deps import current_user
from ..services import mailer
from ..services.recruitment import log

router = APIRouter(prefix="/api/hiring-requests", tags=["outreach"])


def _build_body(hr: models.HiringRequest, job, tpo: models.TPO, role: str, link: str, extra: str) -> str:
    is_vendor = (getattr(tpo, "kind", "college") or "college").lower() == "vendor"
    if is_vendor:
        greeting = f"Dear {tpo.name or tpo.college or 'Partner'},"
        intro = (
            f"We at {settings.COMPANY_NAME} are hiring and would like to engage "
            f"{tpo.college or 'your team'} to help us source candidates for the following opportunity:"
        )
    else:
        greeting = f"Dear {tpo.name or 'Placement Officer'},"
        intro = (
            f"We at {settings.COMPANY_NAME} are hiring and would love to connect with students "
            f"from {tpo.college or 'your college'} for the following opportunity:"
        )
    lines = [greeting, "", intro, "", f"Role: {role}"]
    if hr.department:
        lines.append(f"Department: {hr.department}")
    if hr.location or hr.work_mode:
        loc = " · ".join(filter(None, [hr.location, hr.work_mode]))
        lines.append(f"Location: {loc}")
    if hr.budget_ctc:
        lines.append(f"Compensation: {hr.budget_ctc}")
    if hr.yoe_min or hr.yoe_max:
        lines.append(f"Experience: {int(hr.yoe_min or 0)}–{int(hr.yoe_max or 0)} years")
    skills = (hr.mandatory_skills or []) + (hr.preferred_skills or [])
    if skills:
        lines.append(f"Key skills: {', '.join(skills[:12])}")
    if hr.num_openings:
        lines.append(f"Openings: {hr.num_openings}")
    if hr.hiring_deadline:
        lines.append(f"Apply by: {hr.hiring_deadline}")
    lines.append("")
    if link:
        who = "Candidates" if is_vendor else "Students"
        lines.append(f"{who} can view details and apply here: {link}")
        lines.append("")
    if extra.strip():
        lines.append(extra.strip())
        lines.append("")
    if is_vendor:
        closing = ("We'd be grateful if you could share suitable candidates from your network. "
                   "Happy to discuss the role and your terms at your convenience.")
    else:
        closing = ("We'd be grateful if you could share this with eligible students. Happy to arrange a "
                   "campus drive or virtual session at your convenience.")
    lines += [
        closing,
        "",
        "Warm regards,",
        settings.EMAIL_FROM_NAME,
        settings.COMPANY_NAME,
        settings.EMAIL_FROM,
    ]
    return "\n".join(lines)


@router.post("/{hr_id}/send-to-tpos")
def send_to_tpos(hr_id: int, payload: schemas.SendToTposRequest, db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    hr = db.get(models.HiringRequest, hr_id)
    if not hr:
        raise HTTPException(404, "Hiring request not found")
    if not payload.tpo_ids:
        raise HTTPException(400, "Select at least one placement officer.")
    tpos = db.scalars(select(models.TPO).where(models.TPO.id.in_(payload.tpo_ids))).all()
    if not tpos:
        raise HTTPException(404, "No matching placement officers found.")

    job = hr.job
    role = (job.title if job else "") or hr.position
    base = settings.PUBLIC_BASE_URL
    link = f"{base}/careers/{job.id}" if (job and job.status == "published" and base) else ""

    results = []
    for tpo in tpos:
        if not tpo.email:
            results.append({"tpo_id": tpo.id, "college": tpo.college, "email": "", "status": "skipped (no email)"})
            continue
        subject = f"Campus hiring: {role} at {settings.COMPANY_NAME}"
        body = _build_body(hr, job, tpo, role, link, payload.message or "")
        rec = mailer.compose(db, to_email=tpo.email, to_name=tpo.name, template="custom", subject=subject, body=body, sender_user=user)
        results.append({"tpo_id": tpo.id, "college": tpo.college, "email": tpo.email, "status": rec.status})

    log(db, "outreach.tpos", "hiring_request", hr.id, {"role": role, "tpo_ids": payload.tpo_ids, "results": results})
    db.commit()
    sent = sum(1 for r in results if r["status"] in ("sent", "logged"))
    return {"role": role, "total": len(results), "delivered": sent, "results": results}
