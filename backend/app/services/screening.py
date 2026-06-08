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
from .recruitment import hr_to_dict, log, str_list, to_rating


def _role_with_jd(hr: models.HiringRequest) -> dict:
    """Role dict enriched with the JD so the AI grounds its questions in the actual job description
    (responsibilities/requirements), not just the hiring-request fields."""
    role = hr_to_dict(hr)
    job = hr.job
    if job:
        role["jd"] = {
            "title": job.title,
            "description": job.description,
            "responsibilities": list(job.responsibilities or []),
            "requirements": list(job.requirements or []),
            "screening_questions": list(job.screening_questions or []),
        }
    return role


def start_interview(db: Session, application: models.Application) -> models.ScreeningInterview:
    hr = application.hiring_request
    cand = application.candidate
    result, provider = ai.screening_questions(_role_with_jd(hr), cand.parsed or {})
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

    scores = result.get("scores")
    interview.scores = scores if isinstance(scores, dict) else {}
    interview.summary = str(result.get("summary") or "")
    interview.strengths = str_list(result.get("strengths"))
    interview.concerns = str_list(result.get("concerns"))
    # Per-answer ratings: build EXACTLY one entry per transcript question, by index, so the
    # frontend's transcript[i] <-> per_question[i] mapping always holds even if the model
    # returns a wrong count, non-dict entries, or odd-shaped strengths/gaps. Crash-proof so a
    # malformed answer can never strand the interview mid-completion.
    n = len(interview.transcript or [])
    raw_pq = result.get("per_question")
    raw_pq = raw_pq if isinstance(raw_pq, list) else []
    try:
        interview.per_question = [
            {
                "rating": to_rating(pq.get("rating")) if isinstance(pq, dict) else 0,
                "strengths": str_list(pq.get("strengths"), cap=3) if isinstance(pq, dict) else [],
                "gaps": str_list(pq.get("gaps"), cap=3) if isinstance(pq, dict) else [],
            }
            for pq in [(raw_pq[i] if i < len(raw_pq) else {}) for i in range(n)]
        ]
    except Exception:
        interview.per_question = []
    rec = result.get("recommendation")
    interview.recommendation = rec if rec in ("advance", "hold", "reject") else ""
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
