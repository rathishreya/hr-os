"""The onboarding checklist, exactly as the People team defined it.

This is the canonical list. It lives in the backend rather than beside the UI because the same
definitions drive three different things: what the checklist renders, when a mail is due (counted
in WORKING days from the joining date), and which mails carry a calendar invite. Splitting that
across two languages is how the form and the table stop agreeing.

Entities
--------
Every step names the entities it exists for. The spec's "Remove" means the step does not exist for
that entity at all — not hidden, not greyed out, absent — so a step simply omits that entity from
`entities`. Steps the spec removes for BOTH entities are not here at all; the ones dropped were
Candidate ID, Offer Letter/Folder link, Mail: Go-to-Person, Admin Sheet update, NDA/Contract links,
Poster on TV, the 100-day checklist handout, HR check-ins 2 and 3, Go-to-person meetings 2 and 3
and the first-Friday one, the crossword activity, the ISO quiz score sheet, the health insurance
form, Check-in w HR 1, the flashcard activity and its feedback, the review session, the rotational
programme and its feedback, the BE-column mail, the first-100-days write-up, the TV celebration,
and the hiring/onboarding HR comments field.

Kinds
-----
    source      read from somewhere else and shown, not edited here
    status      Done / Pending / NA
    text        a short typed value
    date        a date somebody sets
    mail        an email that goes out with the candidate's fields filled in
    meeting     a calendar hold
    session     an invite plus a date plus who turned up
    feedback    the feedback form for the session named in `feedback_of`
    derived     computed, never entered
"""
from __future__ import annotations

from dataclasses import dataclass

EZ = "EZ"
AEZ = "AEZ"
BOTH = (EZ, AEZ)

STATUSES = ("Pending", "Done", "NA")


@dataclass(frozen=True)
class Step:
    key: str
    label: str
    phase: str
    kind: str
    entities: tuple[str, ...] = BOTH
    comments: bool = False
    #: Working days from the joining date. Working days, not calendar days — the spec counts
    #: "the 45th working day", and a candidate joining on a Thursday would otherwise be chased a
    #: fortnight early.
    due_working_day: int | None = None
    attendance: bool = False
    #: For a feedback step: the key of the session it belongs to. The spec repeats the label
    #: "Feedback on session" five times; what distinguishes them is the session above.
    feedback_of: str | None = None
    #: Where a `source` step reads from.
    source: str | None = None
    #: Extra comment boxes beyond the single default one.
    comment_slots: tuple[str, ...] = ()
    upload: bool = False
    #: Whether this mail goes out on its own or waits for a person.
    #: Boilerplate with merge fields sends itself; anything carrying a judgement, going to a
    #: manager, or depending on who turned up waits in the queue for HR to read and send.
    #: A default, not a rule — it can be flipped per candidate on the row.
    auto: bool = False
    note: str = ""


PHASES = [
    ("before", "Before they join"),
    ("day_one", "Day one"),
    ("first_month", "First month"),
    ("sessions", "Sessions"),
    ("close", "Certification and close"),
]


STEPS: list[Step] = [
    # ── Before they join ────────────────────────────────────────────────────────────────────
    Step("candidate_name", "Candidate name", "before", "source", source="documents",
         note="From their offer paperwork."),
    Step("joining_date", "Joining date", "before", "source", source="documents",
         note="From their offer paperwork. Every working-day due date counts from here."),
    Step("role", "Role", "before", "source", source="documents"),
    Step("lwd", "LWD", "before", "date",
         note="From the ERP. Typed here until that is connected."),
    Step("documents_verification", "Documents verification", "before", "status", comments=True),

    # ── Day one ─────────────────────────────────────────────────────────────────────────────
    Step("welcome_mail", "Welcome to EZ mail", "day_one", "mail", due_working_day=1, auto=True),
    Step("hod_mail", "Mail to HOD / manager", "day_one", "mail", due_working_day=1),
    Step("culture_mail", "Mail: culture and life at EZ", "day_one", "mail", due_working_day=1, auto=True),
    Step("first_day_mail", "Mail: first day overview and dive deeper", "day_one", "mail",
         due_working_day=1, auto=True),
    Step("policy_faq_mail", "Policy and FAQ mail, with the NDA", "day_one", "mail",
         due_working_day=1, auto=True),
    Step("induction_session", "Induction session", "day_one", "date",
         note="Date set by hand."),
    Step("go_to_person", "Go-to-person", "day_one", "text", entities=(EZ,),
         note="Named at the start."),
    Step("go_to_person_meeting", "Meeting with their go-to-person", "day_one", "meeting",
         entities=(EZ,), due_working_day=1),
    Step("asset_allocation", "Asset allocation, with the common wallpaper", "day_one", "status",
         entities=(EZ,)),
    Step("poster_ez_life", "Poster on the EZ Life group", "day_one", "status"),

    # ── First month ─────────────────────────────────────────────────────────────────────────
    Step("linkedin_update", "LinkedIn profile updated", "first_month", "source",
         source="application",
         note="From the application form, where they already had the link to hand."),
    Step("hiring_feedback_form", "Hiring feedback form", "first_month", "status"),
    Step("mbti", "MBTI test submitted", "first_month", "status", comments=True,
         note="Record the personality type in the comment."),
    Step("iso_course", "ISO course completed and ISO quiz", "first_month", "status"),
    Step("manager_expectations_mail", "Mail to the manager to share expectations", "first_month",
         "mail", due_working_day=7),
    Step("induction_feedback", "Induction and onboarding feedback form", "first_month", "mail",
         due_working_day=15, comments=False, note="Mail goes out, then the form is chased.", auto=True),
    Step("hr_checkin_1", "Monthly HR check-in", "first_month", "meeting", due_working_day=30,
         comments=True),

    # ── Sessions ────────────────────────────────────────────────────────────────────────────
    Step("performance_buddy", "Meet the performance buddy", "sessions", "date", comments=True,
         note="Tuesdays, 6:30-8:30pm. Scheduled by hand."),
    Step("session_joy", "Session with Joy", "sessions", "session", entities=(EZ,), attendance=True),
    Step("session_joy_feedback", "Feedback on the session with Joy", "sessions", "feedback",
         entities=(EZ,), feedback_of="session_joy"),
    Step("session_brand_ez", "Brand EZ", "sessions", "session", attendance=True),
    Step("session_brand_ez_feedback", "Feedback on Brand EZ", "sessions", "feedback",
         feedback_of="session_brand_ez"),
    Step("session_honor_code", "EZ honor code session", "sessions", "session", attendance=True),
    Step("session_honor_code_feedback", "Feedback on the honor code session", "sessions",
         "feedback", feedback_of="session_honor_code"),
    Step("session_sales_deck", "Sales deck session", "sessions", "session", attendance=True),
    Step("session_sales_deck_feedback", "Feedback on the sales deck session", "sessions",
         "feedback", feedback_of="session_sales_deck"),

    # ── Certification and close ─────────────────────────────────────────────────────────────
    Step("certification_form_mail", "Certification detail form", "close", "mail",
         due_working_day=45, auto=True),
    Step("training_manager_feedback", "Training and manager feedback forms", "close", "mail",
         due_working_day=90,
         note="Goes to the manager and the employee together."),
    Step("hundred_day_analysis", "Analysis of check-ins, feedback, activities and the pulse check",
         "close", "meeting", due_working_day=95, comments=True,
         comment_slots=("Self", "Individual", "Manager")),
    Step("manager_checkin", "Check-in with the manager on the analysis", "close", "meeting",
         due_working_day=100),
    Step("hundred_days", "100 days completed, and certification", "close", "session",
         attendance=True, upload=True, note="Upload the certificate here."),
    Step("team_wall_photo", "Photograph on the Team EZ wall", "close", "status"),
    Step("finish_checklist", "Checklist finished", "close", "derived",
         note="The share of this candidate's steps that are Done."),
]


BY_KEY: dict[str, Step] = {s.key: s for s in STEPS}


def steps_for(entity: str) -> list[Step]:
    """The steps that exist for an entity. A step absent here is absent, not hidden."""
    ent = (entity or EZ).upper()
    return [s for s in STEPS if ent in s.entities]


def as_dict(s: Step) -> dict:
    return {
        "key": s.key, "label": s.label, "phase": s.phase, "kind": s.kind,
        "entities": list(s.entities), "comments": s.comments,
        "due_working_day": s.due_working_day, "attendance": s.attendance,
        "feedback_of": s.feedback_of, "source": s.source,
        "comment_slots": list(s.comment_slots), "upload": s.upload, "note": s.note,
    }
