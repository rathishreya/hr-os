"""Serve user-uploaded files so they can never run as a script in the browser.

Every uploaded file in this system — résumés, assessment attachments, identity documents — is
served back from the application's OWN origin. If the browser is told one of them is text/html (or
an SVG, which can carry script), it renders it, and any JavaScript inside runs with the session's
cookies and token. An applicant chooses their file's Content-Type at upload, so trusting that value
is a stored-XSS hole: upload "resume.pdf" whose bytes are HTML and whose declared type is text/html,
wait for a recruiter to preview it, and the script runs as them.

The defence is to never echo the uploader's Content-Type. The extension we can see decides how the
file is served: a short allow-list of genuinely inert document/image types is served inline with a
type WE choose; everything else is forced to download as an opaque octet-stream that the browser
will not execute. `nosniff` stops the browser second-guessing either decision.
"""
from __future__ import annotations

import os
import re

# Types a browser renders but cannot be tricked into executing as script. Served inline so the
# in-app preview keeps working. Deliberately excludes text/html and image/svg+xml.
_INLINE_SAFE = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}

#: Upload Content-Types we refuse outright, because their only purpose on this origin is to carry
#: script. Everything else is accepted and simply served as an attachment later.
_FORBIDDEN_UPLOAD_MIME = {"text/html", "application/xhtml+xml", "image/svg+xml"}


def _clean_name(filename: str | None) -> str:
    """A filename safe to put in a Content-Disposition header: no CR/LF/quote/control chars that
    could inject a second header, and length-bounded."""
    safe = re.sub(r'[\r\n"\x00-\x1f]+', "", filename or "")[:200]
    return safe or "file"


def serve(content: bytes, filename: str | None, *, media_type=None, response_cls=None):
    """Build a Response that serves `content` under a SERVER-CHOSEN type derived from the filename
    extension — never the uploader's. Known document/image types render inline; anything else is
    sent as a download. `media_type`/`response_cls` exist only for tests; callers pass neither.
    """
    from fastapi import Response  # local import keeps this module dependency-light

    mime, headers = headers_for(filename)
    return Response(content=content, media_type=mime, headers=headers)


def headers_for(filename: str | None) -> tuple[str, dict[str, str]]:
    """(media_type, headers) for serving an uploaded file inertly. The extension decides: an
    allow-listed document/image is served inline with the type WE pick; everything else downloads
    as application/octet-stream. nosniff on both so the browser respects the choice."""
    ext = os.path.splitext(filename or "")[1].lower()
    name = _clean_name(filename)
    mime = _INLINE_SAFE.get(ext)
    disposition = "inline"
    if not mime:
        mime, disposition = "application/octet-stream", "attachment"
    return mime, {
        "Content-Disposition": f'{disposition}; filename="{name}"',
        "X-Content-Type-Options": "nosniff",
    }


def reject_dangerous_upload(content_type: str | None) -> None:
    """Refuse an upload whose declared type exists only to run as script. Belt-and-braces: the
    serve path already ignores the stored type, but rejecting at the door means the bytes never
    land in the store at all."""
    from fastapi import HTTPException

    if (content_type or "").split(";")[0].strip().lower() in _FORBIDDEN_UPLOAD_MIME:
        raise HTTPException(415, "That file type can't be uploaded here.")


def stored_mime(filename: str | None, declared: str | None = None) -> str:
    """The Content-Type to RECORD for an upload. Derived from the extension so a hostile declared
    type is never persisted; falls back to octet-stream. The serve path re-derives regardless, so
    this is mainly for tidiness and for the S3 path where the object carries its own type."""
    ext = os.path.splitext(filename or "")[1].lower()
    return _INLINE_SAFE.get(ext, "application/octet-stream")
