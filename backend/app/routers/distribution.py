"""Direct-posting integrations: connection status + manual push to Google / LinkedIn.

The free aggregator feed/channels list lives in careers.py (GET /api/distribution/channels).
This router adds the *automated* integrations: notify Google's Indexing API and post to a
LinkedIn company page, both per-job and on-demand.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..services.distribution import dispatch
from ..services.recruitment import log

router = APIRouter(prefix="/api/distribution", tags=["distribution"])


@router.get("/integrations")
def integrations():
    """Connection status for the automated posting channels (for the Distribution UI)."""
    return {
        "google": {
            "name": "Google for Jobs",
            "configured": settings.google_indexing_configured,
        },
        "linkedin": {
            "name": "LinkedIn company page",
            "configured": settings.linkedin_configured,
            "org_urn": settings.LINKEDIN_ORG_URN or "",
        },
        "public_url": settings.PUBLIC_BASE_URL or "",
        "public_url_ok": bool(settings.PUBLIC_BASE_URL),
    }


def _job_or_404(job_id: int, db: Session) -> models.Job:
    job = db.get(models.Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.post("/google/index")
def google_index(payload: schemas.JobRef, db: Session = Depends(get_db)):
    """Notify Google's Indexing API that this role's careers page should be (re)crawled."""
    if not settings.google_indexing_configured:
        raise HTTPException(400, "Google Indexing isn't configured. Add a service-account key in the env.")
    if not settings.PUBLIC_BASE_URL:
        raise HTTPException(400, "Set PUBLIC_BASE_URL to your public site first — Google can't index localhost.")
    job = _job_or_404(payload.job_id, db)
    results = dispatch.run(db, job, channels=("google",), force=True)
    log(db, "job.google_index", "job", job.id, {"ok": (results.get("google") or {}).get("ok")})
    db.commit()
    return results.get("google", {"ok": False, "error": "no result"})


@router.post("/linkedin/share")
def linkedin_share(payload: schemas.JobRef, db: Session = Depends(get_db)):
    """Post this role to the configured LinkedIn company page."""
    if not settings.linkedin_configured:
        raise HTTPException(400, "LinkedIn isn't configured. Add an access token + organization URN in the env.")
    job = _job_or_404(payload.job_id, db)
    results = dispatch.run(db, job, channels=("linkedin",), force=True)
    log(db, "job.linkedin_share", "job", job.id, {"ok": (results.get("linkedin") or {}).get("ok")})
    db.commit()
    return results.get("linkedin", {"ok": False, "error": "no result"})
