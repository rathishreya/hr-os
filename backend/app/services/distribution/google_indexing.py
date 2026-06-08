"""Google Indexing API — push JobPosting URLs to Google for near-instant indexing.

Free. Google for Jobs has no "post" endpoint; instead you notify the Indexing API
when a JobPosting page is added/updated/removed and Google recrawls it within minutes
(vs. days for sitemap-only). Auth is a service-account JWT (RS256) exchanged for an
access token, cached until just before it expires.

Requirements (provided by the operator):
  - a GCP service account with the Indexing API enabled (key as file or inline JSON),
  - the service account added as an owner of the careers domain in Search Console,
  - PUBLIC_BASE_URL pointing at that verified public domain.
"""
from __future__ import annotations

import json
import time
from typing import Any

import httpx

from ...config import settings

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_PUBLISH_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish"
_SCOPE = "https://www.googleapis.com/auth/indexing"

# Module-level access-token cache: {"value": str, "exp": float epoch seconds}
_TOKEN: dict[str, Any] = {"value": "", "exp": 0.0}


def _load_service_account() -> dict | None:
    raw = (settings.GOOGLE_INDEXING_SA_JSON or "").strip()
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            return None
    path = (settings.GOOGLE_INDEXING_SA_FILE or "").strip()
    if path:
        try:
            with open(path, encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            return None
    return None


def _access_token() -> tuple[str, str]:
    """Return (token, error). Reuses a cached token until ~5 min before expiry."""
    now = time.time()
    if _TOKEN["value"] and _TOKEN["exp"] - 300 > now:
        return _TOKEN["value"], ""

    sa = _load_service_account()
    if not sa or not sa.get("client_email") or not sa.get("private_key"):
        return "", "Google service account key is missing or invalid."
    try:
        import jwt  # PyJWT; RS256 needs the 'cryptography' backend
    except Exception:
        return "", "PyJWT is not installed on the server (add pyjwt[crypto])."

    try:
        iat = int(now)
        assertion = jwt.encode(
            {"iss": sa["client_email"], "scope": _SCOPE, "aud": _TOKEN_URL, "iat": iat, "exp": iat + 3600},
            sa["private_key"],
            algorithm="RS256",
        )
        resp = httpx.post(
            _TOKEN_URL,
            data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion},
            timeout=15,
        )
        if resp.status_code >= 400:
            return "", f"Google token exchange failed: HTTP {resp.status_code} {resp.text[:160]}"
        data = resp.json()
        _TOKEN["value"] = data["access_token"]
        _TOKEN["exp"] = now + int(data.get("expires_in", 3600))
        return _TOKEN["value"], ""
    except Exception as exc:
        return "", f"Google auth error: {exc}"


def notify(url: str, kind: str = "URL_UPDATED") -> dict:
    """Notify Google that a JobPosting URL was updated (URL_UPDATED) or removed (URL_DELETED)."""
    if not settings.google_indexing_configured:
        return {"ok": False, "skipped": True, "error": "Google Indexing not configured"}
    if not url or url.startswith("http://localhost") or "127.0.0.1" in url:
        return {"ok": False, "skipped": True, "error": "Needs a public URL — set PUBLIC_BASE_URL"}

    token, err = _access_token()
    if err:
        return {"ok": False, "error": err}
    try:
        resp = httpx.post(
            _PUBLISH_URL,
            headers={"Authorization": f"Bearer {token}"},
            json={"url": url, "type": kind},
            timeout=15,
        )
        if resp.status_code >= 400:
            return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
        return {"ok": True, "type": kind, "url": url}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
