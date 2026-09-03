"""SQLAlchemy ORM models — the data model for the core hiring loop.

Kept intentionally lean (SQLite/JSON columns) for the "basic" edition. Semi-structured
AI output (parsed resumes, sub-scores, hiring plans) lives in JSON columns rather than
a sprawl of side tables — easy to evolve, and Postgres JSONB upgrades cleanly later.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import Date, JSON, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class HiringRequest(Base):
    __tablename__ = "hiring_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    position: Mapped[str] = mapped_column(String(200))
    department: Mapped[str] = mapped_column(String(120), default="")
    budget_ctc: Mapped[str] = mapped_column(String(120), default="")  # free text e.g. "18-24 LPA"
    yoe_min: Mapped[float] = mapped_column(Float, default=0)
    yoe_max: Mapped[float] = mapped_column(Float, default=0)
    mandatory_skills: Mapped[list] = mapped_column(JSON, default=list)
    preferred_skills: Mapped[list] = mapped_column(JSON, default=list)
    priority: Mapped[str] = mapped_column(String(20), default="medium")  # low|medium|high|urgent
    hiring_deadline: Mapped[str] = mapped_column(String(40), default="")
    location: Mapped[str] = mapped_column(String(160), default="")
    work_mode: Mapped[str] = mapped_column(String(20), default="onsite")  # onsite|remote|hybrid
    interview_panel: Mapped[list] = mapped_column(JSON, default=list)  # panelists (multiselect)
    hiring_manager: Mapped[str] = mapped_column(String(160), default="")
    recruiter: Mapped[str] = mapped_column(String(160), default="")
    num_openings: Mapped[int] = mapped_column(Integer, default=1)
    team: Mapped[str] = mapped_column(String(120), default="")
    hire_type: Mapped[str] = mapped_column(String(20), default="")  # new | replacement
    status: Mapped[str] = mapped_column(String(30), default="draft")
    # When `status` last changed — drives the lifecycle rule: an on-hold role can be reopened
    # within 3 months, after which it is auto-paused. NULL on legacy rows.
    status_changed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Date the team intends to start actively hiring for this role (free-form ISO date string).
    start_hiring_date: Mapped[str] = mapped_column(String(40), default="")
    # Extra screening/technical questions shown on the public application form. List of
    # {"id": str, "label": str, "type": "text"|"textarea", "required": bool}.
    application_questions: Mapped[list] = mapped_column(JSON, default=list)
    # Job-level interview plan: the interview types this role runs, bulk-appliable to candidates.
    interview_types: Mapped[list] = mapped_column(JSON, default=list)
    # Recruiter's quick 100-200 word brief describing the role — seeds the AI job-description draft.
    role_brief: Mapped[str] = mapped_column(Text, default="")

    # --- AI-generated intelligence ---
    ai_summary: Mapped[str] = mapped_column(Text, default="")
    ai_validation: Mapped[dict] = mapped_column(JSON, default=dict)  # {issues:[], inconsistencies:[]}
    difficulty_score: Mapped[float] = mapped_column(Float, default=0)  # 0-100
    difficulty_label: Mapped[str] = mapped_column(String(30), default="")
    est_time_to_hire_days: Mapped[int] = mapped_column(Integer, default=0)
    suggested_salary: Mapped[dict] = mapped_column(JSON, default=dict)  # {min,max,currency,note}
    hiring_plan: Mapped[list] = mapped_column(JSON, default=list)
    ai_provider: Mapped[str] = mapped_column(String(20), default="")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    job: Mapped["Job | None"] = relationship(back_populates="hiring_request", uselist=False)
    applications: Mapped[list["Application"]] = relationship(back_populates="hiring_request")


class Job(Base):
    """The AI-generated job description / posting for a hiring request."""

    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    hiring_request_id: Mapped[int] = mapped_column(ForeignKey("hiring_requests.id"))

    title: Mapped[str] = mapped_column(String(200), default="")
    seo_title: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")  # markdown
    responsibilities: Mapped[list] = mapped_column(JSON, default=list)
    requirements: Mapped[list] = mapped_column(JSON, default=list)
    company_description: Mapped[str] = mapped_column(Text, default="")
    benefits: Mapped[list] = mapped_column(JSON, default=list)
    culture: Mapped[str] = mapped_column(Text, default="")

    linkedin_copy: Mapped[str] = mapped_column(Text, default="")
    naukri_copy: Mapped[str] = mapped_column(Text, default="")
    social_copy: Mapped[str] = mapped_column(Text, default="")

    screening_questions: Mapped[list] = mapped_column(JSON, default=list)
    knockout_questions: Mapped[list] = mapped_column(JSON, default=list)
    interview_rubric: Mapped[list] = mapped_column(JSON, default=list)

    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|published
    target_platforms: Mapped[list] = mapped_column(JSON, default=list)  # free boards chosen at posting time
    video_questions: Mapped[list] = mapped_column(JSON, default=list)  # pre-defined async video-interview Qs
    # Direct-posting status: {"google": {ok, at, error}, "linkedin": {ok, urn, at, error}}
    distribution: Mapped[dict] = mapped_column(JSON, default=dict)
    ai_provider: Mapped[str] = mapped_column(String(20), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    hiring_request: Mapped["HiringRequest"] = relationship(back_populates="job")


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(60), default="")
    source: Mapped[str] = mapped_column(String(60), default="direct")

    resume_text: Mapped[str] = mapped_column(Text, default="")
    parsed: Mapped[dict] = mapped_column(JSON, default=dict)
    ai_summary: Mapped[str] = mapped_column(Text, default="")
    embedding: Mapped[list] = mapped_column(JSON, default=list)
    ai_provider: Mapped[str] = mapped_column(String(20), default="")

    # Original uploaded file (for true preview). Empty for pasted-text candidates.
    resume_filename: Mapped[str] = mapped_column(String(255), default="")
    resume_mime: Mapped[str] = mapped_column(String(120), default="")
    resume_file: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    # Recruiter comment/notes on the candidate themselves (talent-pool level, spans all their apps).
    notes: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    applications: Mapped[list["Application"]] = relationship(back_populates="candidate")


class Application(Base):
    """A candidate applied to a specific hiring request — carries pipeline stage + scoring."""

    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"))
    hiring_request_id: Mapped[int] = mapped_column(ForeignKey("hiring_requests.id"))

    stage: Mapped[str] = mapped_column(String(30), default="applied")
    # applied|screening|shortlisted|interview|offer|hired|rejected
    notes: Mapped[str] = mapped_column(Text, default="")
    # Answers to the role's extra application questions, captured on the public apply form.
    # List of {"id": str, "label": str, "answer": str}.
    application_answers: Mapped[list] = mapped_column(JSON, default=list)
    # Who/what created this application: a recruiter's name/email, or the public channel the
    # candidate applied through ("Careers", "Referral", "LinkedIn", ...). Shown as "Applied by".
    applied_by: Mapped[str] = mapped_column(String(120), default="")

    # --- explainable AI score (suggestion only; human can override) ---
    score_overall: Mapped[float] = mapped_column(Float, default=0)  # 0-100
    score_dimensions: Mapped[dict] = mapped_column(JSON, default=dict)
    score_rationale: Mapped[str] = mapped_column(Text, default="")
    # Rich, self-describing report: strengths, gaps, per-dimension contributions,
    # skill blend, weights, thresholds. Powers the explainable "AI report" tab.
    score_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    recommendation: Mapped[str] = mapped_column(String(40), default="")
    fit_label: Mapped[str] = mapped_column(String(30), default="")
    human_override: Mapped[dict] = mapped_column(JSON, default=dict)
    scored_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # When `stage` last changed — powers the pipeline "Changed" date (created_at/scored_at don't move).
    stage_changed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    candidate: Mapped["Candidate"] = relationship(back_populates="applications")
    hiring_request: Mapped["HiringRequest"] = relationship(back_populates="applications")


class EmailMessage(Base):
    """A real outbound email (sent via SMTP or logged in dev). The candidate comms trail."""

    __tablename__ = "email_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int | None] = mapped_column(ForeignKey("candidates.id"), nullable=True)
    application_id: Mapped[int | None] = mapped_column(ForeignKey("applications.id"), nullable=True)

    to_email: Mapped[str] = mapped_column(String(200))
    to_name: Mapped[str] = mapped_column(String(160), default="")
    template: Mapped[str] = mapped_column(String(60), default="custom")
    subject: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="queued")  # sent|logged|failed
    error: Mapped[str] = mapped_column(Text, default="")
    ai_generated: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class InterviewRound(Base):
    """Human-scheduled interview round for an application (panel, slot, type, feedback)."""

    __tablename__ = "interview_rounds"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"))
    round_number: Mapped[int] = mapped_column(Integer, default=1)
    interview_type: Mapped[str] = mapped_column(String(40), default="technical")
    status: Mapped[str] = mapped_column(String(30), default="scheduled")  # draft|scheduled|completed|cancelled|no_show
    scheduled_at: Mapped[str] = mapped_column(String(40), default="")  # ISO local datetime from UI
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    panelists: Mapped[list] = mapped_column(JSON, default=list)
    location_or_link: Mapped[str] = mapped_column(String(500), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    feedback: Mapped[str] = mapped_column(Text, default="")
    # Per-panelist structured feedback: [{panelist, rating, recommendation, feedback, at}]
    panel_feedback: Mapped[list] = mapped_column(JSON, default=list)
    assessment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # set for "assessment" rounds
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class ScreeningInterview(Base):
    """An AI chat-based screening interview for an application ("beyond the resume").

    Inspired by FoloUp / aural-oss (MIT) but native to our stack — adaptive questions,
    a transcript, and an AI evaluation, running on our pluggable AI layer (no paid keys).
    """

    __tablename__ = "screening_interviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"))
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"))
    role_position: Mapped[str] = mapped_column(String(200), default="")

    questions: Mapped[list] = mapped_column(JSON, default=list)
    transcript: Mapped[list] = mapped_column(JSON, default=list)  # [{"q": ..., "a": ...}]
    current_index: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="in_progress")  # in_progress|completed

    scores: Mapped[dict] = mapped_column(JSON, default=dict)  # communication, technical_depth, ...
    summary: Mapped[str] = mapped_column(Text, default="")
    strengths: Mapped[list] = mapped_column(JSON, default=list)
    concerns: Mapped[list] = mapped_column(JSON, default=list)
    # Per-answer rating + feedback, aligned by index to `transcript`:
    # [{"rating": 0-100, "strengths": [...], "gaps": [...]}, ...]
    per_question: Mapped[list] = mapped_column(JSON, default=list)
    recommendation: Mapped[str] = mapped_column(String(40), default="")
    ai_provider: Mapped[str] = mapped_column(String(20), default="")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Document(Base):
    """An AI-drafted offer letter / employment agreement / NDA / contractor agreement.

    Always created as a DRAFT. A human must explicitly approve before it's considered
    issued — AI never auto-issues a legal document.
    """

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int | None] = mapped_column(ForeignKey("applications.id"), nullable=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"))

    doc_type: Mapped[str] = mapped_column(String(40))  # offer_letter|employment_contract|traineeship_offer|nda|...
    template_key: Mapped[str] = mapped_column(String(60), default="")  # which EZ Lab template drafted it
    # Candidate's personal email (offers go here, not the work email). Editable until they join.
    personal_email: Mapped[str] = mapped_column(String(200), default="")
    title: Mapped[str] = mapped_column(String(200), default="")
    content: Mapped[str] = mapped_column(Text, default="")  # plain-text rendering (copy/email)
    blocks: Mapped[list] = mapped_column(JSON, default=list)  # structured doc: headings, paras, tables, signatures
    # Manual rich-editor override. When non-empty, the preview/PDF render THIS HTML (on the EZ
    # letterhead) instead of `blocks` — set when a recruiter hand-edits the letter; cleared on
    # regenerate so a fresh template wins.
    content_html: Mapped[str] = mapped_column(Text, default="")
    terms: Mapped[dict] = mapped_column(JSON, default=dict)  # annual_ctc, manager, start_date, responsibilities, ...
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|approved
    ai_provider: Mapped[str] = mapped_column(String(20), default="")
    approved_by: Mapped[str] = mapped_column(String(120), default="")
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Recruiter-uploaded final/signed PDF (or other file) for this entry.
    upload_filename: Mapped[str] = mapped_column(String(255), default="")
    upload_mime: Mapped[str] = mapped_column(String(120), default="")
    upload_size: Mapped[int] = mapped_column(Integer, default=0)
    upload_file: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    # Gate for onboarding: the candidate only appears on the Onboarding page once this is set.
    move_to_onboarding: Mapped[bool] = mapped_column(default=False)
    # When the covering email carrying this document was last sent (NULL = never sent).
    email_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    # Last time any field on this document changed. NULL on rows that predate the column.
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=True)


class OnboardingPlan(Base):
    """AI-generated onboarding plan for a hired candidate: task checklist + induction schedule."""

    __tablename__ = "onboarding_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"))
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"))
    role_position: Mapped[str] = mapped_column(String(200), default="")

    tasks: Mapped[list] = mapped_column(JSON, default=list)  # [{id, phase, title, category, owner, done}]
    induction: Mapped[list] = mapped_column(JSON, default=list)  # [{day, items:[...]}]
    tools: Mapped[list] = mapped_column(JSON, default=list)
    buddy: Mapped[str] = mapped_column(String(160), default="")
    # HR-filled hire details mirrored on the tracker: entity, compensation, location, joining_date,
    # department, reporting_manager, approving_manager, email, contact, status.
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="active")
    ai_provider: Mapped[str] = mapped_column(String(20), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class VideoInterview(Base):
    """An async one-way video interview for an application. Questions are PRE-DEFINED
    (set per role, not AI-generated). The candidate records a video answer per question;
    open-source Whisper transcribes on-device. Video + transcript are kept for human review."""

    __tablename__ = "video_interviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"))
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"))
    role_position: Mapped[str] = mapped_column(String(200), default="")

    questions: Mapped[list] = mapped_column(JSON, default=list)  # snapshot of the pre-defined questions
    status: Mapped[str] = mapped_column(String(20), default="in_progress")  # in_progress|completed
    summary: Mapped[str] = mapped_column(Text, default="")
    scores: Mapped[dict] = mapped_column(JSON, default=dict)
    # Structured AI assessment: {verdict: fit|maybe|unfit, reasoning, strengths:[], gaps:[],
    # per_question:[{q_index, question, answer, rating, comment}]}
    evaluation: Mapped[dict] = mapped_column(JSON, default=dict)
    ai_provider: Mapped[str] = mapped_column(String(20), default="")

    # Single continuous (proctored) recording of the whole session — anti-cheat.
    transcript: Mapped[str] = mapped_column(Text, default="")
    timeline: Mapped[list] = mapped_column(JSON, default=list)      # [{q_index, question, at}] seconds into the take
    proctoring: Mapped[dict] = mapped_column(JSON, default=dict)    # {focus_lost, fullscreen_exits, events:[...]}
    recording: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)  # DB fallback when S3 is off
    recording_key: Mapped[str] = mapped_column(String(300), default="")          # S3 object key when S3 is on
    recording_mime: Mapped[str] = mapped_column(String(120), default="video/webm")
    duration: Mapped[float] = mapped_column(Float, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    answers: Mapped[list["VideoAnswer"]] = relationship(back_populates="interview", cascade="all, delete-orphan")


class VideoAnswer(Base):
    """One recorded answer (video blob + transcript) to a pre-defined question."""

    __tablename__ = "video_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("video_interviews.id"))
    q_index: Mapped[int] = mapped_column(Integer, default=0)
    question: Mapped[str] = mapped_column(Text, default="")
    transcript: Mapped[str] = mapped_column(Text, default="")
    video: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    mime: Mapped[str] = mapped_column(String(120), default="video/webm")
    duration: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    interview: Mapped["VideoInterview"] = relationship(back_populates="answers")


class Assessment(Base):
    """A reusable assessment (one or more uploaded files) recruiters send to candidates.

    The legacy `filename`/`mime`/`size`/`file` columns mirror the FIRST file for backward
    compatibility (older callers + the /file preview link); the full set lives in `files`.
    """

    __tablename__ = "assessments"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    # Scope: which team / department / role this assessment is meant for. `department` lets a job
    # auto-suggest matching assessments when it's created.
    team: Mapped[str] = mapped_column(String(120), default="")
    department: Mapped[str] = mapped_column(String(120), default="")
    role: Mapped[str] = mapped_column(String(200), default="")
    filename: Mapped[str] = mapped_column(String(255), default="")
    mime: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    file: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    files: Mapped[list["AssessmentFile"]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan", order_by="AssessmentFile.id",
    )


class AssessmentFile(Base):
    """One file belonging to an assessment (an assessment can bundle several)."""

    __tablename__ = "assessment_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id"))
    filename: Mapped[str] = mapped_column(String(255), default="")
    mime: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    file: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    assessment: Mapped["Assessment"] = relationship(back_populates="files")


class User(Base):
    """A team member of the hiring org. Carries one or more roles that determine where
    they're placed in the tool (e.g. a 'panellist' becomes selectable on interview rounds).

    NOTE: login/auth is not enforced yet — this is a directory + role assignment. Passwords
    are stored hashed (never plaintext) so credential email + future login are real.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(60), default="")
    title: Mapped[str] = mapped_column(String(160), default="")  # designation
    roles: Mapped[list] = mapped_column(JSON, default=list)  # ["recruiter","manager","admin","panellist"]
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    # Per-user outbound mailbox: the user's own Gmail/Workspace App Password. When set, this
    # user's candidate emails authenticate as their login email and are sent FROM it (true
    # send-from). Empty → fall back to the shared workspace SMTP. Never returned by the API.
    smtp_password: Mapped[str] = mapped_column(String(255), default="")
    # OAuth refresh token for the user's connected Google account — used to create a real Google
    # Meet link + calendar event for scheduled interview rounds. Empty → fall back to Jitsi. Never
    # returned by the API.
    google_refresh_token: Mapped[str] = mapped_column(String(512), default="")
    # The OAuth scopes the user actually granted (space-separated). We send their candidate email
    # via the Gmail API only when this includes gmail.send — so a calendar-only connection never
    # breaks their sending.
    google_scope: Mapped[str] = mapped_column(String(512), default="")
    active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class TPO(Base):
    """Training & Placement Officer at a college — for sending hiring requests to campuses."""

    __tablename__ = "tpos"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Which kind of hiring partner this is — a campus placement cell or a recruitment vendor.
    # Drives the badge in Settings and tailors the outreach email wording.
    kind: Mapped[str] = mapped_column(String(20), default="college")  # college | vendor
    name: Mapped[str] = mapped_column(String(160), default="")
    college: Mapped[str] = mapped_column(String(200), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(60), default="")
    linkedin: Mapped[str] = mapped_column(String(300), default="")
    designation: Mapped[str] = mapped_column(String(160), default="")
    address: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")  # partner-submitted "additional info"
    comments: Mapped[str] = mapped_column(Text, default="")  # internal recruiter comments (editable)
    # The rich partner-form fields that don't warrant dedicated columns — for vendors: geographies,
    # industries, hiring types, TAT, fee structure; for colleges: programs, disciplines, stipend,
    # CTC, seasons, engagement modes. Stored as free-form key/value so the table can show any of them.
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class AuditLog(Base):
    """Lightweight governance trail — every AI decision and stage change lands here."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor: Mapped[str] = mapped_column(String(120), default="system")
    action: Mapped[str] = mapped_column(String(120))
    entity: Mapped[str] = mapped_column(String(60), default="")
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

class OnboardingSubmission(Base):
    """A candidate's filled-in onboarding form.

    Its own table rather than OnboardingPlan.details, because the form goes out WITH the offer
    letter and an onboarding plan does not exist until HR presses "move to onboarding" weeks
    later. candidate_id is nullable on purpose: the generic public link can be filled in by
    someone who is not in the system yet, and HR attaches them afterwards.
    """

    __tablename__ = "onboarding_submissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int | None] = mapped_column(ForeignKey("candidates.id"), nullable=True)
    application_id: Mapped[int | None] = mapped_column(ForeignKey("applications.id"), nullable=True)
    variant: Mapped[str] = mapped_column(String(20), default="individual")  # individual|freelancer|organization
    email: Mapped[str] = mapped_column(String(200), default="")   # lifted out of answers so HR can search it
    legal_name: Mapped[str] = mapped_column(String(200), default="")
    answers: Mapped[dict] = mapped_column(JSON, default=dict)     # every non-file field, keyed as onboardingFields.js
    status: Mapped[str] = mapped_column(String(20), default="submitted")  # submitted|reviewed
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=True)


class OnboardingUpload(Base):
    """One file from an onboarding form.

    Stored in S3 when it is configured and streamed there so a 5 MB scan never sits in memory;
    otherwise kept inline, which is what a developer machine on SQLite does. A candidate can send
    eight of these, so putting them all in Postgres on purpose would grow the RDS backup for no
    reason.
    """

    __tablename__ = "onboarding_uploads"

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("onboarding_submissions.id"))
    field_key: Mapped[str] = mapped_column(String(60))
    filename: Mapped[str] = mapped_column(String(255), default="")
    mime: Mapped[str] = mapped_column(String(120), default="")
    size: Mapped[int] = mapped_column(Integer, default=0)
    s3_key: Mapped[str] = mapped_column(String(400), default="")
    data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

class OnboardingStepState(Base):
    """One candidate's answer on one checklist step.

    A row per (plan, step) rather than a blob on the plan, because a step carries a status, a date,
    comments, an attendance mark and sometimes a file, and because the three views all want to ask
    "which steps are overdue" across candidates — a question a JSON column cannot answer without
    reading every plan.

    The step definitions themselves live in services/onboarding/steps.py, not here: they are the
    People team's process, they change together, and a row that references a retired step should
    simply stop being rendered rather than break a query.
    """

    __tablename__ = "onboarding_step_states"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("onboarding_plans.id"))
    step_key: Mapped[str] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(12), default="Pending")  # Pending|Done|NA
    value: Mapped[str] = mapped_column(Text, default="")        # a typed value, or a date as ISO
    comments: Mapped[dict] = mapped_column(JSON, default=dict)  # slot -> note; "" is the default slot
    attended: Mapped[bool | None] = mapped_column(nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    #: When the automated mail actually went out, so nothing is sent twice.
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    #: A due date somebody set by hand, overriding the working-day arithmetic. The calculated date
    #: is the plan; this is what actually happened, and once it is set every view uses it.
    due_override: Mapped[date | None] = mapped_column(Date, nullable=True)
    #: template key -> when it was sent. A step can carry more than one mail (the ISO course and
    #: its quiz; the training form and the manager's), and a single timestamp cannot say which of
    #: them has gone, which is how somebody gets the same mail twice.
    sent_mails: Mapped[dict] = mapped_column(JSON, default=dict)
    upload_id: Mapped[int | None] = mapped_column(ForeignKey("onboarding_uploads.id"), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=True)


class SessionOccurrence(Base):
    """One sitting of a catalogue session: Brand EZ on the 14th, not Brand EZ in general.

    The definition lives in services/onboarding/sessions.py. This is the date it actually runs, so
    the calendar view has something to show and to move.
    """

    __tablename__ = "session_occurrences"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_key: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(8), default="EZ")
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    mode: Mapped[str] = mapped_column(String(10), default="both")   # campus|remote|both
    location: Mapped[str] = mapped_column(String(200), default="")
    meet_link: Mapped[str] = mapped_column(String(400), default="")
    status: Mapped[str] = mapped_column(String(12), default="scheduled")  # scheduled|done|cancelled
    invites_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    #: Who this sitting's mails go to: {"groups": [...], "saved": [id], "emails": [...]}.
    #: Stored as the RULE rather than the resolved names, so a session the whole company attends
    #: reaches whoever is here on the day, not whoever was here when it was scheduled.
    audience: Mapped[dict] = mapped_column(JSON, default=dict)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=True)


class SessionAttendee(Base):
    """One person invited to one sitting, and whether they came.

    Attendance drives who gets the feedback mail: the spec says "send email as per attendance", so
    the list has to be per person and not a headcount.
    """

    __tablename__ = "session_attendees"

    id: Mapped[int] = mapped_column(primary_key=True)
    occurrence_id: Mapped[int] = mapped_column(ForeignKey("session_occurrences.id"))
    candidate_id: Mapped[int | None] = mapped_column(ForeignKey("candidates.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(160), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    invited_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    attended: Mapped[bool | None] = mapped_column(nullable=True)
    feedback_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class RecipientGroup(Base):
    """A mailing list somebody built by hand.

    The built-in groups in services/onboarding/audience.py are RULES: "everyone with a login",
    "on onboarding, ArabEasy". They stay right on their own. This is the other kind, the one no
    rule can express because it only exists in a person's head: the six people who run the
    induction, the leads who need the POSH briefing first. Members are stored by name and address
    rather than by id, because half of them are not users of this system and never will be.
    """

    __tablename__ = "recipient_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    note: Mapped[str] = mapped_column(String(300), default="")
    members: Mapped[list] = mapped_column(JSON, default=list)   # [{name, email}]
    created_by: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=True)


class MailLink(Base):
    """The address behind a phrase in the onboarding letters.

    services/onboarding/links.py names every link the People team's document carries and holds the
    addresses that document actually showed. The rest were hyperlinks whose target was never
    visible, so they have to be typed in once. This is where that answer lives, keyed by the same
    key, and it also lets an address change without a deploy when a form moves.
    """

    __tablename__ = "mail_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True)
    url: Mapped[str] = mapped_column(String(600), default="")
    updated_by: Mapped[str] = mapped_column(String(200), default="")
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, default=_now, onupdate=_now, nullable=True)
