"""AI screening interview workflow — generate questions, run a chat, auto-evaluate.

Native, free implementation (no Retell/paid voice). The candidate (or a recruiter on a
call) answers in chat; the AI evaluates the transcript at the end and attaches scores +
a recommendation to the application. Human always decides — this is decision *support*.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .. import models
from .ai import ai
from .recruitment import hr_to_dict, log


def start_interview(db: Session, application: models.Application) -> models.ScreeningInterview:
    hr = application.hiring_request
    cand = application.candidate
    result, provider = ai.screening_questions(hr_to_dict(hr), cand.parsed or {})
    questions = result.get("questions") or []
    # Fall back to the JD's screening questions, then a generic set.
    if not questions and hr.job and hr.job.screening_questions:
        questions = list(hr.job.screening_questions)
    if not questions:
        questions = [
            "What attracted you to this role?",
            "Tell me about a project you're proud of.",
            "What are your strongest technical skills?",
            "Describe a challenge you overcame at work.",
            "What's your notice period and expected compensation?",
        ]

    interview = models.ScreeningInterview(
        application_id=application.id,
        candidate_id=cand.id,
        role_position=hr.position,
        questions=questions,
        transcript=[],
        current_index=0,
        status="in_progress",
        ai_provider=provider,
    )
    db.add(interview)
    db.flush()
    log(db, "screening.started", "screening", interview.id, {"provider": provider, "application_id": application.id})
    return interview


def submit_answer(db: Session, interview: models.ScreeningInterview, answer: str) -> models.ScreeningInterview:
    if interview.status == "completed":
        return interview
    questions = interview.questions or []
    idx = interview.current_index
    if idx < len(questions):
        # SQLAlchemy JSON columns need reassignment to detect mutation.
        interview.transcript = (interview.transcript or []) + [{"q": questions[idx], "a": answer}]
        interview.current_index = idx + 1

    if interview.current_index >= len(questions):
        _evaluate(db, interview)
    db.flush()
    return interview


def _evaluate(db: Session, interview: models.ScreeningInterview) -> None:
    application = db.get(models.Application, interview.application_id)
    hr = application.hiring_request if application else None
    hr_d = hr_to_dict(hr) if hr else {}
    result, provider = ai.evaluate_screening(hr_d, interview.transcript or [])

    interview.scores = result.get("scores", {})
    interview.summary = result.get("summary", "")
    interview.strengths = result.get("strengths", [])
    interview.concerns = result.get("concerns", [])
    interview.recommendation = result.get("recommendation", "")
    interview.status = "completed"
    interview.completed_at = datetime.now(timezone.utc)
    interview.ai_provider = provider

    # Feed the communication signal back into the application's score dimensions (non-destructive).
    if application and interview.scores.get("communication") is not None:
        dims = dict(application.score_dimensions or {})
        dims["communication"] = interview.scores["communication"]
        application.score_dimensions = dims

    log(
        db, "screening.completed", "screening", interview.id,
        {"provider": provider, "overall": interview.scores.get("overall"), "recommendation": interview.recommendation},
    )


def current_question(interview: models.ScreeningInterview) -> str | None:
    questions = interview.questions or []
    if interview.status == "completed" or interview.current_index >= len(questions):
        return None
    return questions[interview.current_index]
