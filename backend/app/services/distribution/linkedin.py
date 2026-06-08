"""LinkedIn company-page auto-share via the Posts API.

Posts a job announcement to a Company Page feed. This is NOT a native LinkedIn job
listing (that API is partner-gated and closed to new partners) — it's a real, free,
automated social post that links back to the role's careers page, so applicants flow
into the pipeline. Guarded + lazy like the Google module.

Requirements (provided by the operator):
  - a LinkedIn developer app with an org access token (w_organization_social scope),
  - LINKEDIN_ORG_URN, e.g. "urn:li:organization:1234567" (you must be a page admin).
"""
from __future__ import annotations

import httpx

from ...config import settings

_POSTS_URL = "https://api.linkedin.com/rest/posts"


def share(text: str, link: str = "") -> dict:
    """Publish a post to the configured Company Page. Returns {ok, urn} or {ok:False, error}."""
    if not settings.linkedin_configured:
        return {"ok": False, "skipped": True, "error": "LinkedIn not configured"}

    commentary = (text or "").strip() or "We're hiring!"
    if link:
        commentary = f"{commentary}\n\n{link}".strip()

    body = {
        "author": settings.LINKEDIN_ORG_URN,
        "commentary": commentary,
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    headers = {
        "Authorization": f"Bearer {settings.LINKEDIN_ACCESS_TOKEN}",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": settings.LINKEDIN_API_VERSION,
        "Content-Type": "application/json",
    }
    try:
        resp = httpx.post(_POSTS_URL, headers=headers, json=body, timeout=20)
        if resp.status_code >= 400:
            return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}"}
        urn = resp.headers.get("x-restli-id") or resp.headers.get("x-linkedin-id") or ""
        return {"ok": True, "urn": urn}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
