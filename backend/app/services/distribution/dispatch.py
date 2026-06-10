"""Orchestrates direct posting for a job across the configured channels.

Best-effort and non-raising: it mutates ``job.distribution`` with per-channel results
and lets the caller commit (same contract as the mailer). Unconfigured channels are
simply skipped, so publishing a job costs nothing when nothing is set up.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ...config import settings
from ..salary import canonicalize_salary
from . import google_indexing, linkedin


def careers_url(job) -> str:
    """Absolute public URL of the role's careers page (empty if PUBLIC_BASE_URL unset)."""
    base = (settings.PUBLIC_BASE_URL or "").rstrip("/")
    return f"{base}/careers/{job.id}" if base else ""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def run(db: Session, job, *, channels=("google", "linkedin"), force: bool = False) -> dict:
    """Push the job to the requested channels. Mutates job.distribution; caller commits.

    Never raises. `force` re-posts even if already done (used by the manual buttons);
    auto-publish skips LinkedIn if the role was already shared, to avoid duplicate posts.
    """
    dist = dict(job.distribution or {})
    url = careers_url(job)
    results: dict = {}

    if "google" in channels and settings.google_indexing_configured:
        r = google_indexing.notify(url, "URL_UPDATED")
        results["google"] = r
        if not r.get("skipped"):
            dist["google"] = {"ok": bool(r.get("ok")), "at": _now_iso(), "error": r.get("error", "")}

    if "linkedin" in channels and settings.linkedin_configured:
        already = (dist.get("linkedin") or {}).get("urn")
        if already and not force:
            results["linkedin"] = {"ok": True, "skipped": True, "urn": already}
        else:
            text = (job.linkedin_copy or job.social_copy or "").strip()
            if not text:
                title = job.title or (job.hiring_request.position if job.hiring_request else "a new role")
                text = f"We're hiring: {title}. Apply here:"
            # Never publish a salary figure that contradicts the recruiter's budget_ctc.
            budget = (job.hiring_request.budget_ctc or "").strip() if job.hiring_request else ""
            text = canonicalize_salary(text, budget)
            r = linkedin.share(text, url)
            results["linkedin"] = r
            entry = {"ok": bool(r.get("ok")), "at": _now_iso(), "error": r.get("error", "")}
            if r.get("urn"):
                entry["urn"] = r["urn"]
            dist["linkedin"] = entry

    job.distribution = dist
    return results
