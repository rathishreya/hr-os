"""Real outbound email engine.

- Sends via SMTP when SMTP_HOST is configured (works with Gmail app passwords,
  SendGrid, Resend, Mailgun, SES — anything SMTP).
- When SMTP is NOT configured, it *logs* the email (console + DB) instead of failing,
  so the workflow is fully functional in dev without sending to real inboxes.
- Every email is persisted to the EmailMessage table and the audit log.
"""
from __future__ import annotations

import base64
import re
import smtplib
import ssl
import sys
import time
from email.message import EmailMessage as MimeEmail
from typing import Any

import httpx
from sqlalchemy.orm import Session

from .. import models
from ..config import settings
from .ai import ai
from .recruitment import log

# --- deterministic templates (used when AI is off or as fallback) ---
TEMPLATES: dict[str, dict[str, str]] = {
    "acknowledgment": {
        "subject": "We received your application for {role}",
        "body": "Hi {name},\n\nThanks for applying for the {role} role at {company}. "
        "Our team is reviewing your profile and we'll be in touch with next steps shortly.\n\n"
        "Warm regards,\n{sender}",
    },
    "shortlisted": {
        "subject": "Good news — you've been shortlisted for {role}",
        "body": "Hi {name},\n\nWe were impressed by your background and have shortlisted you for "
        "the {role} role at {company}. We'll reach out shortly to schedule the next round.\n\n"
        "Best,\n{sender}",
    },
    "interview_invite": {
        "subject": "Interview invitation — {role} at {company}",
        "body": "Hi {name},\n\nWe'd like to invite you to interview for the {role} role. "
        "Please reply with your availability over the next few days and we'll confirm a slot.\n\n"
        "Looking forward to speaking,\n{sender}",
    },
    "rejection": {
        "subject": "Update on your application for {role}",
        "body": "Hi {name},\n\nThank you for taking the time to apply for the {role} role at "
        "{company}. After careful review, we won't be moving forward at this time. We genuinely "
        "appreciate your interest and wish you the very best.\n\nSincerely,\n{sender}",
    },
    "offer": {
        "subject": "We'd love to have you on board — {role}",
        "body": "Hi {name},\n\nWe're delighted to extend an offer for the {role} role at {company}! "
        "Our team will share the formal offer details shortly. Congratulations!\n\n"
        "Warm regards,\n{sender}",
    },
}

TEMPLATE_LABELS = {
    "acknowledgment": "Application acknowledgment",
    "shortlisted": "Shortlisted notification",
    "interview_invite": "Interview invitation",
    "rejection": "Respectful rejection",
    "offer": "Offer notification",
    "custom": "Custom message",
}


def _safe_print(text: str) -> None:
    """Print to the console without ever raising. Windows consoles default to
    cp1252, which can't encode characters like → or emoji that show up in email
    bodies — a raw print() would crash the request, so we replace those chars."""
    enc = sys.stdout.encoding or "utf-8"
    print(text.encode(enc, "replace").decode(enc))


def render_template(template: str, ctx: dict[str, Any]) -> tuple[str, str]:
    t = TEMPLATES.get(template, TEMPLATES["acknowledgment"])
    safe = {
        "name": ctx.get("name") or "there",
        "role": ctx.get("role") or "the role",
        "company": ctx.get("company") or settings.COMPANY_NAME,
        "sender": ctx.get("sender") or settings.EMAIL_FROM_NAME,
    }
    return t["subject"].format(**safe), t["body"].format(**safe)


def personalize(text: str, ctx: dict[str, Any]) -> str:
    """Substitute {name}/{role}/{company}/{sender} tokens in a (possibly user-edited)
    template string. Uses plain replace (not str.format) so stray braces never blow up."""
    safe = {
        "name": ctx.get("name") or "there",
        "role": ctx.get("role") or "the role",
        "company": ctx.get("company") or settings.COMPANY_NAME,
        "sender": ctx.get("sender") or settings.EMAIL_FROM_NAME,
    }
    for key, val in safe.items():
        text = text.replace("{" + key + "}", str(val))
    return text


def render_draft(
    template: str,
    ctx: dict[str, Any],
    *,
    use_ai: bool = False,
    subject: str | None = None,
    body: str | None = None,
) -> tuple[str, str, bool]:
    """Produce the (subject, body, ai_generated) draft WITHOUT sending. Shared by
    compose() and the /comms/preview endpoint so the preview is exactly what's sent."""
    if subject and body:
        return subject, body, False
    if use_ai and template != "custom":
        composed, _provider = ai.compose_email(template, ctx)
        s = composed.get("subject") or render_template(template, ctx)[0]
        b = composed.get("body") or render_template(template, ctx)[1]
        return s, b, True
    s, b = render_template(template, ctx)
    return s, b, False


def resolve_identity(user: "models.User | None" = None) -> dict:
    """Decide which mailbox sends an email.

    Per-user mailbox (chosen design): when the logged-in user has stored their own Gmail/
    Workspace App Password, authenticate as THEIR login email and send FROM it — a true
    send-from. Otherwise fall back to the shared workspace SMTP account, but still stamp the
    logged-in user as the From-name + Reply-To so replies reach the right person.
    """
    has_personal = bool(user and (user.smtp_password or "").strip() and (user.email or "").strip())
    if has_personal:
        host = settings.SMTP_HOST or "smtp.gmail.com"
        return {
            "host": host,
            "port": settings.SMTP_PORT or 587,
            "starttls": settings.SMTP_STARTTLS,
            "smtp_user": user.email,
            "smtp_password": user.smtp_password,
            "from_email": user.email,
            "from_name": user.name or settings.EMAIL_FROM_NAME,
            "reply_to": user.email,
            "configured": bool(host),
            "personal": True,
        }
    return {
        "host": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
        "starttls": settings.SMTP_STARTTLS,
        "smtp_user": settings.SMTP_USER,
        "smtp_password": settings.SMTP_PASSWORD,
        "from_email": settings.EMAIL_FROM,
        "from_name": (user.name if user else "") or settings.EMAIL_FROM_NAME,
        "reply_to": (user.email if user else ""),
        "configured": bool(settings.SMTP_HOST),
        "personal": False,
    }


def _build_mime(from_email: str, from_name: str, to_email: str, to_name: str,
                subject: str, body: str, reply_to: str = "", ics: str | None = None) -> MimeEmail:
    """Build the RFC-822 message (plain body + optional .ics calendar invite). Shared by the SMTP
    and SES send paths so both attach the invite identically."""
    msg = MimeEmail()
    msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    msg["To"] = f"{to_name} <{to_email}>" if to_name else to_email
    if reply_to and reply_to.lower() != (from_email or "").lower():
        msg["Reply-To"] = reply_to
    msg["Subject"] = subject
    msg.set_content(body)
    if ics:
        # Attach the calendar invite; clients show an "Add to calendar" affordance.
        msg.add_attachment(
            ics.encode("utf-8"), maintype="text", subtype="calendar",
            filename="invite.ics", params={"method": "REQUEST", "name": "invite.ics"},
        )
    return msg


def _smtp_send(identity: dict, to_email: str, to_name: str, subject: str, body: str, ics: str | None = None) -> None:
    msg = _build_mime(identity["from_email"], identity["from_name"], to_email, to_name, subject, body,
                      identity.get("reply_to", ""), ics)
    with smtplib.SMTP(identity["host"], identity["port"], timeout=30) as server:
        if identity["starttls"]:
            server.starttls(context=ssl.create_default_context())
        if identity["smtp_user"]:
            server.login(identity["smtp_user"], identity["smtp_password"])
        server.send_message(msg)


_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")

# SMTP errors that won't succeed on retry — bad credentials or an address the server rejected.
_PERMANENT_SMTP = (
    smtplib.SMTPAuthenticationError,
    smtplib.SMTPRecipientsRefused,
    smtplib.SMTPSenderRefused,
    smtplib.SMTPNotSupportedError,
)


def _clean_recipient(addr: str) -> str:
    """Extract the real address from a possibly-dirty value. Résumé-parsed emails often carry
    trailing junk ('name@x.com Behance LinkedIn') that SMTP rejects — pull out just the address."""
    m = _EMAIL_RE.search(addr or "")
    return m.group(0).rstrip(".") if m else ""


def _send_with_retry(identity: dict, to_email: str, to_name: str, subject: str, body: str,
                     ics: str | None, attempts: int = 3) -> tuple[str, str]:
    """Send, retrying only TRANSIENT failures (disconnects, timeouts, greylisting) with a short
    backoff, so a temporary Gmail/SMTP blip isn't recorded as a permanent 'failed'. Returns
    (status, error). Permanent errors (auth / rejected recipient) fail immediately."""
    last = ""
    for i in range(attempts):
        try:
            _smtp_send(identity, to_email, to_name, subject, body, ics=ics)
            return "sent", ""
        except _PERMANENT_SMTP as exc:
            return "failed", str(exc)
        except Exception as exc:  # transient — back off and retry
            last = str(exc)
            if i < attempts - 1:
                time.sleep(1.2 * (i + 1))
    return "failed", last


_ses_client_obj = None


def _ses_client():
    """Lazily build the boto3 SES client (import kept lazy so the dep stays optional). Reuses the
    shared AWS credentials (same IAM user as S3)."""
    global _ses_client_obj
    if _ses_client_obj is None:
        import boto3  # lazy — only needed when SES is the chosen provider
        kwargs = {"region_name": settings.SES_REGION}
        # Explicit keys if provided; otherwise boto3 uses the compute's IAM role / default chain.
        if settings.S3_ACCESS_KEY and settings.S3_SECRET_KEY:
            kwargs["aws_access_key_id"] = settings.S3_ACCESS_KEY
            kwargs["aws_secret_access_key"] = settings.S3_SECRET_KEY
        _ses_client_obj = boto3.client("ses", **kwargs)
    return _ses_client_obj


def _ses_send(from_email: str, from_name: str, to_email: str, to_name: str,
              subject: str, body: str, reply_to: str = "", ics: str | None = None) -> None:
    """Send one email via the Amazon SES API (HTTPS) — works on hosts that block SMTP (Render).
    `from_email` MUST be an SES-verified identity (verified domain or address)."""
    msg = _build_mime(from_email, from_name, to_email, to_name, subject, body, reply_to, ics)
    _ses_client().send_raw_email(
        Source=f"{from_name} <{from_email}>" if from_name else from_email,
        Destinations=[to_email],
        RawMessage={"Data": msg.as_bytes()},
    )


# SES errors a retry can't fix: unverified sender, sandbox recipient, paused account, rejected address.
_SES_PERMANENT = ("MessageRejected", "MailFromDomainNotVerified", "not verified", "is not verified",
                  "AccountSendingPaused", "Email address is not verified")


def _ses_with_retry(from_email: str, from_name: str, to_email: str, to_name: str, subject: str,
                    body: str, reply_to: str, ics: str | None, attempts: int = 3) -> tuple[str, str]:
    """Send via SES, retrying transient (throttling/network) errors; permanent ones fail fast."""
    last = ""
    for i in range(attempts):
        try:
            _ses_send(from_email, from_name, to_email, to_name, subject, body, reply_to, ics)
            return "sent", ""
        except Exception as exc:  # noqa: BLE001
            detail = str(exc)[:200]
            if any(k in detail for k in _SES_PERMANENT):
                return "failed", f"SES: {detail}"
            last = f"SES: {detail}"
        if i < attempts - 1:
            time.sleep(1.2 * (i + 1))
    return "failed", last


def _sendgrid_send(from_email: str, from_name: str, to_email: str, to_name: str,
                   subject: str, body: str, reply_to: str = "", ics: str | None = None) -> None:
    """Send one email via SendGrid's HTTPS API — works on hosts (Render) that block SMTP.
    `from_email` MUST be a SendGrid-verified sender (single-sender or verified domain)."""
    payload: dict[str, Any] = {
        "personalizations": [{"to": [{"email": to_email, **({"name": to_name} if to_name else {})}]}],
        "from": {"email": from_email, "name": from_name or from_email},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
        # Send the real link, not a ct.sendgrid.net click-tracking wrapper (cleaner + less spammy).
        "tracking_settings": {"click_tracking": {"enable": False, "enable_text": False},
                              "open_tracking": {"enable": False}},
    }
    if reply_to and reply_to.lower() != from_email.lower():
        payload["reply_to"] = {"email": reply_to}
    if ics:
        payload["attachments"] = [{
            "content": base64.b64encode(ics.encode("utf-8")).decode("ascii"),
            "type": "text/calendar; method=REQUEST",
            "filename": "invite.ics",
        }]
    resp = httpx.post(
        "https://api.sendgrid.com/v3/mail/send",
        headers={"Authorization": f"Bearer {settings.SENDGRID_API_KEY}", "Content-Type": "application/json"},
        json=payload, timeout=30,
    )
    resp.raise_for_status()


def _sendgrid_with_retry(from_email: str, from_name: str, to_email: str, to_name: str, subject: str,
                         body: str, reply_to: str, ics: str | None, attempts: int = 3) -> tuple[str, str]:
    """Send via SendGrid, retrying transient (5xx/network) errors; 4xx (bad key / unverified
    sender / bad request) fail fast since a retry can't help. Returns (status, error)."""
    last = ""
    for i in range(attempts):
        try:
            _sendgrid_send(from_email, from_name, to_email, to_name, subject, body, reply_to, ics)
            return "sent", ""
        except httpx.HTTPStatusError as exc:
            code = exc.response.status_code
            detail = (exc.response.text or "")[:200]
            if 400 <= code < 500:
                return "failed", f"SendGrid {code}: {detail}"
            last = f"SendGrid {code}: {detail}"
        except Exception as exc:
            last = str(exc)
        if i < attempts - 1:
            time.sleep(1.2 * (i + 1))
    return "failed", last


def compose(
    db: Session,
    *,
    to_email: str,
    to_name: str = "",
    template: str = "acknowledgment",
    role: str = "",
    subject: str | None = None,
    body: str | None = None,
    use_ai: bool = False,
    candidate_id: int | None = None,
    application_id: int | None = None,
    ics: str | None = None,
    sender_user: "models.User | None" = None,
) -> models.EmailMessage:
    """Build (optionally with AI), send-or-log, and persist an email. `ics`, if given, is
    attached as a calendar invite (.ics). `sender_user` is the logged-in user — when they've
    set up their own mailbox the email is sent FROM their address (see resolve_identity)."""
    identity = resolve_identity(sender_user)
    # Sign templated emails with the sending person's name (their own mailbox or, on the shared
    # account, still the logged-in user) rather than a generic workspace label.
    ctx = {"name": to_name, "role": role, "company": settings.COMPANY_NAME, "sender": identity["from_name"]}
    subject, body, ai_generated = render_draft(template, ctx, use_ai=use_ai, subject=subject, body=body)

    # Sanitise the recipient so a mis-parsed address ("x@y.com Behance LinkedIn") doesn't get
    # handed to SMTP and rejected — a common cause of silent "failed" sends.
    clean_to = _clean_recipient(to_email)

    rec = models.EmailMessage(
        candidate_id=candidate_id,
        application_id=application_id,
        to_email=clean_to or to_email,
        to_name=to_name,
        template=template,
        subject=subject,
        body=body,
        ai_generated=ai_generated,
    )

    if not clean_to:
        rec.status = "failed"
        rec.error = f"No valid recipient email address (got {to_email!r})." if to_email else "No recipient email address."
    elif settings.ses_enabled:
        # Try Amazon SES first. SES can't deliver to everyone yet (sandbox → verified recipients
        # only; unverified sender domains rejected), so if SES fails AND SendGrid is configured,
        # fall back to SendGrid so no email is ever lost. As SES production access + domain
        # verification complete, more mail simply succeeds on the SES attempt — no code change.
        frm = settings.EMAIL_FROM or identity["from_email"]
        frm_name = settings.EMAIL_FROM_NAME or identity["from_name"]
        reply_to = identity.get("reply_to") or identity.get("from_email") or ""
        rec.status, rec.error = _ses_with_retry(frm, frm_name, clean_to, to_name, subject, body, reply_to, ics)
        if rec.status != "sent" and settings.SENDGRID_API_KEY:
            sg_status, sg_error = _sendgrid_with_retry(frm, frm_name, clean_to, to_name, subject, body, reply_to, ics)
            if sg_status == "sent":
                rec.status, rec.error = "sent", f"[SES failed → sent via SendGrid] {rec.error}"[:480]
            else:
                rec.status, rec.error = sg_status, f"SES: {rec.error} | SendGrid: {sg_error}"[:480]
    elif settings.SENDGRID_API_KEY:
        # HTTP API — the reliable path on Render (SMTP is blocked). Send FROM the verified sender
        # (EMAIL_FROM), stamped with the acting user's name, and reply-to the actual person.
        rec.status, rec.error = _sendgrid_with_retry(
            settings.EMAIL_FROM or identity["from_email"],
            settings.EMAIL_FROM_NAME or identity["from_name"],  # brand display name (e.g. "EZ People")
            clean_to, to_name, subject, body,
            identity.get("reply_to") or identity.get("from_email") or "", ics)
    elif identity["configured"]:
        rec.status, rec.error = _send_with_retry(identity, clean_to, to_name, subject, body, ics)
    else:
        rec.status = "logged"
        _safe_print(
            f"\n[EMAIL · logged — SMTP not configured]\nTo: {clean_to}\nSubject: {subject}\n{body}\n"
            + ("[+ calendar invite (.ics) attached]\n" if ics else "")
        )

    db.add(rec)
    db.flush()
    log(db, "email.sent", "email", rec.id, {"to": to_email, "template": template, "status": rec.status})
    return rec
