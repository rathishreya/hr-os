"""Direct job-board posting integrations (Google Indexing API, LinkedIn Posts API).

Every function here is lazy and guarded: when an integration isn't configured (or an
optional dependency is missing) it returns a ``{"ok": False, "skipped": True, ...}``
dict instead of raising, so publishing a job never breaks because of distribution.
"""
from . import dispatch, google_indexing, linkedin

__all__ = ["dispatch", "google_indexing", "linkedin"]
