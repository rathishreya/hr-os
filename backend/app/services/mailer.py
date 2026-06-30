"""Real outbound email engine.

- Sends via SMTP when SMTP_HOST is configured (works with Gmail app passwords,
  SendGrid, Resend, Mailgun, SES — anything SMTP).
- When SMTP is NOT configured, it *logs* the email (console + DB) instead of failing,
  so the workflow is fully functional in dev without sending to real inboxes.
- Every email is persisted to the EmailMessage table and the audit log.
"""
from __future__ import annotations

import smtplib
import ssl
import sys
from email.message import EmailMessage as MimeEmail
from typing import Any

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


def _smtp_send(identity: dict, to_email: str, to_name: str, subject: str, body: str, ics: str | None = None) -> None:
    msg = MimeEmail()
    msg["From"] = f"{identity['from_name']} <{identity['from_email']}>"
    msg["To"] = f"{to_name} <{to_email}>" if to_name else to_email
    if identity.get("reply_to") and identity["reply_to"].lower() != (identity.get("from_email") or "").lower():
        msg["Reply-To"] = identity["reply_to"]
    msg["Subject"] = subject
    msg.set_content(body)
    if ics:
        # Attach the calendar invite; clients show an "Add to calendar" affordance.
        msg.add_attachment(
            ics.encode("utf-8"), maintype="text", subtype="calendar",
            filename="invite.ics", params={"method": "REQUEST", "name": "invite.ics"},
        )

    with smtplib.SMTP(identity["host"], identity["port"], timeout=30) as server:
        if identity["starttls"]:
            server.starttls(context=ssl.create_default_context())
        if identity["smtp_user"]:
            server.login(identity["smtp_user"], identity["smtp_password"])
        server.send_message(msg)


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

    rec = models.EmailMessage(
        candidate_id=candidate_id,
        application_id=application_id,
        to_email=to_email,
        to_name=to_name,
        template=template,
        subject=subject,
        body=body,
        ai_generated=ai_generated,
    )

    if not to_email:
        rec.status = "failed"
        rec.error = "No recipient email address."
    elif identity["configured"]:
        try:
            _smtp_send(identity, to_email, to_name, subject, body, ics=ics)
            rec.status = "sent"
        except Exception as exc:  # don't crash the request on a send failure
            rec.status = "failed"
            rec.error = str(exc)
    else:
        rec.status = "logged"
        _safe_print(
            f"\n[EMAIL · logged — SMTP not configured]\nTo: {to_email}\nSubject: {subject}\n{body}\n"
            + ("[+ calendar invite (.ics) attached]\n" if ics else "")
        )

    db.add(rec)
    db.flush()
    log(db, "email.sent", "email", rec.id, {"to": to_email, "template": template, "status": rec.status})
    return rec
