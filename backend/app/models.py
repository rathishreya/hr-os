"""SQLAlchemy ORM models — the data model for the core hiring loop.

Kept intentionally lean (SQLite/JSON columns) for the "basic" edition. Semi-structured
AI output (parsed resumes, sub-scores, hiring plans) lives in JSON columns rather than
a sprawl of side tables — easy to evolve, and Postgres JSONB upgrades cleanly later.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text
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
    status: Mapped[str] = mapped_column(String(30), default="draft")

    # Date the team intends to start actively hiring for this role (free-form ISO date string).
    start_hiring_date: Mapped[str] = mapped_column(String(40), default="")
    # Extra screening/technical questions shown on the public application form. List of
    # {"id": str, "label": str, "type": "text"|"textarea", "required": bool}.
    application_questions: Mapped[list] = mapped_column(JSON, default=list)
    # Job-level interview plan: the interview types this role runs, bulk-appliable to candidates.
    interview_types: Mapped[list] = mapped_column(JSON, default=list)

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
    title: Mapped[str] = mapped_column(String(200), default="")
    content: Mapped[str] = mapped_column(Text, default="")  # plain-text rendering (copy/email)
    blocks: Mapped[list] = mapped_column(JSON, default=list)  # structured doc: headings, paras, tables, signatures
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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


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
    recording: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
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
    active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class TPO(Base):
    """Training & Placement Officer at a college — for sending hiring requests to campuses."""

    __tablename__ = "tpos"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), default="")
    college: Mapped[str] = mapped_column(String(200), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(60), default="")
    linkedin: Mapped[str] = mapped_column(String(300), default="")
    designation: Mapped[str] = mapped_column(String(160), default="")
    address: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
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
