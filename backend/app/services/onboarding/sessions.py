"""The session catalogue: what EZ runs, how often, and which mails go with each.

The per-candidate checklist and this catalogue describe the same sessions from two directions. A
session here is the DEFINITION — Brand EZ runs quarterly, in campus or remote, with an invite mail
and a feedback mail. An OCCURRENCE is one sitting of it on a date, and an attendance row is one
person having been at that sitting. The checklist step `session_brand_ez` is a candidate's own
view of the occurrence they were invited to.

Timing: every session in the spec is invited the same way — 10:00 on the Friday a week before it
runs. That is stored rather than hardcoded so the People team can move one without a deploy.
"""
from __future__ import annotations

from dataclasses import dataclass

QUARTERLY = "quarterly"
ANNUAL = "annual"
BIANNUAL = "biannual"

FREQUENCIES = [
    (QUARTERLY, "Quarterly"),
    (ANNUAL, "Annually"),
    (BIANNUAL, "Twice a year"),
]

CAMPUS = "campus"
REMOTE = "remote"
BOTH = "both"

MODES = [(CAMPUS, "In campus"), (REMOTE, "Remote"), (BOTH, "Either")]

EZ = "EZ"
AEZ = "AEZ"
ALL = (EZ, AEZ)


@dataclass(frozen=True)
class SessionDef:
    key: str
    name: str
    frequency: str
    mode: str
    #: The mails this session sends, in order. Each is a template key the People team can edit.
    mails: tuple[str, ...]
    entities: tuple[str, ...] = ALL
    audience: str = "Employees"
    cc: tuple[str, ...] = ()
    #: When the invite goes out, relative to the sitting. The spec says the same for all of them:
    #: 10:00 on the Friday of the week before.
    invite_weekday: int = 4        # Monday is 0; 4 is Friday
    invite_time: str = "10:00"
    invite_weeks_before: int = 1
    #: The checklist step a new joiner sees for this session, when there is one.
    step_key: str | None = None
    note: str = ""


CATALOGUE: list[SessionDef] = [
    # ── Quarterly ───────────────────────────────────────────────────────────────────────────
    SessionDef("brand_ez", "Session on Brand EZ", QUARTERLY, BOTH,
               mails=("invite", "feedback_linkedin"), step_key="session_brand_ez",
               note="The feedback mail carries the LinkedIn profile link."),
    SessionDef("honor_code", "EZ Honor Code Session", QUARTERLY, BOTH,
               mails=("invite", "feedback_honor_code"), step_key="session_honor_code",
               note="The feedback mail carries a copy of the honor code."),
    SessionDef("sales_deck", "Sales Deck Session", QUARTERLY, BOTH,
               mails=("invite", "feedback"), step_key="session_sales_deck"),
    SessionDef("delivery_mindset", "Delivery Mindset Session", QUARTERLY, BOTH,
               mails=("invite", "feedback")),
    SessionDef("hundred_days", "100 Days Completion Session", QUARTERLY, BOTH,
               mails=("invite", "certificate_feedback"), step_key="hundred_days",
               note="The second mail carries the certificate."),
    # Session with Joy is in campus, and the checklist removes it for ArabEasy.
    SessionDef("joy", "Session with Joy", QUARTERLY, CAMPUS,
               mails=("invite", "feedback"), entities=(EZ,), step_key="session_joy"),

    # ── Annually ────────────────────────────────────────────────────────────────────────────
    SessionDef("anti_harassment", "Safe Workplace Practices: Anti-Harassment Awareness", ANNUAL,
               REMOTE, mails=("invite", "facilitator_profile", "feedback")),
    SessionDef("posh_awareness", "POSH Awareness Session", ANNUAL, CAMPUS,
               mails=("invite", "feedback")),
    SessionDef("posh_ic", "POSH IC Training", ANNUAL, CAMPUS, mails=("invite", "feedback")),
    SessionDef("iso_ai_security", "ISO / AI Data Security", ANNUAL, CAMPUS, mails=("invite",)),
    SessionDef("joy_2", "Session with Joy 2.0", ANNUAL, CAMPUS, mails=("invite", "feedback")),
    SessionDef("rotational", "Rotational Program", ANNUAL, CAMPUS, mails=("invite",)),

    # ── Twice a year ────────────────────────────────────────────────────────────────────────
    SessionDef("pulse_survey", "Pulse Survey", BIANNUAL, BOTH,
               mails=("invite", "non_attendees"),
               note="The second mail chases the people who did not come."),
    SessionDef("pulse_followup", "Pulse Survey Follow-Up Session", BIANNUAL, BOTH,
               mails=("invite", "non_attendees")),
]


BY_KEY: dict[str, SessionDef] = {s.key: s for s in CATALOGUE}

#: What each mail in a session is for, so the catalogue view can label them.
MAIL_LABELS = {
    "invite": "Invite",
    "feedback": "Feedback",
    "feedback_linkedin": "Feedback + LinkedIn profile link",
    "feedback_honor_code": "Feedback + honor code copy",
    "certificate_feedback": "Certificate + feedback",
    "facilitator_profile": "Facilitator's profile",
    "non_attendees": "Chase the non-attendees",
}


def catalogue_for(entity: str) -> list[SessionDef]:
    ent = (entity or EZ).upper()
    return [s for s in CATALOGUE if ent in s.entities]


def as_dict(s: SessionDef) -> dict:
    return {
        "key": s.key, "name": s.name, "frequency": s.frequency, "mode": s.mode,
        "mails": [{"key": m, "label": MAIL_LABELS.get(m, m)} for m in s.mails],
        "entities": list(s.entities), "audience": s.audience, "cc": list(s.cc),
        "invite_weekday": s.invite_weekday, "invite_time": s.invite_time,
        "invite_weeks_before": s.invite_weeks_before,
        "step_key": s.step_key, "note": s.note,
    }
