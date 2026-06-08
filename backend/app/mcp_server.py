"""HR-OS MCP server.

Exposes the recruitment workflow as Model Context Protocol tools, so an AI agent
(Claude Desktop, Claude Code, any MCP client) can DRIVE the real system end to end:
raise a role, generate a JD, ingest + score candidates, move pipeline stages, and
send candidate emails. It calls the exact same services as the REST API and writes to
the same database — there is no mock layer here.

Run:
    cd backend
    python -m app.mcp_server          # stdio transport (for Claude Desktop)

Claude Desktop config (claude_desktop_config.json):
    {
      "mcpServers": {
        "hr-os": {
          "command": "python",
          "args": ["-m", "app.mcp_server"],
          "cwd": "<absolute path>/hr/backend"
        }
      }
    }
"""

from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from . import models
from .database import SessionLocal, init_db
from .services import mailer, recruitment, screening as screening_svc
from .services.ai import ai
from .services.recruitment import hr_to_dict

mcp = FastMCP("hr-os")


def _apply_ai_to_role(hr: models.HiringRequest) -> None:
    result, provider = ai.validate_hiring_request(hr_to_dict(hr))
    hr.ai_summary = result.get("summary", "")
    hr.ai_validation = result.get("validation", {})
    hr.difficulty_score = float(result.get("difficulty_score", 0) or 0)
    hr.difficulty_label = result.get("difficulty_label", "")
    hr.est_time_to_hire_days = int(result.get("est_time_to_hire_days", 0) or 0)
    hr.suggested_salary = result.get("suggested_salary", {})
    hr.hiring_plan = result.get("hiring_plan", [])
    hr.ai_provider = provider
    hr.status = "open"


@mcp.tool()
def list_roles() -> list[dict[str, Any]]:
    """List all hiring requests (open roles) with AI difficulty and time-to-hire estimates."""
    with SessionLocal() as db:
        rows = db.query(models.HiringRequest).order_by(models.HiringRequest.created_at.desc()).all()
        return [
            {"id": r.id, "position": r.position, "department": r.department, "status": r.status,
             "difficulty": r.difficulty_label, "difficulty_score": r.difficulty_score,
             "est_time_to_hire_days": r.est_time_to_hire_days, "openings": r.num_openings}
            for r in rows
        ]


@mcp.tool()
def create_hiring_request(
    position: str,
    department: str = "",
    mandatory_skills: list[str] | None = None,
    preferred_skills: list[str] | None = None,
    yoe_min: float = 0,
    yoe_max: float = 0,
    budget_ctc: str = "",
    location: str = "",
    work_mode: str = "hybrid",
    priority: str = "medium",
    num_openings: int = 1,
) -> dict[str, Any]:
    """Create a hiring request. AI validates it and estimates difficulty, time-to-hire, and salary."""
    with SessionLocal() as db:
        hr = models.HiringRequest(
            position=position, department=department,
            mandatory_skills=mandatory_skills or [], preferred_skills=preferred_skills or [],
            yoe_min=yoe_min, yoe_max=yoe_max, budget_ctc=budget_ctc,
            location=location, work_mode=work_mode, priority=priority, num_openings=num_openings,
        )
        db.add(hr)
        db.flush()
        _apply_ai_to_role(hr)
        recruitment.log(db, "hiring_request.created", "hiring_request", hr.id, {"via": "mcp", "position": position})
        db.commit()
        return {"id": hr.id, "position": hr.position, "difficulty": hr.difficulty_label,
                "est_time_to_hire_days": hr.est_time_to_hire_days, "suggested_salary": hr.suggested_salary,
                "validation": hr.ai_validation}


@mcp.tool()
def generate_job_description(hiring_request_id: int) -> dict[str, Any]:
    """Generate a full AI job description (JD, platform copy, screening questions) for a role."""
    with SessionLocal() as db:
        hr = db.get(models.HiringRequest, hiring_request_id)
        if not hr:
            return {"error": "Hiring request not found"}
        result, provider = ai.generate_jd(hr_to_dict(hr))
        job = hr.job or models.Job(hiring_request_id=hr.id)
        for k in ("title", "seo_title", "description", "company_description", "culture",
                  "linkedin_copy", "naukri_copy", "social_copy"):
            setattr(job, k, result.get(k, ""))
        for k in ("responsibilities", "requirements", "benefits", "screening_questions",
                  "knockout_questions", "interview_rubric"):
            setattr(job, k, result.get(k, []))
        job.ai_provider = provider
        if job.id is None:
            db.add(job)
        recruitment.log(db, "job.generated", "job", hr.id, {"via": "mcp", "provider": provider})
        db.commit()
        return {"title": job.title, "description": job.description,
                "screening_questions": job.screening_questions, "linkedin_copy": job.linkedin_copy}


@mcp.tool()
def ingest_candidate(resume_text: str, name: str = "", email: str = "", hiring_request_id: int | None = None) -> dict[str, Any]:
    """Parse + embed a resume into a candidate. If hiring_request_id is given, apply and AI-score them."""
    with SessionLocal() as db:
        cand = recruitment.ingest_candidate(db, name=name, email=email, phone="", source="mcp", resume_text=resume_text)
        out: dict[str, Any] = {"candidate_id": cand.id, "name": cand.name,
                               "skills": (cand.parsed or {}).get("skills", []),
                               "total_yoe": (cand.parsed or {}).get("total_yoe")}
        if hiring_request_id:
            hr = db.get(models.HiringRequest, hiring_request_id)
            if not hr:
                db.commit()
                return {**out, "error": "Hiring request not found"}
            app = recruitment.apply_candidate(db, cand, hr, auto_score=True)
            out.update({"application_id": app.id, "score": app.score_overall,
                        "recommendation": app.recommendation, "fit": app.fit_label})
        db.commit()
        return out


@mcp.tool()
def get_pipeline(hiring_request_id: int) -> list[dict[str, Any]]:
    """Get the ranked candidate pipeline for a role (sorted by AI score)."""
    with SessionLocal() as db:
        apps = (db.query(models.Application)
                .filter(models.Application.hiring_request_id == hiring_request_id)
                .order_by(models.Application.score_overall.desc()).all())
        return [
            {"application_id": a.id, "candidate": a.candidate.name, "email": a.candidate.email,
             "stage": a.stage, "score": a.score_overall, "recommendation": a.recommendation,
             "fit": a.fit_label, "rationale": a.score_rationale}
            for a in apps
        ]


@mcp.tool()
def move_stage(application_id: int, stage: str) -> dict[str, Any]:
    """Move an application to a pipeline stage: applied|screening|shortlisted|interview|offer|hired|rejected."""
    valid = ["applied", "screening", "shortlisted", "interview", "offer", "hired", "rejected"]
    if stage not in valid:
        return {"error": f"Invalid stage. Must be one of {valid}"}
    with SessionLocal() as db:
        app = db.get(models.Application, application_id)
        if not app:
            return {"error": "Application not found"}
        old = app.stage
        app.stage = stage
        recruitment.log(db, "application.stage_changed", "application", app.id, {"via": "mcp", "from": old, "to": stage}, actor="agent")
        db.commit()
        return {"application_id": app.id, "from": old, "to": stage}


@mcp.tool()
def send_candidate_email(application_id: int, template: str = "acknowledgment", use_ai: bool = True) -> dict[str, Any]:
    """Send a candidate email for an application. Templates: acknowledgment|shortlisted|interview_invite|rejection|offer."""
    with SessionLocal() as db:
        app = db.get(models.Application, application_id)
        if not app:
            return {"error": "Application not found"}
        rec = mailer.compose(
            db, to_email=app.candidate.email, to_name=app.candidate.name, template=template,
            role=app.hiring_request.position, use_ai=use_ai,
            candidate_id=app.candidate_id, application_id=app.id,
        )
        db.commit()
        return {"email_id": rec.id, "to": rec.to_email, "subject": rec.subject, "status": rec.status}


@mcp.tool()
def start_screening(application_id: int) -> dict[str, Any]:
    """Start an AI screening interview for an application. Returns the first question + interview id."""
    with SessionLocal() as db:
        app = db.get(models.Application, application_id)
        if not app:
            return {"error": "Application not found"}
        interview = screening_svc.start_interview(db, app)
        db.commit()
        return {"interview_id": interview.id, "question": screening_svc.current_question(interview),
                "total_questions": len(interview.questions)}


@mcp.tool()
def answer_screening(interview_id: int, answer: str) -> dict[str, Any]:
    """Submit the candidate's answer to the current screening question. Returns the next
    question, or the final evaluation when the interview completes."""
    with SessionLocal() as db:
        interview = db.get(models.ScreeningInterview, interview_id)
        if not interview:
            return {"error": "Interview not found"}
        if interview.status == "completed":
            return {"error": "Interview already completed"}
        screening_svc.submit_answer(db, interview, answer)
        db.commit()
        if interview.status == "completed":
            return {"status": "completed", "scores": interview.scores,
                    "recommendation": interview.recommendation, "summary": interview.summary}
        return {"status": "in_progress", "next_question": screening_svc.current_question(interview)}


@mcp.tool()
def hiring_analytics() -> dict[str, Any]:
    """Get hiring funnel analytics across all roles."""
    with SessionLocal() as db:
        apps = db.query(models.Application).all()
        funnel: dict[str, int] = {}
        for a in apps:
            funnel[a.stage] = funnel.get(a.stage, 0) + 1
        return {"total_roles": db.query(models.HiringRequest).count(),
                "total_candidates": db.query(models.Candidate).count(),
                "total_applications": len(apps), "funnel": funnel}


def main() -> None:
    init_db()
    ai.refresh()
    mcp.run()


if __name__ == "__main__":
    main()
