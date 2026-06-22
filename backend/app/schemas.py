"""Pydantic schemas for request/response bodies."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Note: email fields are plain `str` so we don't require the optional
# email-validator dependency. Validation can be tightened later.


# ---------- Hiring Request ----------
class HiringRequestCreate(BaseModel):
    position: str = Field(max_length=200)
    department: str = Field("", max_length=120)
    budget_ctc: str = ""
    yoe_min: float = 0
    yoe_max: float = 0
    mandatory_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    priority: str = "medium"
    hiring_deadline: str = ""
    location: str = ""
    work_mode: str = "onsite"
    interview_panel: list[str] = Field(default_factory=list)  # panelists
    hiring_manager: str = ""
    recruiter: str = ""
    num_openings: int = 1
    start_hiring_date: str = ""
    application_questions: list[dict[str, Any]] = Field(default_factory=list)
    interview_types: list[str] = Field(default_factory=list)
    role_brief: str = ""


class SuggestSkillsIn(BaseModel):
    position: str = ""
    department: str = ""
    yoe_min: float = 0
    yoe_max: float = 0


class SuggestSkillsOut(BaseModel):
    mandatory_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    provider: str = ""


class HiringRequestOut(HiringRequestCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    ai_summary: str
    ai_validation: dict[str, Any]
    difficulty_score: float
    difficulty_label: str
    est_time_to_hire_days: int
    suggested_salary: dict[str, Any]
    hiring_plan: list[Any]
    ai_provider: str
    created_at: datetime


# ---------- Job / JD ----------
class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    hiring_request_id: int
    title: str
    seo_title: str
    description: str
    responsibilities: list[Any]
    requirements: list[Any]
    company_description: str
    benefits: list[Any]
    culture: str
    linkedin_copy: str
    naukri_copy: str
    social_copy: str
    screening_questions: list[Any]
    knockout_questions: list[Any]
    interview_rubric: list[Any]
    status: str
    target_platforms: list[Any] = Field(default_factory=list)
    video_questions: list[Any] = Field(default_factory=list)
    distribution: dict[str, Any] = Field(default_factory=dict)
    ai_provider: str
    created_at: datetime


class JobUpdate(BaseModel):
    """Human edits to an AI-generated JD. Every field optional; only sent ones are applied."""

    title: str | None = None
    seo_title: str | None = None
    description: str | None = None
    responsibilities: list[str] | None = None
    requirements: list[str] | None = None
    company_description: str | None = None
    benefits: list[str] | None = None
    culture: str | None = None
    screening_questions: list[str] | None = None
    knockout_questions: list[str] | None = None


# ---------- Candidate ----------
class CandidateCreate(BaseModel):
    name: str = Field("", max_length=160)
    email: str = Field("", max_length=200)
    phone: str = Field("", max_length=60)
    source: str = Field("direct", max_length=40)
    resume_text: str = Field("", max_length=100_000)
    hiring_request_id: int | None = None  # if set, auto-create an application + score


class CandidateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    phone: str
    source: str
    resume_text: str
    parsed: dict[str, Any]
    ai_summary: str
    ai_provider: str
    resume_filename: str = ""
    resume_mime: str = ""
    created_at: datetime


# ---------- Application / Pipeline ----------
class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    candidate_id: int
    hiring_request_id: int
    stage: str
    notes: str
    score_overall: float
    score_dimensions: dict[str, Any]
    score_rationale: str
    score_breakdown: dict[str, Any] = Field(default_factory=dict)
    recommendation: str
    fit_label: str
    human_override: dict[str, Any]
    application_answers: list[Any] = Field(default_factory=list)
    applied_by: str = ""
    scored_at: datetime | None
    created_at: datetime

    @field_validator("application_answers", mode="before")
    @classmethod
    def _coerce_answers(cls, v):
        return v if isinstance(v, list) else []


class ApplicationWithCandidate(ApplicationOut):
    candidate: CandidateOut


class StageUpdate(BaseModel):
    stage: str
    note: str = ""


class HiringRequestUpdate(BaseModel):
    status: str | None = None
    position: str | None = None
    department: str | None = None
    budget_ctc: str | None = None
    yoe_min: float | None = None
    yoe_max: float | None = None
    mandatory_skills: list[str] | None = None
    preferred_skills: list[str] | None = None
    priority: str | None = None
    hiring_deadline: str | None = None
    location: str | None = None
    work_mode: str | None = None
    interview_panel: list[str] | None = None
    hiring_manager: str | None = None
    recruiter: str | None = None
    num_openings: int | None = None
    start_hiring_date: str | None = None
    application_questions: list[dict[str, Any]] | None = None
    interview_types: list[str] | None = None
    role_brief: str | None = None


# ---------- Publish / distribution ----------
class PublishRequest(BaseModel):
    platforms: list[str] = Field(default_factory=list)  # free boards selected at posting time


class JobRef(BaseModel):
    job_id: int


class LoginRequest(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


class SignupRequest(BaseModel):
    name: str = Field(max_length=160)
    email: str = Field(max_length=200)
    password: str = Field(min_length=8, max_length=200)


# ---------- Users & roles ----------
ROLE_CHOICES = ["recruiter", "manager", "admin", "panellist"]


class UserCreate(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    title: str = ""
    roles: list[str] = Field(default_factory=lambda: ["recruiter"])
    password: str = ""          # blank → auto-generated server-side
    send_credentials: bool = False


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    title: str | None = None
    roles: list[str] | None = None
    active: bool | None = None
    password: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    phone: str
    title: str
    roles: list[str]
    active: bool
    created_at: datetime
    has_password: bool = False


# ---------- TPO (campus placement officers) ----------
class TPOCreate(BaseModel):
    name: str = ""
    college: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    designation: str = ""
    address: str = ""
    notes: str = ""


class TPOUpdate(BaseModel):
    name: str | None = None
    college: str | None = None
    email: str | None = None
    phone: str | None = None
    linkedin: str | None = None
    designation: str | None = None
    address: str | None = None
    notes: str | None = None


class TPOOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    college: str
    email: str
    phone: str
    linkedin: str
    designation: str
    address: str
    notes: str
    created_at: datetime


class SendToTposRequest(BaseModel):
    tpo_ids: list[int] = Field(default_factory=list)
    message: str = ""       # optional extra note from the recruiter
    use_ai: bool = False    # AI-compose the outreach email


# ---------- Video interview (pre-defined questions, async one-way) ----------
class VideoQuestionsUpdate(BaseModel):
    questions: list[str] = Field(default_factory=list)


class VideoAnswerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    q_index: int
    question: str
    transcript: str
    mime: str
    duration: float
    has_video: bool = False
    created_at: datetime


class VideoInterviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    candidate_id: int
    role_position: str
    questions: list[Any]
    status: str
    summary: str
    scores: dict[str, Any]
    transcript: str = ""
    timeline: list[Any] = Field(default_factory=list)
    proctoring: dict[str, Any] = Field(default_factory=dict)
    duration: float = 0
    has_recording: bool = False
    created_at: datetime
    completed_at: datetime | None
    answers: list[VideoAnswerOut] = Field(default_factory=list)


class ApplyToRoleRequest(BaseModel):
    hiring_request_id: int


class NotesUpdate(BaseModel):
    notes: str


# ---------- Screening interview ----------
class ScreeningOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    candidate_id: int
    role_position: str
    questions: list[Any]
    transcript: list[Any]
    current_index: int
    status: str
    scores: dict[str, Any]
    summary: str
    strengths: list[Any]
    concerns: list[Any]
    per_question: list[Any] = Field(default_factory=list)
    recommendation: str
    ai_provider: str
    created_at: datetime
    completed_at: datetime | None
    current_question: str | None = None

    # The migration-added per_question column is nullable; tolerate NULL / non-list on read.
    @field_validator("strengths", "concerns", "per_question", mode="before")
    @classmethod
    def _coerce_list(cls, v):
        return v if isinstance(v, list) else []


class StartScreeningRequest(BaseModel):
    application_id: int


class AnswerRequest(BaseModel):
    answer: str


# ---------- Interview planning (human rounds) ----------
class InterviewRoundCreate(BaseModel):
    application_id: int
    round_number: int = 1
    interview_type: str = "technical"
    status: str = "scheduled"
    scheduled_at: str = ""
    duration_minutes: int = 60
    panelists: list[str] = Field(default_factory=list)
    location_or_link: str = ""
    notes: str = ""
    feedback: str = ""
    assessment_id: int | None = None
    send_invite: bool = False  # email the candidate the date/time/link + a calendar (.ics) invite


class BulkInterviewRoundsRequest(BaseModel):
    """Apply a set of interview types to many applications at once (job-level plan → candidates)."""

    application_ids: list[int] = Field(default_factory=list)
    interview_types: list[str] = Field(default_factory=list)
    duration_minutes: int = 60
    panelists: list[str] = Field(default_factory=list)
    scheduled_at: str = ""        # optional shared date/time for the allocated rounds
    location_or_link: str = ""    # optional shared meeting link / location
    send_invite: bool = False     # email each candidate the schedule + a calendar invite
    skip_existing: bool = True  # don't duplicate a type a candidate already has


class BulkInterviewRoundsOut(BaseModel):
    created: int
    skipped: int
    applications: int


class InterviewRoundUpdate(BaseModel):
    round_number: int | None = None
    interview_type: str | None = None
    status: str | None = None
    scheduled_at: str | None = None
    duration_minutes: int | None = None
    panelists: list[str] | None = None
    location_or_link: str | None = None
    notes: str | None = None
    feedback: str | None = None
    assessment_id: int | None = None


class InterviewRoundOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    round_number: int
    interview_type: str
    status: str
    scheduled_at: str
    duration_minutes: int
    panelists: list[str]
    location_or_link: str
    notes: str
    feedback: str
    panel_feedback: list[Any] = Field(default_factory=list)
    assessment_id: int | None = None
    created_at: datetime
    updated_at: datetime


class PanelFeedbackRequest(BaseModel):
    rating: int = 0                # 1–5 (0 = not rated)
    recommendation: str = ""       # strong_yes | yes | no | strong_no
    feedback: str = Field("", max_length=8000)


# ---------- Communications ----------
class SendEmailRequest(BaseModel):
    application_id: int | None = None
    candidate_id: int | None = None
    to_email: str = ""
    to_name: str = ""
    template: str = "acknowledgment"
    role: str = ""
    subject: str | None = None
    body: str | None = None
    use_ai: bool = False
    raw: bool = False  # preview: return the unrendered template (with {name} tokens) for editing


class BulkEmailRequest(BaseModel):
    application_ids: list[int]
    template: str = "acknowledgment"
    use_ai: bool = False
    subject: str | None = None  # optional edited template (with {name}/{role} tokens)
    body: str | None = None


class EmailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    candidate_id: int | None
    application_id: int | None
    to_email: str
    to_name: str
    template: str
    subject: str
    body: str
    status: str
    error: str
    ai_generated: bool
    created_at: datetime


# ---------- Documents (offers / contracts) ----------
class GenerateDocumentRequest(BaseModel):
    application_id: int
    doc_type: str = "offer_letter"  # offer_letter|employment_contract|traineeship_offer|nda|...
    template_key: str = ""  # EZ Lab template; defaults from doc_type when blank
    terms: dict[str, Any] = Field(default_factory=dict)  # name, designation, manager, start_date, annual_ctc, responsibilities, ...


class RegenerateDocumentRequest(BaseModel):
    template_key: str = ""  # switch template; blank keeps the document's current one
    terms: dict[str, Any] = Field(default_factory=dict)


class ApproveDocumentRequest(BaseModel):
    by: str = "recruiter"


class MoveToOnboardingRequest(BaseModel):
    move: bool = True


class DocumentTemplateOut(BaseModel):
    key: str
    label: str
    description: str
    doc_type: str


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int | None
    candidate_id: int
    doc_type: str
    template_key: str = ""
    personal_email: str = ""
    title: str
    content: str
    blocks: list[Any] = Field(default_factory=list)
    terms: dict[str, Any]
    status: str
    ai_provider: str
    approved_by: str
    approved_at: datetime | None
    move_to_onboarding: bool = False
    upload_filename: str = ""
    has_upload: bool = False
    created_at: datetime
    candidate_name: str = ""  # enriched by the list endpoint for the Offer & Docs page
    email: str = ""
    contact: str = ""
    position: str = ""
    department: str = ""
    compensation: str = ""
    location: str = ""
    joining_date: str = ""
    entity: str = "EZ"
    reporting_manager: str = ""
    approving_manager: str = ""

    # The migration-added columns are nullable; tolerate NULL on read of older rows.
    @field_validator("blocks", mode="before")
    @classmethod
    def _coerce_blocks(cls, v):
        return v if isinstance(v, list) else []

    @field_validator("template_key", mode="before")
    @classmethod
    def _coerce_template_key(cls, v):
        return v if isinstance(v, str) else ""

    @field_validator("move_to_onboarding", mode="before")
    @classmethod
    def _coerce_move(cls, v):
        return bool(v)


# ---------- Assessments ----------
class AssessmentFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    mime: str
    size: int


class AssessmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    team: str = ""
    department: str = ""
    role: str = ""
    filename: str          # first file (back-compat)
    mime: str
    size: int
    files: list[AssessmentFileOut] = Field(default_factory=list)
    created_at: datetime

    @field_validator("files", mode="before")
    @classmethod
    def _coerce_files(cls, v):
        return v if isinstance(v, list) else []


class DraftAssessmentEmailRequest(BaseModel):
    application_id: int | None = None  # used to fill role/company; name stays a {name} placeholder
    use_ai: bool = False


class DraftAssessmentEmailOut(BaseModel):
    subject: str
    body: str
    provider: str = ""


class SendAssessmentRequest(BaseModel):
    application_ids: list[int] = Field(default_factory=list)
    subject: str = ""
    body: str = ""


class SendAssessmentOut(BaseModel):
    sent: int
    logged: int
    failed: int
    total: int


# ---------- Onboarding ----------
class GenerateOnboardingRequest(BaseModel):
    application_id: int


class ToggleTaskRequest(BaseModel):
    task_id: int
    done: bool


class UpdateOnboardingDetailsRequest(BaseModel):
    details: dict[str, Any] = Field(default_factory=dict)


class OnboardingStepUpdate(BaseModel):
    """Update one onboarding step. Only the provided fields change. `date` is a manual override
    (sticks across joining-date reschedules); `day` reschedules off the joining date."""
    step_id: int
    status: str | None = None       # "" | done | pending | na
    value: str | None = None        # link URL / personality type / go-to person name
    date: str | None = None         # explicit date (manual override)
    comments: str | None = None
    attendance: str | None = None   # "" | present | absent
    day: int | None = None          # working-day offset → reschedule off the joining date


class OnboardingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    candidate_id: int
    role_position: str
    tasks: list[Any]
    induction: list[Any]
    tools: list[Any]
    buddy: str
    details: dict[str, Any] = Field(default_factory=dict)  # HR-filled hire details (entity, comp, managers, ...)
    status: str
    ai_provider: str
    created_at: datetime
    candidate_name: str = ""  # enriched by the list endpoint for the Onboarding page
    email: str = ""
    contact: str = ""
    position: str = ""
    department: str = ""

    @field_validator("tasks", "induction", "tools", mode="before")
    @classmethod
    def _coerce_list(cls, v):
        return v if isinstance(v, list) else []

    @field_validator("details", mode="before")
    @classmethod
    def _coerce_details(cls, v):
        return v if isinstance(v, dict) else {}


class ScoringWeights(BaseModel):
    """Configurable scoring weights (must roughly sum to 1.0; auto-normalized)."""

    skill_match: float = 0.30
    experience_match: float = 0.20
    domain_relevance: float = 0.12
    communication: float = 0.08
    leadership: float = 0.06
    culture_fit: float = 0.06
    growth_potential: float = 0.06
    salary_fit: float = 0.06
    stability: float = 0.06
