"""Pipeline view, stage transitions, re-scoring, human overrides, analytics, audit."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..deps import require_roles
from ..services import recruitment
from ..services import resume_extract
from ..services import scoring
from ..services.ai import ai
from ..services.documents import render_document
from ..services.jobs_table import _panel_email

router = APIRouter(prefix="/api", tags=["pipeline"])

STAGES = ["applied", "screening", "shortlisted", "interview", "offer", "hired", "rejected"]


def _ensure_hire_artifacts(db: Session, app: models.Application) -> None:
    """When a candidate is marked Hired, auto-create their offer letter (once) so they appear
    on the Offer & Docs page, ready to manage. The onboarding plan is intentionally NOT created
    here — a candidate only enters Onboarding once HR marks "move to onboarding" in Offer & Docs.
    Idempotent — never duplicates if an offer already exists."""
    hr = app.hiring_request
    cand = app.candidate

    has_offer = db.scalar(
        select(models.Document.id).where(
            models.Document.application_id == app.id,
            models.Document.doc_type.in_(("offer_letter", "traineeship_offer")),
        ).limit(1)
    )
    if not has_offer:
        # Draft the EZ Lab letter from a template (trainee roles get the traineeship offer),
        # grounded in the role's title, JD responsibilities and CTC. HR edits terms + approves.
        pos = (hr.position if hr else "").lower()
        template_key = "traineeship_offer" if any(w in pos for w in ("trainee", "intern")) else "offer_letter"
        job = hr.job if hr else None
        rendered = render_document(template_key, {
            "name": (cand.name if cand else "") or "",
            "designation": hr.position if hr else "",
            "responsibilities": (list(job.responsibilities) if job and job.responsibilities else None),
            "budget_ctc": hr.budget_ctc if hr else "",
            "company": settings.COMPANY_NAME,
        })
        db.add(models.Document(
            application_id=app.id, candidate_id=app.candidate_id, doc_type=rendered["doc_type"],
            template_key=template_key, title=rendered["title"], content=rendered["content"],
            blocks=rendered["blocks"], terms={}, status="draft", ai_provider="template",
        ))


@router.get("/pipeline/{hr_id}", response_model=list[schemas.ApplicationWithCandidate])
def pipeline_for_role(hr_id: int, db: Session = Depends(get_db)):
    hr = db.get(models.HiringRequest, hr_id)
    if not hr:
        raise HTTPException(404, "Hiring request not found")
    apps = db.scalars(
        select(models.Application)
        .where(models.Application.hiring_request_id == hr_id)
        .options(selectinload(models.Application.candidate))
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
        .options(selectinload(models.Application.candidate))  # avoid N+1 candidate lazy-loads
        .order_by(models.Application.score_overall.desc())
    ).all()

    # Auto-heal: re-derive any score computed by an OLD matcher version with the current one
    # (deterministic, no LLM calls). One-time per application — version-gated, so the live-poll
    # refresh never re-does it. This is what makes existing pipelines reflect matcher upgrades
    # without anyone clicking "Re-score all".
    stale = [a for a in apps if a.scored_at and (a.score_breakdown or {}).get("scorer_version") != scoring.SCORER_VERSION]
    if stale:
        role_vec = recruitment.embeddings.embed(recruitment.role_text(hr))
        for a in stale:
            try:
                recruitment.score_application(db, a, reuse_ai=True, role_vec=role_vec)
                db.commit()  # per-app commit isolates a single failure
            except Exception:
                db.rollback()
        apps = db.scalars(
            select(models.Application)
            .where(models.Application.hiring_request_id == hr_id)
            .options(selectinload(models.Application.candidate))
            .order_by(models.Application.score_overall.desc())
        ).all()

    # Embed roles once; used to suggest a better-fit role for candidates the AI rejects here.
    role_vecs = recruitment.build_role_vectors(db)

    # Batch-load interviews / emails / rounds for ALL applications in 3 queries instead of 3-per-app
    # (this endpoint is polled live, so the old N+1 dominated the shortlisting slowness).
    app_ids = [a.id for a in apps]
    ivs_by_app: dict[int, list] = defaultdict(list)
    for iv in db.scalars(select(models.ScreeningInterview)
                         .where(models.ScreeningInterview.application_id.in_(app_ids))
                         .order_by(models.ScreeningInterview.created_at.desc())):
        ivs_by_app[iv.application_id].append(iv)
    emails_by_app: dict[int, list] = defaultdict(list)
    for em in db.scalars(select(models.EmailMessage)
                         .where(models.EmailMessage.application_id.in_(app_ids))
                         .order_by(models.EmailMessage.created_at.desc())):
        emails_by_app[em.application_id].append(em)
    rounds_by_app: dict[int, list] = defaultdict(list)
    for r in db.scalars(select(models.InterviewRound)
                        .where(models.InterviewRound.application_id.in_(app_ids))
                        .order_by(models.InterviewRound.round_number.asc())):
        rounds_by_app[r.application_id].append(r)

    rows = []
    for app in apps:
        interviews = ivs_by_app.get(app.id, [])
        latest_iv = interviews[0] if interviews else None
        emails = emails_by_app.get(app.id, [])
        screening_status = "none"
        screening_score = None
        screening_rec = ""
        if latest_iv:
            screening_status = latest_iv.status
            screening_score = (latest_iv.scores or {}).get("overall")
            screening_rec = latest_iv.recommendation or ""
        last_email = emails[0] if emails else None
        iv_rounds = rounds_by_app.get(app.id, [])
        scheduled_rounds = [r for r in iv_rounds if r.status == "scheduled"]
        next_round = scheduled_rounds[0] if scheduled_rounds else None
        next_label = ""
        if next_round:
            next_label = f"R{next_round.round_number} {next_round.interview_type.replace('_', ' ')}"
        stage = app.stage
        cand = app.candidate
        # Use the already-stored parsed résumé (fast). Only parse on the fly if it's genuinely
        # missing — re-parsing every candidate on every poll was a big part of the slowness.
        parsed = cand.parsed or (
            resume_extract.parse_resume_text(
                cand.resume_text or "", fallback_name=cand.name or "", fallback_source=cand.source or "direct")
            if (cand.resume_text or "").strip() else {}
        )
        profile = resume_extract.table_fields(parsed, cand)
        # When the AI recommends against this role, suggest a better-fit open role instead.
        suggested_role = None
        if (app.recommendation or "").lower() in ("no", "weak", "reject"):
            alt = recruitment.suggest_roles_for(cand, role_vecs, limit=1, exclude_hr_id=hr_id)
            if alt:
                suggested_role = alt[0]
        rows.append({
            **schemas.ApplicationWithCandidate.model_validate(app).model_dump(),
            "profile": profile,
            "suggested_role": suggested_role,
            "stage_changed_at": app.stage_changed_at or app.scored_at or app.created_at,
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
    # COUNT(*) — never load all candidate rows (with their PDF blobs) just to size the pool.
    pool_count = db.scalar(select(func.count(models.Candidate.id))) or 0
    return {
        "id": hr.id,
        "position": hr.position,
        "department": hr.department,
        "location": hr.location,
        "work_mode": hr.work_mode,
        "status": hr.status,
        "num_openings": hr.num_openings,
        "hiring_manager": hr.hiring_manager or _panel_email(hr.interview_panel or [], 1),
        "recruiter": hr.recruiter or _panel_email(hr.interview_panel or [], 0),
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
    if old != body.stage:
        app.stage_changed_at = datetime.now(timezone.utc)
    if body.note:
        app.notes = (app.notes + "\n" + body.note).strip() if app.notes else body.note
    recruitment.log(db, "application.stage_changed", "application", app.id, {"from": old, "to": body.stage}, actor="recruiter")
    db.commit()  # persist the stage change + audit FIRST so artifact generation can never undo it
    db.refresh(app)
    # On entering "hired", auto-create the offer letter + onboarding plan (once), in their own
    # transaction — a generation/DB error rolls back only the artifacts, not the stage change.
    if body.stage == "hired" and old != "hired":
        try:
            _ensure_hire_artifacts(db, app)
            db.commit()
        except Exception:
            db.rollback()
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


@router.post("/applications/rescore-all")
def rescore_all(
    hr_id: int | None = None,
    db: Session = Depends(get_db),
    _user: models.User = Depends(require_roles("admin", "manager")),
):
    """Re-score every application (optionally just one job's) with the CURRENT matcher, so an
    existing pipeline benefits from matching improvements. Re-derives the deterministic skill/
    experience match and keeps each application's prior AI soft-skill judgment — no new LLM calls,
    so it's fast and quota-free. Per-application try/commit isolates any single failure."""
    stmt = select(models.Application)
    if hr_id is not None:
        stmt = stmt.where(models.Application.hiring_request_id == hr_id)
    apps = db.scalars(stmt).all()

    # Embed each distinct role ONCE (not per application) — the deterministic re-score reuses it.
    role_vecs: dict[int, list[float]] = {}
    for rid in {a.hiring_request_id for a in apps}:
        hr = db.get(models.HiringRequest, rid)
        if hr:
            role_vecs[rid] = recruitment.embeddings.embed(recruitment.role_text(hr))

    rescored = failed = 0
    failed_ids: list[int] = []
    for app in apps:
        try:
            recruitment.score_application(db, app, reuse_ai=True, role_vec=role_vecs.get(app.hiring_request_id))
            db.commit()
            rescored += 1
        except Exception as e:  # isolate a single bad application; keep going
            db.rollback()
            failed += 1
            failed_ids.append(app.id)
            try:
                recruitment.log(db, "application.rescore_failed", "application", app.id, {"error": str(e)[:300]})
                db.commit()
            except Exception:
                db.rollback()

    # Best-effort summary audit — never let it turn a completed re-score into a 500.
    try:
        recruitment.log(db, "application.rescored_all", "application", None,
                        {"rescored": rescored, "failed": failed, "hr_id": hr_id})
        db.commit()
    except Exception:
        db.rollback()
    return {"rescored": rescored, "failed": failed, "failed_ids": failed_ids[:50], "total": len(apps)}


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
    # Only the `source` column is needed here — never pull full Candidate rows (résumé PDF blobs).
    cand_sources = db.execute(select(models.Candidate.source)).scalars().all()
    roles = db.scalars(select(models.HiringRequest)).all()

    funnel = {s: 0 for s in STAGES}
    for a in apps:
        funnel[a.stage] = funnel.get(a.stage, 0) + 1
    total = len(apps)
    hired = funnel.get("hired", 0)

    # Candidate sources
    sources: dict[str, int] = {}
    for src in cand_sources:
        key = (src or "direct").strip() or "direct"
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

    # Top roles by applicant volume + per-role funnel breakdown.
    counts: dict[int, int] = {}
    hired_by_role: dict[int, int] = {}
    funnel_by_role: dict[int, dict[str, int]] = {}
    for a in apps:
        counts[a.hiring_request_id] = counts.get(a.hiring_request_id, 0) + 1
        rf = funnel_by_role.setdefault(a.hiring_request_id, {s: 0 for s in STAGES})
        rf[a.stage] = rf.get(a.stage, 0) + 1
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
    # Per-role funnel list the dashboard's role selector iterates; ordered by applicant volume so
    # the most active roles surface first. Only roles that actually have applications are included.
    funnel_roles = [
        {"role_id": rid, "position": role_pos.get(rid, f"Role #{rid}"), "funnel": funnel_by_role[rid]}
        for rid, _ in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    ]

    # ── Decision-grade KPIs (Analytics page) ─────────────────────────────────
    # Open roles = roles actively taking applicants (published/open), not every row ever created.
    open_roles = sum(1 for r in roles if (r.status or "draft") in ("published", "open"))
    # Avg AI score over SCORED applications only (score_overall > 0) — matches the score-distribution
    # chart, which skips unscored rows, instead of being diluted by not-yet-scored zeros.
    scored = [a for a in apps if (a.score_overall or 0) > 0]
    avg_score = round(sum(a.score_overall for a in scored) / len(scored), 1) if scored else 0
    # Active candidates = people with at least one application still in a non-terminal stage.
    active_app_cand_ids = {a.candidate_id for a in apps if a.stage not in ("hired", "rejected")}
    active_candidates = len(active_app_cand_ids)
    # Stage pass-through: how many applications reached at least each stage (cumulative on the funnel
    # order). Lets the UI show applied→screen→interview→offer→hire conversion, not just current-stage.
    stage_seq = ["applied", "screening", "shortlisted", "interview", "offer", "hired"]
    reached = {s: 0 for s in stage_seq}
    for a in apps:
        if a.stage == "rejected":
            # Rejected apps still counted as "applied" (they entered the pipeline) but not beyond.
            reached["applied"] += 1
            continue
        try:
            idx = stage_seq.index(a.stage)
        except ValueError:
            idx = 0
        for i in range(idx + 1):
            reached[stage_seq[i]] += 1
    offers = reached.get("offer", 0)
    # Offer-accept rate = hires / offers reached (how many offers turned into hires).
    offer_accept_rate = round(100 * hired / offers, 1) if offers else 0
    interview_to_offer = round(100 * offers / reached["interview"], 1) if reached.get("interview") else 0

    return {
        "total_roles": len(roles),
        "open_roles": open_roles,
        "active_candidates": active_candidates,
        "total_candidates": len(cand_sources),
        "total_applications": total,
        "published_roles": by_status.get("published", 0),
        "funnel": funnel,
        "funnel_by_role": funnel_roles,
        "stage_reached": reached,
        "conversion_rate": round(100 * hired / total, 1) if total else 0,
        "offer_accept_rate": offer_accept_rate,
        "interview_to_offer_rate": interview_to_offer,
        "total_hired": hired,
        "total_offers": offers,
        "avg_score": avg_score,
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
