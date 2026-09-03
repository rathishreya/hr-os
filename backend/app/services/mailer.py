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
from . import gcal
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
    # Shared provider (SES/SendGrid). Send FROM the logged-in user's OWN address when their email
    # is on a domain we're authorised to send from (SES-verified / SendGrid-authenticated); else
    # fall back to EMAIL_FROM. Either way, stamp the user's name + reply-to so replies reach them.
    from_email = settings.EMAIL_FROM
    if user and (user.email or "").strip():
        dom = user.email.rsplit("@", 1)[-1].lower()
        if dom in settings.email_sender_domains:
            from_email = user.email
    return {
        "host": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
        "starttls": settings.SMTP_STARTTLS,
        "smtp_user": settings.SMTP_USER,
        "smtp_password": settings.SMTP_PASSWORD,
        "from_email": from_email,
        "from_name": (user.name if user else "") or settings.EMAIL_FROM_NAME,
        "reply_to": (user.email if user else ""),
        "configured": bool(settings.SMTP_HOST),
        "personal": False,
    }


def _build_mime(from_email: str, from_name: str, to_email: str, to_name: str,
                subject: str, body: str, reply_to: str = "", ics: str | None = None,
                cc: list[str] | None = None, attachments: list[dict] | None = None,
                html_body: str | None = None) -> MimeEmail:
    """Build the RFC-822 message (plain body + optional .ics calendar invite + optional file
    attachments). Shared by the SMTP, SES and Gmail-API send paths so all attach identically.
    Each attachment is {'filename': str, 'content': bytes, 'mimetype': str}.

    `html_body`, when given, is added as an ALTERNATIVE to the plain text rather than replacing it.
    The onboarding letters carry bold, italics and hyperlinks that the People team wrote into their
    templates, and a link nobody can click is a form nobody fills in. Every client that cannot show
    the HTML still gets the plain part, which spells each address out after the words that carried
    it."""
    msg = MimeEmail()
    msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    msg["To"] = f"{to_name} <{to_email}>" if to_name else to_email
    if cc:
        msg["Cc"] = ", ".join(cc)
    if reply_to and reply_to.lower() != (from_email or "").lower():
        msg["Reply-To"] = reply_to
    msg["Subject"] = subject
    msg.set_content(body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")
    if ics:
        # Attach the calendar invite; clients show an "Add to calendar" affordance.
        msg.add_attachment(
            ics.encode("utf-8"), maintype="text", subtype="calendar",
            filename="invite.ics", params={"method": "REQUEST", "name": "invite.ics"},
        )
    for att in (attachments or []):
        content = att.get("content")
        if not content:
            continue
        ctype = att.get("mimetype") or "application/octet-stream"
        maintype, _, subtype = ctype.partition("/")
        msg.add_attachment(content, maintype=maintype or "application", subtype=subtype or "octet-stream",
                           filename=att.get("filename") or "attachment")
    return msg


def _smtp_send(identity: dict, to_email: str, to_name: str, subject: str, body: str,
               ics: str | None = None, cc: list[str] | None = None, attachments: list[dict] | None = None,
               html_body: str | None = None) -> None:
    msg = _build_mime(identity["from_email"], identity["from_name"], to_email, to_name, subject, body,
                      identity.get("reply_to", ""), ics, cc, attachments, html_body)
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


def emails_only(values: "list[str] | None") -> list[str]:
    """From a list of free-text values (a panelist is stored as either a bare name or an email),
    return just the valid email addresses — used to CC panelists on the candidate's invite."""
    out: list[str] = []
    for v in values or []:
        e = _clean_recipient(str(v))
        if e and e not in out:
            out.append(e)
    return out


def _send_with_retry(identity: dict, to_email: str, to_name: str, subject: str, body: str,
                     ics: str | None, cc: list[str] | None = None, attachments: list[dict] | None = None,
                     attempts: int = 3, html_body: str | None = None) -> tuple[str, str]:
    """Send, retrying only TRANSIENT failures (disconnects, timeouts, greylisting) with a short
    backoff, so a temporary Gmail/SMTP blip isn't recorded as a permanent 'failed'. Returns
    (status, error). Permanent errors (auth / rejected recipient) fail immediately."""
    last = ""
    for i in range(attempts):
        try:
            _smtp_send(identity, to_email, to_name, subject, body, ics=ics, cc=cc,
                       attachments=attachments, html_body=html_body)
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
              subject: str, body: str, reply_to: str = "", ics: str | None = None,
              cc: list[str] | None = None, attachments: list[dict] | None = None,
              html_body: str | None = None) -> None:
    """Send one email via the Amazon SES API (HTTPS) — works on hosts that block SMTP (Render).
    `from_email` MUST be an SES-verified identity (verified domain or address)."""
    msg = _build_mime(from_email, from_name, to_email, to_name, subject, body, reply_to, ics, cc,
                      attachments, html_body)
    _ses_client().send_raw_email(
        Source=f"{from_name} <{from_email}>" if from_name else from_email,
        # SES delivers to every address in Destinations; the Cc header (set in _build_mime) makes
        # the panelists show as CC while they still actually receive the message.
        Destinations=[to_email] + list(cc or []),
        RawMessage={"Data": msg.as_bytes()},
    )


# SES errors a retry can't fix: unverified sender, sandbox recipient, paused account, rejected address.
_SES_PERMANENT = ("MessageRejected", "MailFromDomainNotVerified", "not verified", "is not verified",
                  "AccountSendingPaused", "Email address is not verified")


def _ses_with_retry(from_email: str, from_name: str, to_email: str, to_name: str, subject: str,
                    body: str, reply_to: str, ics: str | None, cc: list[str] | None = None,
                    attachments: list[dict] | None = None, attempts: int = 3,
                    html_body: str | None = None) -> tuple[str, str]:
    """Send via SES, retrying transient (throttling/network) errors; permanent ones fail fast."""
    last = ""
    for i in range(attempts):
        try:
            _ses_send(from_email, from_name, to_email, to_name, subject, body, reply_to, ics, cc,
                      attachments, html_body=html_body)
            return "sent", ""
        except Exception as exc:  # noqa: BLE001
            detail = str(exc)[:200]
            if any(k in detail for k in _SES_PERMANENT):
                return "failed", f"SES: {detail}"
            last = f"SES: {detail}"
        if i < attempts - 1:
            time.sleep(1.2 * (i + 1))
    return "failed", last


def _sendgrid_from(from_email: str, from_name: str, reply_to: str) -> tuple[str, str, str]:
    """Make a From safe for SendGrid. SendGrid can only send from domains it's authenticated for
    (SENDGRID_SENDER_DOMAINS, e.g. ezworks.io) and 403s on anything else — so if the desired From
    is on another domain (e.g. an SES-verified @ez.works address), send from the shared EMAIL_FROM
    instead, but KEEP the person's name and route replies back to them. Mail always goes out."""
    dom = (from_email or "").rsplit("@", 1)[-1].lower()
    if dom and dom in settings.sendgrid_sender_domains:
        return from_email, from_name, reply_to
    return settings.EMAIL_FROM, from_name or settings.EMAIL_FROM_NAME, (reply_to or from_email or "")


def _sendgrid_send(from_email: str, from_name: str, to_email: str, to_name: str,
                   subject: str, body: str, reply_to: str = "", ics: str | None = None,
                   cc: list[str] | None = None, attachments: list[dict] | None = None,
                   html_body: str | None = None) -> None:
    """Send one email via SendGrid's HTTPS API — works on hosts (Render) that block SMTP.
    `from_email` MUST be a SendGrid-verified sender (single-sender or verified domain)."""
    personalization: dict[str, Any] = {"to": [{"email": to_email, **({"name": to_name} if to_name else {})}]}
    if cc:
        personalization["cc"] = [{"email": e} for e in cc]
    payload: dict[str, Any] = {
        "personalizations": [personalization],
        "from": {"email": from_email, "name": from_name or from_email},
        "subject": subject,
        "content": ([{"type": "text/plain", "value": body}]
                    + ([{"type": "text/html", "value": html_body}] if html_body else [])),
        # Send the real link, not a ct.sendgrid.net click-tracking wrapper (cleaner + less spammy).
        "tracking_settings": {"click_tracking": {"enable": False, "enable_text": False},
                              "open_tracking": {"enable": False}},
    }
    if reply_to and reply_to.lower() != from_email.lower():
        payload["reply_to"] = {"email": reply_to}
    atts = []
    if ics:
        atts.append({
            "content": base64.b64encode(ics.encode("utf-8")).decode("ascii"),
            "type": "text/calendar; method=REQUEST",
            "filename": "invite.ics",
        })
    for att in (attachments or []):
        if att.get("content"):
            atts.append({
                "content": base64.b64encode(att["content"]).decode("ascii"),
                "type": att.get("mimetype") or "application/octet-stream",
                "filename": att.get("filename") or "attachment",
            })
    if atts:
        payload["attachments"] = atts
    resp = httpx.post(
        "https://api.sendgrid.com/v3/mail/send",
        headers={"Authorization": f"Bearer {settings.SENDGRID_API_KEY}", "Content-Type": "application/json"},
        json=payload, timeout=30,
    )
    resp.raise_for_status()


def _sendgrid_with_retry(from_email: str, from_name: str, to_email: str, to_name: str, subject: str,
                         body: str, reply_to: str, ics: str | None, cc: list[str] | None = None,
                         attachments: list[dict] | None = None, attempts: int = 3,
                         html_body: str | None = None) -> tuple[str, str]:
    """Send via SendGrid, retrying transient (5xx/network) errors; 4xx (bad key / unverified
    sender / bad request) fail fast since a retry can't help. Returns (status, error)."""
    last = ""
    for i in range(attempts):
        try:
            _sendgrid_send(from_email, from_name, to_email, to_name, subject, body, reply_to, ics,
                           cc, attachments, html_body=html_body)
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


def _shared_send(identity: dict, to_email: str, to_name: str, subject: str, body: str,
                 ics: str | None, cc: list[str] | None = None, attachments: list[dict] | None = None,
                 html_body: str | None = None) -> tuple[str, str]:
    """Send via the shared workspace provider (NOT the user's personal mailbox): SES-first with a
    SendGrid fallback, else SendGrid, else shared SMTP, else log. Returns (status, error)."""
    if settings.EMAIL_DRY_RUN:
        return "logged", "EMAIL_DRY_RUN is on — nothing was sent"
    if settings.ses_enabled:
        # SES can't deliver to everyone yet (sandbox → verified recipients only), so fall back to
        # SendGrid on failure — no email is ever lost. As SES production access completes, more mail
        # simply succeeds on the SES attempt with no code change.
        frm = identity["from_email"] or settings.EMAIL_FROM          # the logged-in user's address when sendable
        frm_name = identity["from_name"] or settings.EMAIL_FROM_NAME
        reply_to = identity.get("reply_to") or identity.get("from_email") or ""
        status, error = _ses_with_retry(frm, frm_name, to_email, to_name, subject, body, reply_to,
                                        ics, cc, attachments, html_body=html_body)
        if status != "sent" and settings.SENDGRID_API_KEY:
            # SendGrid can't send from every domain SES can (e.g. @ez.works individual identities),
            # so rewrite the From to an authenticated one when needed (name + reply-to preserved).
            sg_frm, sg_name, sg_reply = _sendgrid_from(frm, frm_name, reply_to)
            sg_status, sg_error = _sendgrid_with_retry(sg_frm, sg_name, to_email, to_name, subject,
                                                       body, sg_reply, ics, cc, attachments,
                                                       html_body=html_body)
            if sg_status == "sent":
                return "sent", f"[SES failed → sent via SendGrid] {error}"[:480]
            return sg_status, f"SES: {error} | SendGrid: {sg_error}"[:480]
        return status, error
    if settings.SENDGRID_API_KEY:
        # HTTP API — the reliable path on Render (SMTP is blocked). Send FROM the user's address when
        # SendGrid can (else EMAIL_FROM), stamped with their name, reply-to the person.
        sg_frm, sg_name, sg_reply = _sendgrid_from(
            identity["from_email"] or settings.EMAIL_FROM,
            identity["from_name"] or settings.EMAIL_FROM_NAME,
            identity.get("reply_to") or identity.get("from_email") or "")
        return _sendgrid_with_retry(sg_frm, sg_name, to_email, to_name, subject, body, sg_reply,
                                    ics, cc, attachments, html_body=html_body)
    if settings.SMTP_HOST:
        # Shared workspace SMTP account (not a personal mailbox).
        shared = {**identity, "smtp_user": settings.SMTP_USER, "smtp_password": settings.SMTP_PASSWORD,
                  "host": settings.SMTP_HOST, "port": settings.SMTP_PORT, "starttls": settings.SMTP_STARTTLS}
        return _send_with_retry(shared, to_email, to_name, subject, body, ics, cc, attachments,
                                html_body=html_body)
    _safe_print(
        f"\n[EMAIL · logged — no provider configured]\nTo: {to_email}\nSubject: {subject}\n{body}\n"
        + ("[+ calendar invite (.ics) attached]\n" if ics else "")
    )
    return "logged", ""


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
    cc: list[str] | None = None,
    attachments: list[dict] | None = None,
    html_body: str | None = None,
) -> models.EmailMessage:
    """Build (optionally with AI), send-or-log, and persist an email. `ics`, if given, is
    attached as a calendar invite (.ics). `sender_user` is the logged-in user — when they've
    set up their own mailbox the email is sent FROM their address (see resolve_identity).
    `cc`, if given, is a list of addresses copied on the message (e.g. interview panelists).
    `attachments`, if given, are files to attach — each {'filename', 'content': bytes, 'mimetype'}."""
    identity = resolve_identity(sender_user)
    # Sign templated emails with the sending person's name (their own mailbox or, on the shared
    # account, still the logged-in user) rather than a generic workspace label.
    ctx = {"name": to_name, "role": role, "company": settings.COMPANY_NAME, "sender": identity["from_name"]}
    subject, body, ai_generated = render_draft(template, ctx, use_ai=use_ai, subject=subject, body=body)

    # Sanitise the recipient so a mis-parsed address ("x@y.com Behance LinkedIn") doesn't get
    # handed to SMTP and rejected — a common cause of silent "failed" sends.
    clean_to = _clean_recipient(to_email)

    # Clean the Cc list the same way: keep only valid addresses, drop the primary recipient and any
    # duplicates (case-insensitive), so a panelist is never double-sent or listed as both To and Cc.
    clean_cc: list[str] = []
    seen = {clean_to.lower()} if clean_to else set()
    for addr in (cc or []):
        e = _clean_recipient(addr)
        if e and e.lower() not in seen:
            seen.add(e.lower())
            clean_cc.append(e)

    # ── Recipient guards, applied before any channel picks the message up ────────────────────
    # 1) Blocklist: addresses that must never be written to, whatever the template says.
    blocked = settings.email_blocklist
    if blocked:
        if clean_to and clean_to.lower() in blocked:
            clean_to = ""
        clean_cc = [a for a in clean_cc if a.lower() not in blocked]

    # 2) Mail trap: reroute everything to one inbox, keeping the real recipients visible in the
    #    body so the redirected copy is still reviewable.
    if settings.EMAIL_REDIRECT_TO and (clean_to or clean_cc):
        intended_to, intended_cc = clean_to, list(clean_cc)
        clean_to, clean_cc = settings.EMAIL_REDIRECT_TO, []
        subject = f"[REDIRECTED] {subject}"
        body = (
            "--- This email was redirected and did NOT reach its recipients. ---\n"
            f"Intended To: {intended_to or '(none)'}\n"
            f"Intended Cc: {', '.join(intended_cc) or '(none)'}\n"
            "-------------------------------------------------------------------\n\n"
        ) + body

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

    sender_email = (sender_user.email if sender_user else "") or ""
    sender_domain = sender_email.rsplit("@", 1)[-1].lower() if "@" in sender_email else ""
    # Workspace domain-wide delegation: send AS the user with zero per-user setup.
    delegate = bool(sender_user and gcal.delegation_available() and sender_domain in settings.google_workspace_domains)
    # The user's OWN Google connection (per-user OAuth) with the gmail.send scope granted.
    google_send = bool(
        sender_user and (sender_user.google_refresh_token or "").strip()
        and "gmail.send" in (sender_user.google_scope or "")
    )

    # Ordered "send AS the user" channels (each lands the message in the user's own Sent folder,
    # from their real address). We try them in order and only fall back to the shared SES/SendGrid
    # provider if EVERY user-owned channel is unavailable/failing — so e.g. a not-yet-authorized
    # delegation never hijacks a user who has their own Gmail/App-Password connected.
    gmail_attempts: list = []
    if delegate:
        gmail_attempts.append(("delegation", lambda raw: gcal.gmail_send_as(sender_email, raw)))
    if google_send:
        gmail_attempts.append(("your Google", lambda raw: gcal.gmail_send(sender_user.google_refresh_token, raw)))

    if settings.EMAIL_DRY_RUN:
        # Kill-switch checked BEFORE every channel — Gmail delegation, the user's own mailbox and
        # the shared provider alike. A blank EMAIL_PROVIDER only means "auto-detect", so this is
        # the one setting that actually guarantees no mail leaves the process.
        rec.status = "logged"
        rec.error = "EMAIL_DRY_RUN is on — nothing was sent"
    elif not clean_to:
        rec.status = "failed"
        rec.error = f"No valid recipient email address (got {to_email!r})." if to_email else "No recipient email address."
    elif gmail_attempts or identity["personal"]:
        errs: list[str] = []
        # 1) Gmail API channels (delegation, then the user's own OAuth) — build the message once.
        if gmail_attempts:
            raw = _build_mime(sender_email or settings.EMAIL_FROM,
                              (sender_user.name if sender_user else "") or settings.EMAIL_FROM_NAME,
                              clean_to, to_name, subject, body, sender_email, ics, clean_cc,
                              attachments, html_body).as_bytes()
            for label, fn in gmail_attempts:
                try:
                    fn(raw)
                    rec.status, rec.error = "sent", ""
                    break
                except Exception as exc:  # noqa: BLE001
                    errs.append(f"{label}: {str(exc)[:90]}")
        # 2) The user's own mailbox (App Password → Gmail SMTP), also lands in their Sent.
        if rec.status != "sent" and identity["personal"]:
            st, er = _send_with_retry(identity, clean_to, to_name, subject, body, ics, clean_cc,
                                      attachments, html_body=html_body)
            if st == "sent":
                rec.status, rec.error = "sent", ""
            else:
                errs.append(f"mailbox: {er}")
        # 3) Shared provider (SES/SendGrid) — only if none of the user's own channels worked.
        if rec.status != "sent":
            st, er = _shared_send(identity, clean_to, to_name, subject, body, ics, clean_cc,
                                  attachments, html_body=html_body)
            if st == "sent":
                rec.status, rec.error = "sent", f"[your Gmail unavailable → shared provider] {' | '.join(errs)}"[:480]
            else:
                rec.status, rec.error = st, f"{' | '.join(errs)} | shared: {er}"[:480]
    else:
        rec.status, rec.error = _shared_send(identity, clean_to, to_name, subject, body, ics,
                                             clean_cc, attachments, html_body=html_body)

    db.add(rec)
    db.flush()
    log(db, "email.sent", "email", rec.id, {"to": to_email, "template": template, "status": rec.status})
    return rec
