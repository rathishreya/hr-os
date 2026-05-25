"""Pipeline view, stage transitions, re-scoring, human overrides, analytics, audit."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services import recruitment
from ..services import resume_extract
from ..services.jobs_table import _panel_email

router = APIRouter(prefix="/api", tags=["pipeline"])

STAGES = ["applied", "screening", "shortlisted", "interview", "offer", "hired", "rejected"]


@router.get("/pipeline/{hr_id}", response_model=list[schemas.ApplicationWithCandidate])
def pipeline_for_role(hr_id: int, db: Session = Depends(get_db)):
    hr = db.get(models.HiringRequest, hr_id)
    if not hr:
        raise HTTPException(404, "Hiring request not found")
    apps = db.scalars(
        select(models.Application)
        .where(models.Application.hiring_request_id == hr_id)
        .order_by(models.Application.score_overall.desc())
    ).all()
    return apps


def _activity_label(
    stage: str,
    screening_status: str,
    email_count: int,
    interview_scheduled: int = 0,
    interview_next: str = "",
) -> str:
    if interview_scheduled > 0 and interview_next:
        return f"Interview scheduled — {interview_next}"
    if interview_scheduled > 0:
        return f"{interview_scheduled} interview(s) scheduled"
    if screening_status == "in_progress":
        return "AI interview in progress"
    if stage == "screening":
        return "Awaiting AI screen"
    if stage == "interview":
        return "Interview stage"
    if stage == "offer":
        return "Offer pending"
    if stage == "hired":
        return "Hired"
    if stage == "rejected":
        return "Rejected"
    if email_count > 0:
        return "Email sent"
    if screening_status == "completed":
        return "Screening done — review"
    return "New application"


@router.get("/pipeline/{hr_id}/board")
def pipeline_board(hr_id: int, db: Session = Depends(get_db)):
    """Enriched pipeline rows for the management table (screening, emails, live status)."""
    hr = db.get(models.HiringRequest, hr_id)
    if not hr:
        raise HTTPException(404, "Hiring request not found")
    apps = db.scalars(
        select(models.Application)
        .where(models.Application.hiring_request_id == hr_id)
        .order_by(models.Application.score_overall.desc())
    ).all()
    rows = []
    for app in apps:
        interviews = db.scalars(
            select(models.ScreeningInterview)
            .where(models.ScreeningInterview.application_id == app.id)
            .order_by(models.ScreeningInterview.created_at.desc())
        ).all()
        latest_iv = interviews[0] if interviews else None
        emails = db.scalars(
            select(models.EmailMessage)
            .where(models.EmailMessage.application_id == app.id)
            .order_by(models.EmailMessage.created_at.desc())
        ).all()
        screening_status = "none"
        screening_score = None
        screening_rec = ""
        if latest_iv:
            screening_status = latest_iv.status
            screening_score = (latest_iv.scores or {}).get("overall")
            screening_rec = latest_iv.recommendation or ""
        last_email = emails[0] if emails else None
        iv_rounds = db.scalars(
            select(models.InterviewRound)
            .where(models.InterviewRound.application_id == app.id)
            .order_by(models.InterviewRound.round_number.asc())
        ).all()
        scheduled_rounds = [r for r in iv_rounds if r.status == "scheduled"]
        next_round = scheduled_rounds[0] if scheduled_rounds else None
        next_label = ""
        if next_round:
            next_label = f"R{next_round.round_number} {next_round.interview_type.replace('_', ' ')}"
        stage = app.stage
        cand = app.candidate
        parsed = resume_extract.enrich_from_resume(
            cand.parsed or {}, cand.resume_text or "",
            name=cand.name or "", email=cand.email or "", phone=cand.phone or "",
            source=cand.source or "direct",
        )
        profile = resume_extract.table_fields(parsed, cand)
        rows.append({
            **schemas.ApplicationWithCandidate.model_validate(app).model_dump(),
            "profile": profile,
            "stage_changed_at": app.scored_at or app.created_at,
            "meta": {
                "screening_status": screening_status,
                "screening_score": screening_score,
                "screening_recommendation": screening_rec,
                "screening_summary": latest_iv.summary if latest_iv else "",
                "email_count": len(emails),
                "last_email_template": last_email.template if last_email else "",
                "last_email_status": last_email.status if last_email else "",
                "last_email_at": last_email.created_at if last_email else None,
                "has_notes": bool((app.notes or "").strip()),
                "activity": _activity_label(
                    stage, screening_status, len(emails), len(scheduled_rounds), next_label,
                ),
                "is_live": screening_status == "in_progress",
                "interview_rounds_total": len(iv_rounds),
                "interview_rounds_scheduled": len(scheduled_rounds),
                "interview_next_round": next_round.round_number if next_round else None,
            },
        })
    return rows


@router.get("/pipeline/{hr_id}/summary")
def pipeline_summary(hr_id: int, db: Session = Depends(get_db)):
    """Role header metadata + tab counts for the applications workspace."""
    hr = db.get(models.HiringRequest, hr_id)
    if not hr:
        raise HTTPException(404, "Hiring request not found")
    apps = db.scalars(
        select(models.Application).where(models.Application.hiring_request_id == hr_id)
    ).all()
    stages = [a.stage for a in apps]
    pool_count = len(db.scalars(select(models.Candidate)).all())
    return {
        "id": hr.id,
        "position": hr.position,
        "department": hr.department,
        "location": hr.location,
        "work_mode": hr.work_mode,
        "status": hr.status,
        "num_openings": hr.num_openings,
        "hiring_manager": _panel_email(hr.interview_panel or [], 1),
        "recruiter": _panel_email(hr.interview_panel or [], 0),
        "counts": {
            "applications": len(apps),
            "shortlisted": sum(1 for s in stages if s == "shortlisted"),
            "positions": sum(1 for s in stages if s in ("offer", "hired")),
            "talent_pool": pool_count,
        },
        "funnel": {s: stages.count(s) for s in STAGES},
    }


@router.get("/applications/{app_id}", response_model=schemas.ApplicationWithCandidate)
def get_application(app_id: int, db: Session = Depends(get_db)):
    app = db.get(models.Application, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    return app


@router.patch("/applications/{app_id}/stage", response_model=schemas.ApplicationOut)
def move_stage(app_id: int, body: schemas.StageUpdate, db: Session = Depends(get_db)):
    app = db.get(models.Application, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    if body.stage not in STAGES:
        raise HTTPException(422, f"Invalid stage. Must be one of {STAGES}")
    old = app.stage
    app.stage = body.stage
    if body.note:
        app.notes = (app.notes + "\n" + body.note).strip() if app.notes else body.note
    recruitment.log(db, "application.stage_changed", "application", app.id, {"from": old, "to": body.stage}, actor="recruiter")
    db.commit()
    db.refresh(app)
    return app


@router.put("/applications/{app_id}/score", response_model=schemas.ApplicationOut)
def rescore(app_id: int, weights: schemas.ScoringWeights | None = None, db: Session = Depends(get_db)):
    app = db.get(models.Application, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    w = weights.model_dump() if weights else None
    recruitment.score_application(db, app, w)
    db.commit()
    db.refresh(app)
    return app


@router.put("/applications/{app_id}/override", response_model=schemas.ApplicationOut)
def human_override(app_id: int, body: dict, db: Session = Depends(get_db)):
    """Record a human decision that supersedes the AI suggestion (compliance: keep humans in the loop)."""
    app = db.get(models.Application, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    app.human_override = {
        "recommendation": body.get("recommendation", ""),
        "note": body.get("note", ""),
        "by": body.get("by", "recruiter"),
    }
    recruitment.log(db, "application.human_override", "application", app.id, app.human_override, actor=body.get("by", "recruiter"))
    db.commit()
    db.refresh(app)
    return app


@router.patch("/applications/{app_id}/notes", response_model=schemas.ApplicationOut)
def update_notes(app_id: int, body: schemas.NotesUpdate, db: Session = Depends(get_db)):
    app = db.get(models.Application, app_id)
    if not app:
        raise HTTPException(404, "Application not found")
    app.notes = body.notes
    recruitment.log(db, "application.notes_updated", "application", app.id, {}, actor="recruiter")
    db.commit()
    db.refresh(app)
    return app


@router.get("/analytics/overview")
def analytics_overview(db: Session = Depends(get_db)):
    apps = db.scalars(select(models.Application)).all()
    candidates = db.scalars(select(models.Candidate)).all()
    roles = db.scalars(select(models.HiringRequest)).all()

    funnel = {s: 0 for s in STAGES}
    for a in apps:
        funnel[a.stage] = funnel.get(a.stage, 0) + 1
    total = len(apps)
    hired = funnel.get("hired", 0)

    # Candidate sources
    sources: dict[str, int] = {}
    for c in candidates:
        key = (c.source or "direct").strip() or "direct"
        sources[key] = sources.get(key, 0) + 1

    # AI score distribution (scored applications only)
    buckets = {"0-40": 0, "40-60": 0, "60-75": 0, "75-90": 0, "90-100": 0}
    for a in apps:
        s = a.score_overall or 0
        if s <= 0:
            continue
        if s < 40:
            buckets["0-40"] += 1
        elif s < 60:
            buckets["40-60"] += 1
        elif s < 75:
            buckets["60-75"] += 1
        elif s < 90:
            buckets["75-90"] += 1
        else:
            buckets["90-100"] += 1

    # Roles by difficulty / status, and average estimated time-to-hire
    by_difficulty: dict[str, int] = {}
    by_status: dict[str, int] = {}
    tth: list[int] = []
    for r in roles:
        by_difficulty[r.difficulty_label or "unrated"] = by_difficulty.get(r.difficulty_label or "unrated", 0) + 1
        by_status[r.status or "draft"] = by_status.get(r.status or "draft", 0) + 1
        if r.est_time_to_hire_days:
            tth.append(r.est_time_to_hire_days)

    # AI recommendations across applications
    recs: dict[str, int] = {}
    for a in apps:
        if a.recommendation:
            recs[a.recommendation] = recs.get(a.recommendation, 0) + 1

    # Top roles by applicant volume
    counts: dict[int, int] = {}
    hired_by_role: dict[int, int] = {}
    for a in apps:
        counts[a.hiring_request_id] = counts.get(a.hiring_request_id, 0) + 1
        if a.stage == "hired":
            hired_by_role[a.hiring_request_id] = hired_by_role.get(a.hiring_request_id, 0) + 1
    role_pos = {r.id: r.position for r in roles}
    top_roles = sorted(
        (
            {"position": role_pos.get(rid, f"Role #{rid}"), "applicants": n, "hired": hired_by_role.get(rid, 0)}
            for rid, n in counts.items()
        ),
        key=lambda x: x["applicants"],
        reverse=True,
    )[:6]

    return {
        "total_roles": len(roles),
        "total_candidates": len(candidates),
        "total_applications": total,
        "published_roles": by_status.get("published", 0),
        "funnel": funnel,
        "conversion_rate": round(100 * hired / total, 1) if total else 0,
        "avg_score": round(sum(a.score_overall for a in apps) / total, 1) if total else 0,
        "avg_time_to_hire": round(sum(tth) / len(tth)) if tth else 0,
        "sources": sources,
        "score_distribution": buckets,
        "roles_by_difficulty": by_difficulty,
        "roles_by_status": by_status,
        "recommendations": recs,
        "top_roles": top_roles,
    }


@router.get("/audit")
def audit_log(limit: int = 50, db: Session = Depends(get_db)):
    rows = db.scalars(select(models.AuditLog).order_by(models.AuditLog.created_at.desc()).limit(limit)).all()
    return [
        {
            "id": r.id,
            "actor": r.actor,
            "action": r.action,
            "entity": r.entity,
            "entity_id": r.entity_id,
            "detail": r.detail,
            "created_at": r.created_at,
        }
        for r in rows
    ]
