"""Pydantic schemas for request/response bodies."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# Note: email fields are plain `str` so we don't require the optional
# email-validator dependency. Validation can be tightened later.


# ---------- Hiring Request ----------
class HiringRequestCreate(BaseModel):
    position: str
    department: str = ""
    budget_ctc: str = ""
    yoe_min: float = 0
    yoe_max: float = 0
    mandatory_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    priority: str = "medium"
    hiring_deadline: str = ""
    location: str = ""
    work_mode: str = "onsite"
    interview_panel: list[str] = Field(default_factory=list)
    num_openings: int = 1


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
    ai_provider: str
    created_at: datetime


# ---------- Candidate ----------
class CandidateCreate(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    source: str = "direct"
    resume_text: str = ""
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
    recommendation: str
    fit_label: str
    human_override: dict[str, Any]
    scored_at: datetime | None
    created_at: datetime


class ApplicationWithCandidate(ApplicationOut):
    candidate: CandidateOut


class StageUpdate(BaseModel):
    stage: str
    note: str = ""


class HiringRequestUpdate(BaseModel):
    status: str | None = None


# ---------- Publish / distribution ----------
class PublishRequest(BaseModel):
    platforms: list[str] = Field(default_factory=list)  # free boards selected at posting time


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
    recommendation: str
    ai_provider: str
    created_at: datetime
    completed_at: datetime | None
    current_question: str | None = None


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
    created_at: datetime
    updated_at: datetime


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
    doc_type: str = "offer_letter"  # offer_letter|employment_agreement|nda|contractor_agreement
    terms: dict[str, Any] = Field(default_factory=dict)


class ApproveDocumentRequest(BaseModel):
    by: str = "recruiter"


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int | None
    candidate_id: int
    doc_type: str
    title: str
    content: str
    terms: dict[str, Any]
    status: str
    ai_provider: str
    approved_by: str
    approved_at: datetime | None
    created_at: datetime


# ---------- Onboarding ----------
class GenerateOnboardingRequest(BaseModel):
    application_id: int


class ToggleTaskRequest(BaseModel):
    task_id: int
    done: bool


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
    status: str
    ai_provider: str
    created_at: datetime


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
