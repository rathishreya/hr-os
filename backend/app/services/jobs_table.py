"""Enrich hiring requests for the jobs list/table view."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .. import models
from .salary import parse_budget_ctc

STAGES_APPLICATION = {"applied", "screening"}
STAGES_SHORTLISTED = {"shortlisted"}
STAGES_INTERVIEW = {"interview"}
STAGES_PRE_OFFER = {"offer"}
STAGES_OFFERED = {"hired"}


def _salary_bounds(hr: models.HiringRequest) -> tuple[int | None, int | None]:
    # Bounds derive ONLY from the recruiter's budget_ctc (the displayed truth) so the table
    # tracks budget edits and never shows the stale AI estimate; "—" when no budget is set.
    return parse_budget_ctc(hr.budget_ctc or "")


def _level_label(hr: models.HiringRequest) -> str:
    if hr.yoe_min and hr.yoe_max and hr.yoe_min != hr.yoe_max:
        return f"{hr.yoe_min:g}–{hr.yoe_max:g} yr"
    if hr.yoe_max:
        return f"L{max(1, int(round(hr.yoe_max)))}"
    if hr.yoe_min:
        return f"{hr.yoe_min:g}+ yr"
    return "—"


def _employment_type(hr: models.HiringRequest) -> str:
    mode = (hr.work_mode or "onsite").lower()
    return {"remote": "Remote", "hybrid": "Hybrid", "onsite": "Full-time"}.get(mode, mode.title())


def _panel_email(panel: list, index: int) -> str:
    if not panel or index >= len(panel):
        return ""
    val = str(panel[index]).strip()
    return val if "@" in val else ""


def funnel_counts(apps: list[models.Application]) -> dict[str, int]:
    counts = {
        "application": 0,
        "shortlisted": 0,
        "interview": 0,
        "pre_offer": 0,
        "offered": 0,
        "rejected": 0,
        "total": len(apps),
    }
    for app in apps:
        stage = app.stage or "applied"
        if stage in STAGES_APPLICATION:
            counts["application"] += 1
        elif stage in STAGES_SHORTLISTED:
            counts["shortlisted"] += 1
        elif stage in STAGES_INTERVIEW:
            counts["interview"] += 1
        elif stage in STAGES_PRE_OFFER:
            counts["pre_offer"] += 1
        elif stage in STAGES_OFFERED:
            counts["offered"] += 1
        elif stage == "rejected":
            counts["rejected"] += 1
    return counts


def ageing_days(created_at: datetime | None) -> int:
    if not created_at:
        return 0
    now = datetime.now(timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return max(0, (now - created_at).days)


def row_from_hiring_request(hr: models.HiringRequest, apps: list[models.Application]) -> dict[str, Any]:
    job = hr.job
    sal_min, sal_max = _salary_bounds(hr)
    validation = hr.ai_validation or {}
    issues = (validation.get("issues") or []) + (validation.get("inconsistencies") or [])
    funnel = funnel_counts(apps)

    return {
        "id": hr.id,
        "position": hr.position,
        "department": hr.department,
        "location": hr.location,
        "work_mode": hr.work_mode,
        "status": hr.status,
        "priority": hr.priority,
        "yoe_min": hr.yoe_min,
        "yoe_max": hr.yoe_max,
        "num_openings": hr.num_openings,
        "budget_ctc": hr.budget_ctc,
        "created_at": hr.created_at,
        "has_jd": job is not None,
        "jd_id": job.id if job else None,
        "jd_status": job.status if job else "",
        "approved": job is not None and len(issues) == 0,
        "level_label": _level_label(hr),
        "employment_type": _employment_type(hr),
        "hire_type": "—",
        "salary_min": sal_min,
        "salary_max": sal_max,
        "ageing_days": ageing_days(hr.created_at),
        "hiring_manager": hr.hiring_manager or _panel_email(hr.interview_panel or [], 1),
        "recruiter": hr.recruiter or _panel_email(hr.interview_panel or [], 0),
        "funnel": funnel,
        "ai_summary": hr.ai_summary,
        "difficulty_score": hr.difficulty_score,
        "difficulty_label": hr.difficulty_label,
    }
