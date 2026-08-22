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

# The plain covering note: greeting, "here's the paper", sign-off.
_PLAIN_CONTRACT = _body(_GREETING, _ATTACHED_CONTRACT, _SIGN_OFF)
# The same, prefaced by the onboarding-process introduction.
_ONBOARDING_CONTRACT = _body(_GREETING, _ONBOARDING_INTRO, _ATTACHED_CONTRACT, _SIGN_OFF)
_ONBOARDING_NDA = _body(_GREETING, _ONBOARDING_INTRO, _ATTACHED_NDA, _SIGN_OFF)

_OFFER_BODY = _body(
    "Dear {{Name}},",
    "We have evaluated your interview and liked your candidacy. As discussed, we would like to "
    "bring you on as a full-time {{Role}}.",
    "Please find the offer letter attached below. Kindly share the signed copy with us by "
    "{{Next day's Date}}.",
    "The link for the onboarding form is mentioned below; kindly fill out this form by "
    "{{Next day's Date}}.",
    "Click here to fill out the onboarding form.",
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


def render(template_key: str, *, full_name: str, role: str, today: date | None = None) -> dict:
    """Render the covering mail for a document. Returns {subject, body, cc, from_email, known}.

    `known` is False when the template has no People-team-approved draft, so the review step can
    say so rather than presenting inherited wording as if it were signed off.
    """
    spec = MAIL_TEMPLATES.get(template_key)
    if spec is None:
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
    }

    def fill(text: str) -> str:
        for token, value in tokens.items():
            text = text.replace(token, value)
        return text

    return {
        "subject": fill(spec.subject),
        "body": fill(spec.body),
        "cc": list(spec.cc),
        "from_email": spec.from_email,
        "known": template_key not in UNSPECIFIED,
    }
