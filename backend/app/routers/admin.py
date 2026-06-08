"""Admin utilities — data export (a recovery path before the free Postgres is wiped)."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import require_roles

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _dump(db: Session, model, fields: list[str]) -> list[dict]:
    return [{f: getattr(r, f) for f in fields} for r in db.scalars(select(model)).all()]


@router.get("/export")
def export_all(db: Session = Depends(get_db), _user: models.User = Depends(require_roles("admin"))):
    """Full structured export of the hiring data as JSON (binary files excluded). Use this to
    back up before the free-tier Postgres is removed, or to migrate to a paid database."""
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "candidates": _dump(db, models.Candidate, ["id", "name", "email", "phone", "source", "parsed", "ai_summary", "resume_text", "created_at"]),
        "hiring_requests": _dump(db, models.HiringRequest, ["id", "position", "department", "location", "work_mode", "status", "created_at"]),
        "jobs": _dump(db, models.Job, ["id", "hiring_request_id", "title", "status", "target_platforms", "created_at"]),
        "applications": _dump(db, models.Application, ["id", "candidate_id", "hiring_request_id", "stage", "score_overall", "created_at"]),
        "emails": _dump(db, models.EmailMessage, ["id", "candidate_id", "application_id", "to_email", "subject", "status", "created_at"]),
        "video_interviews": _dump(db, models.VideoInterview, ["id", "application_id", "candidate_id", "status", "transcript", "scores", "created_at"]),
        "documents": _dump(db, models.Document, ["id", "application_id", "candidate_id", "doc_type", "status", "created_at"]),
        "note": "Binary files (resumes, recordings, signed PDFs) are excluded — move them to object storage for a full backup. See PROD-READINESS.md.",
    }
