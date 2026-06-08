"""Interview planning — schedule rounds, panelists, slots, and capture feedback."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import current_user
from ..services.recruitment import log

router = APIRouter(prefix="/api/interview-rounds", tags=["interview-rounds"])


# Panelists see capability info only — _candidate_prep whitelists fields and omits
# compensation (current/expected CTC, notice period) and direct contact details.
def _identity(user: models.User) -> set[str]:
    return {(user.name or "").strip().lower(), (user.email or "").strip().lower()} - {""}


def _candidate_prep(c: models.Candidate | None) -> dict | None:
    if not c:
        return None
    parsed = c.parsed or {}
    return {
        "id": c.id,
        "name": c.name,
        "summary": c.ai_summary or parsed.get("summary", ""),
        "current_title": parsed.get("current_title", ""),
        "current_company": parsed.get("current_company", ""),
        "total_yoe": parsed.get("total_yoe"),
        "location": parsed.get("location", ""),
        "skills": parsed.get("skills") or [],
        "education": parsed.get("education") or [],
        "links": parsed.get("links") or [],
        "resume_text": c.resume_text or "",
        "has_resume_file": bool(c.resume_file),
    }


_COMP_ANSWER_KEYS = ("ctc", "compensation", "salary", "notice", "source")


def _panel_answers(answers: list | None) -> list[dict]:
    """Application-form answers a panelist should see — drops compensation/source fields."""
    out = []
    for a in answers or []:
        label = str(a.get("label", "")).lower()
        if any(k in label for k in _COMP_ANSWER_KEYS):
            continue
        if str(a.get("answer", "")).strip():
            out.append({"label": a.get("label", ""), "answer": a.get("answer", "")})
    return out


def _panel_questions(questions: list | None) -> list:
    """Role screening questions a panelist should ask — drops compensation/notice ones."""
    out = []
    for q in questions or []:
        text = (q if isinstance(q, str) else (q.get("question") or q.get("text") or "")).lower()
        if any(k in text for k in ("compensation", "salary", "ctc", "notice period")):
            continue
        out.append(q)
    return out


def _ai_insight(app: models.Application) -> dict:
    bd = app.score_breakdown or {}
    return {
        "score": round(app.score_overall or 0),
        "fit_label": app.fit_label or "",
        "recommendation": app.recommendation or "",
        "rationale": app.score_rationale or "",
        "strengths": bd.get("strengths") or [],
        "gaps": bd.get("gaps") or [],
    }


def _video_brief(db: Session, application_id: int) -> dict | None:
    vi = db.scalar(
        select(models.VideoInterview)
        .where(models.VideoInterview.application_id == application_id)
        .order_by(models.VideoInterview.created_at.desc())
    )
    if not vi:
        return None
    return {
        "id": vi.id,
        "status": vi.status,
        "summary": vi.summary or "",
        "scores": vi.scores or {},
        "transcript": vi.transcript or "",
        "has_recording": bool(vi.recording),
    }

VALID_TYPES = {
    # Requested round vocabulary
    "screening", "assessment", "technical", "ai_interview",
    "round_1", "round_2", "round_3", "round_4", "final",
    # Retained for back-compat with existing rounds
    "phone_screen", "system_design", "cultural", "hr", "panel", "assignment", "other",
}
VALID_STATUS = {"draft", "scheduled", "completed", "cancelled", "no_show"}


def _next_round_number(db: Session, application_id: int) -> int:
    rows = db.scalars(
        select(models.InterviewRound.round_number)
        .where(models.InterviewRound.application_id == application_id)
    ).all()
    return (max(rows) + 1) if rows else 1


@router.get("", response_model=list[schemas.InterviewRoundOut])
def list_rounds(application_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(models.InterviewRound).order_by(
        models.InterviewRound.round_number.asc(),
        models.InterviewRound.scheduled_at.asc(),
    )
    if application_id is not None:
        stmt = stmt.where(models.InterviewRound.application_id == application_id)
    return db.scalars(stmt).all()


@router.get("/mine")
def my_rounds(db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    """Interview rounds the signed-in panelist is on, with just the prep they need
    (candidate capability, role, rubric) — no compensation or recruiter internals."""
    ident = _identity(user)
    rows = db.scalars(select(models.InterviewRound).order_by(models.InterviewRound.scheduled_at.asc())).all()
    out = []
    for r in rows:
        names = {str(p).strip().lower() for p in (r.panelists or [])}
        if not (ident & names):
            continue
        app = db.get(models.Application, r.application_id)
        if not app:
            continue
        cand = db.get(models.Candidate, app.candidate_id)
        hr = db.get(models.HiringRequest, app.hiring_request_id)
        job = db.scalar(select(models.Job).where(models.Job.hiring_request_id == app.hiring_request_id))
        mine = next((f for f in (r.panel_feedback or []) if str(f.get("panelist", "")).strip().lower() in ident), None)
        submitted = mine is not None
        # Other panelists' feedback is revealed only AFTER you submit yours (avoids anchoring).
        others = [
            {"panelist": e.get("panelist", ""), "rating": e.get("rating", 0),
             "recommendation": e.get("recommendation", ""), "feedback": e.get("feedback", "")}
            for e in (r.panel_feedback or []) if str(e.get("panelist", "")).strip().lower() not in ident
        ] if submitted else []
        out.append({
            "id": r.id,
            "interview_type": r.interview_type,
            "round_number": r.round_number,
            "status": r.status,
            "scheduled_at": r.scheduled_at,
            "duration_minutes": r.duration_minutes,
            "location_or_link": r.location_or_link,
            "notes": r.notes,
            "role_position": hr.position if hr else "",
            "role_requirements": (job.requirements if job else []) or [],
            "role_responsibilities": (job.responsibilities if job else []) or [],
            "candidate": _candidate_prep(cand),
            "ai": _ai_insight(app),
            "video": _video_brief(db, app.id),
            "rubric": (job.interview_rubric if job else []) or [],
            "suggested_questions": _panel_questions(job.screening_questions if job else []),
            "application_answers": _panel_answers(app.application_answers),
            "my_feedback": mine,
            "co_panelists": [p for p in (r.panelists or []) if str(p).strip().lower() not in ident],
            "others_feedback": others,
            "others_locked": (not submitted) and bool(r.panel_feedback),
            "panel_size": len(r.panelists or []),
            "feedback_count": len(r.panel_feedback or []),
        })
    return out


@router.post("/{round_id}/feedback")
def submit_panel_feedback(round_id: int, body: schemas.PanelFeedbackRequest,
                          db: Session = Depends(get_db), user: models.User = Depends(current_user)):
    """A panelist records their rating + recommendation + notes for a round. One entry per
    panelist (re-submitting updates it). Recruiters/managers may also record on behalf."""
    r = db.get(models.InterviewRound, round_id)
    if not r:
        raise HTTPException(404, "Interview round not found")
    ident = _identity(user)
    on_panel = bool(ident & {str(p).strip().lower() for p in (r.panelists or [])})
    is_staff = bool({"admin", "manager", "recruiter"} & {x.lower() for x in (user.roles or [])})
    if not (on_panel or is_staff):
        raise HTTPException(403, "You're not on this interview panel.")

    label = user.name or user.email
    entry = {
        "panelist": label,
        "rating": max(0, min(int(body.rating or 0), 5)),
        "recommendation": (body.recommendation or "").strip(),
        "feedback": (body.feedback or "").strip(),
        "at": datetime.now(timezone.utc).isoformat(),
    }
    entries = [e for e in (r.panel_feedback or []) if str(e.get("panelist", "")).strip().lower() not in ident]
    entries.append(entry)
    r.panel_feedback = entries
    # Keep the legacy free-text feedback in sync (a readable digest for the recruiter view).
    r.feedback = "\n\n".join(
        f"[{e['panelist']} · {e.get('recommendation') or 'feedback'}"
        + (f" · {e['rating']}/5" if e.get("rating") else "") + f"] {e.get('feedback', '')}".rstrip()
        for e in entries if e.get("feedback") or e.get("rating") or e.get("recommendation")
    )
    r.updated_at = datetime.now(timezone.utc)
    log(db, "interview.panel_feedback", "interview_round", r.id, {"by": label})
    db.commit()
    return {"ok": True}


@router.post("", response_model=schemas.InterviewRoundOut)
def create_round(body: schemas.InterviewRoundCreate, db: Session = Depends(get_db)):
    app = db.get(models.Application, body.application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    itype = body.interview_type if body.interview_type in VALID_TYPES else "other"
    status = body.status if body.status in VALID_STATUS else "scheduled"
    round_no = body.round_number if body.round_number > 0 else _next_round_number(db, body.application_id)

    row = models.InterviewRound(
        application_id=body.application_id,
        round_number=round_no,
        interview_type=itype,
        status=status,
        scheduled_at=body.scheduled_at.strip(),
        duration_minutes=max(15, min(body.duration_minutes, 480)),
        panelists=[p.strip() for p in body.panelists if p and str(p).strip()],
        location_or_link=body.location_or_link.strip(),
        notes=body.notes.strip(),
        feedback=body.feedback.strip(),
        assessment_id=body.assessment_id,
    )
    db.add(row)
    db.flush()
    log(db, "interview.round_created", "interview_round", row.id, {
        "application_id": body.application_id,
        "round": round_no,
        "type": itype,
    })
    db.commit()
    db.refresh(row)
    return row


@router.post("/bulk", response_model=schemas.BulkInterviewRoundsOut)
def bulk_create_rounds(body: schemas.BulkInterviewRoundsRequest, db: Session = Depends(get_db)):
    """Apply a job-level interview plan (a set of types) to many candidates at once.

    Round numbers continue from each candidate's existing rounds. By default a type a
    candidate already has is skipped, so re-running is safe.
    """
    types = [t for t in body.interview_types if t in VALID_TYPES]
    if not types:
        raise HTTPException(422, "Provide at least one valid interview type")
    app_ids = list(dict.fromkeys(body.application_ids))  # de-dup, preserve order
    if not app_ids:
        raise HTTPException(422, "Select at least one candidate")
    panelists = [p.strip() for p in body.panelists if p and str(p).strip()]
    duration = max(15, min(body.duration_minutes, 480))
    created = skipped = touched = 0
    for app_id in app_ids:
        app = db.get(models.Application, app_id)
        if not app:
            continue
        touched += 1
        existing = set(db.scalars(
            select(models.InterviewRound.interview_type)
            .where(models.InterviewRound.application_id == app_id)
        ).all())
        next_no = _next_round_number(db, app_id)
        for t in types:
            if body.skip_existing and t in existing:
                skipped += 1
                continue
            db.add(models.InterviewRound(
                application_id=app_id, round_number=next_no, interview_type=t,
                status="scheduled", duration_minutes=duration, panelists=panelists,
            ))
            existing.add(t)
            next_no += 1
            created += 1
    log(db, "interview.rounds_bulk_created", "interview_round", None,
        {"applications": touched, "created": created, "skipped": skipped, "types": types})
    db.commit()
    return schemas.BulkInterviewRoundsOut(created=created, skipped=skipped, applications=touched)


@router.patch("/{round_id}", response_model=schemas.InterviewRoundOut)
def update_round(round_id: int, body: schemas.InterviewRoundUpdate, db: Session = Depends(get_db)):
    row = db.get(models.InterviewRound, round_id)
    if not row:
        raise HTTPException(404, "Interview round not found")
    data = body.model_dump(exclude_unset=True)
    if "interview_type" in data and data["interview_type"] not in VALID_TYPES:
        data["interview_type"] = "other"
    if "status" in data and data["status"] not in VALID_STATUS:
        data.pop("status")
    if "panelists" in data:
        data["panelists"] = [p.strip() for p in data["panelists"] if p and str(p).strip()]
    if "duration_minutes" in data:
        data["duration_minutes"] = max(15, min(data["duration_minutes"], 480))
    for key, val in data.items():
        setattr(row, key, val.strip() if isinstance(val, str) else val)
    row.updated_at = datetime.now(timezone.utc)
    log(db, "interview.round_updated", "interview_round", row.id, {"fields": list(data.keys())})
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{round_id}", status_code=204)
def delete_round(round_id: int, db: Session = Depends(get_db)):
    row = db.get(models.InterviewRound, round_id)
    if not row:
        raise HTTPException(404, "Interview round not found")
    log(db, "interview.round_deleted", "interview_round", row.id, {"application_id": row.application_id})
    db.delete(row)
    db.commit()
