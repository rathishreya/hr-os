"""Per-document email drafts — the covering mail that carries each template to the candidate.

One spec per registered document template: the subject line, the body, who is copied and which
mailbox it goes out from. The draft is always rendered and shown to the recruiter for review (and
editing) before anything is sent; nothing here sends on its own.

Tokens available in a subject or body:
    {{Name}}            the candidate's first name, or their full name if there is only one
    {{Full Name}}       the candidate's full name
    {{Role}}            the role / designation on the document
    {{Next day's Date}} tomorrow, as "05 September 2026" — the "by tomorrow EOD" deadline

Unknown tokens are left untouched rather than blanked, so a typo shows up in the review step
instead of silently mailing an empty gap to a candidate.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta

# Everyone on the People team is copied; the offer letter also copies the founder.
_CC_PEOPLE = ["divya.anand@ezworks.io"]
_CC_OFFER = ["divya.anand@ezworks.io", "joy.sharma@ez.works"]
_FROM = "ritiksha.barolia@ezworks.io"

# ── Shared body fragments ───────────────────────────────────────────────────────────────────
_GREETING = "Hi {{Name}},\n\nHope you are doing well."

_ONBOARDING_INTRO = (
    "This is Ritiksha from the People team at EZ. As per the discussion, I am contacting you in "
    "regards to completing the onboarding process. Please fill out the application form at the "
    "earliest."
)

_SIGN_OFF = "Feel free to reach out if you have any questions."


def _body(*paras: str) -> str:
    return "\n\n".join(paras)


_ATTACHED_CONTRACT = "Please find the contract attached and kindly share the signed copy by tomorrow EOD."
_ATTACHED_NDA = "Please find the NDA attached and kindly share the signed copy by tomorrow EOD."

# The onboarding-form link, worded exactly as the offer letter carries it. It goes into every
# contract's covering mail (offer letters and all contracts) so the candidate gets their form
# alongside the paper — but NOT into the NDAs, which are a signature-only exchange with no form.
# {{Onboarding Link}} is filled by render() from the candidate's own signed link.
_ONBOARDING_LINK = _body(
    "The link for the onboarding form is mentioned below; kindly fill out this form by "
    "{{Next day's Date}}.",
    "Fill it out here: {{Onboarding Link}}",
)

# The plain covering note: greeting, "here's the paper", the onboarding-form link, sign-off.
_PLAIN_CONTRACT = _body(_GREETING, _ATTACHED_CONTRACT, _ONBOARDING_LINK, _SIGN_OFF)
# The same, prefaced by the onboarding-process introduction.
_ONBOARDING_CONTRACT = _body(_GREETING, _ONBOARDING_INTRO, _ATTACHED_CONTRACT, _ONBOARDING_LINK, _SIGN_OFF)
# NDAs are a signature-only exchange: no onboarding form, so no link.
_ONBOARDING_NDA = _body(_GREETING, _ONBOARDING_INTRO, _ATTACHED_NDA, _SIGN_OFF)

_OFFER_BODY = _body(
    "Dear {{Name}},",
    "We have evaluated your interview and liked your candidacy. As discussed, we would like to "
    "bring you on as a full-time {{Role}}.",
    "Please find the offer letter attached below. Kindly share the signed copy with us by "
    "{{Next day's Date}}.",
    _ONBOARDING_LINK,
    "Feel free to let us know if you have any questions.",
)


@dataclass(frozen=True)
class MailSpec:
    """The covering email for one document template."""

    subject: str
    body: str
    cc: list[str] = field(default_factory=lambda: list(_CC_PEOPLE))
    from_email: str = _FROM


# template_key -> MailSpec. Transcribed from the People team's mail-draft matrix; the differences
# between rows (which subject prefix, whether the onboarding paragraph appears) are deliberate.
MAIL_TEMPLATES: dict[str, MailSpec] = {
    # ── Contracts ──
    "ez_full_contract": MailSpec(
        subject="FT Contract_{{Full Name}}",
        body=_PLAIN_CONTRACT,
    ),
    "aez_professional_service_contract": MailSpec(
        subject="Onboarding formalities_Professional Service Contract_EZ_{{Full Name}}",
        body=_ONBOARDING_CONTRACT,
    ),
    "aez_freelance_contract": MailSpec(
        subject="Onboarding formalities_EZ_{{Full Name}}",
        body=_ONBOARDING_CONTRACT,
    ),
    "ez_agency_contract": MailSpec(
        subject="Onboarding formalities_Agency Contract_EZ_{{Full Name}}",
        body=_PLAIN_CONTRACT,  # the EZ agency row omits the onboarding paragraph
    ),
    "aez_agency_contract": MailSpec(
        subject="Onboarding formalities_Agency Contract_EZ_{{Full Name}}",
        body=_ONBOARDING_CONTRACT,
    ),
    # ── NDAs ──
    "ez_nda": MailSpec(
        subject="Onboarding formalities_EZ_{{Full Name}}",
        body=_ONBOARDING_NDA,
    ),
    "ez_nda_tech": MailSpec(
        subject="Onboarding formalities_EZ_{{Full Name}}",
        body=_ONBOARDING_NDA,
    ),
    "ez_agency_nda": MailSpec(
        subject="Onboarding formalities_EZ_{{Full Name}}",
        body=_ONBOARDING_NDA,
    ),
    "aez_professional_service_nda": MailSpec(
        subject="Onboarding formalities_EZ_{{Full Name}}",
        body=_ONBOARDING_NDA,
    ),
    "aez_freelance_nda": MailSpec(
        subject="Onboarding formalities_EZ_{{Full Name}}",
        body=_ONBOARDING_NDA,
    ),
    "aez_agency_nda": MailSpec(
        subject="Onboarding formalities_EZ_{{Full Name}}",
        body=_ONBOARDING_NDA,
    ),
    # ── Offer ──
    "ez_offer_letter": MailSpec(
        subject="{{Role}} role at EZ",
        body=_OFFER_BODY,
        cc=list(_CC_OFFER),
    ),
    # The traineeship offer had no row in the matrix; it borrows the offer-letter draft so the
    # action is never dead, and the UI flags it as not-yet-approved wording.
    "ez_traineeship_offer": MailSpec(
        subject="{{Role}} Trainee role at EZ",
        body=_OFFER_BODY,
        cc=list(_CC_OFFER),
    ),
}

# Templates whose draft is inherited rather than supplied by the People team.
UNSPECIFIED = {"ez_traineeship_offer"}


def _first_name(full: str) -> str:
    parts = [p for p in re.split(r"\s+", (full or "").strip()) if p]
    return parts[0] if parts else ""


_URL = re.compile(r"(https?://[^\s<>\"]+)")


def _esc(text: str) -> str:
    return (text.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace('"', "&quot;"))


def to_html(body: str) -> str:
    """The covering mail as HTML.

    These went out as bare plain text: a naked tracking URL on its own line and no styling at all,
    which is not what a candidate should receive alongside their offer letter. Blank-line-separated
    paragraphs become <p>, single newlines become <br>, and any URL becomes a real link so the
    reader gets something to click rather than a wall of query string.
    """
    paras = [b.strip() for b in re.split(r"\n\s*\n", body or "") if b.strip()]
    out = []
    for para in paras:
        html = "<br>".join(_esc(line) for line in para.splitlines())
        html = _URL.sub(r'<a href="\1" style="color:#6d28d9">\1</a>', html)
        out.append(f'<p style="margin:0 0 14px">{html}</p>')
    return (
        '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;'
        'font-size:14px;line-height:1.6;color:#1f2937">' + "".join(out) + "</div>"
    )


def sign_off(name: str, title: str = "") -> str:
    """The closing block. A letter of this kind arriving with no name on it reads as machine spam;
    the sender is whoever pressed send, so it is their name that belongs here."""
    if not (name or "").strip():
        return ""
    lines = ["Best regards,", name.strip()]
    if (title or "").strip():
        lines.append(title.strip())
    return "\n".join(lines)


def render(template_key: str, *, full_name: str, role: str, today: date | None = None,
           onboarding_link: str = "", sender_name: str = "", sender_title: str = "") -> dict:
    """Render the covering mail for a document. Returns {subject, body, html, cc, from_email, known}.

    `known` is False when the template has no People-team-approved draft, so the review step can
    say so rather than presenting inherited wording as if it were signed off.
    """
    spec = MAIL_TEMPLATES.get(template_key)
    borrowed = spec is None
    if spec is None:
        # No approved wording under this key. Borrow the offer letter's, which is exactly what the
        # review step already tells the recruiter is happening — it promised a borrowed draft and
        # handed over an empty one, so the mail simply could not be sent. Documents drafted before
        # the templates were re-keyed ("offer_letter", "nda", "traineeship_offer") all land here.
        spec = MAIL_TEMPLATES.get("ez_offer_letter")
    if spec is None:  # no offer letter either: nothing honest to show
        return {
            "subject": "",
            "body": "",
            "cc": list(_CC_PEOPLE),
            "from_email": _FROM,
            "known": False,
        }
    tomorrow = (today or date.today()) + timedelta(days=1)
    tokens = {
        "{{Name}}": _first_name(full_name) or full_name or "",
        "{{Full Name}}": full_name or "",
        "{{Role}}": role or "",
        "{{Next day's Date}}": tomorrow.strftime("%d %B %Y"),
        # The caller supplies this: render() has no candidate and no settings, so it cannot build
        # a URL. Left empty the sentence still reads, it just has nothing to click.
        "{{Onboarding Link}}": onboarding_link or "",
    }

    def fill(text: str) -> str:
        for token, value in tokens.items():
            text = text.replace(token, value)
        return text

    body = fill(spec.body)
    # Signed by whoever is sending it. Part of the DRAFT rather than bolted on at send time, so the
    # recruiter sees the name that will go out and can change it before anything leaves.
    closing = sign_off(sender_name, sender_title)
    if closing:
        body = body + "\n\n" + closing
    return {
        "subject": fill(spec.subject),
        "body": body,
        "html": to_html(body),
        "cc": list(spec.cc),
        "from_email": spec.from_email,
        "known": not borrowed and template_key not in UNSPECIFIED,
    }
