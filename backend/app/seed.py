"""Seed demo data so the app is explorable immediately.

Run:  python -m app.seed
"""
from __future__ import annotations

from .database import SessionLocal, init_db
from . import models
from .services import recruitment
from .services.ai import ai
from .services.recruitment import hr_to_dict

DEMO_RESUMES = [
    {
        "name": "Aarav Sharma",
        "email": "aarav@example.com",
        "source": "referral",
        "resume_text": (
            "Senior Backend Engineer with 6 years of experience. Strong in Python, FastAPI, "
            "Django, PostgreSQL, Redis, Docker, Kubernetes and AWS. Led a team of 4 building "
            "microservices handling 5M requests/day. Built CI/CD pipelines. B.Tech in Computer "
            "Science. Notice period: 30 days. Expected CTC: 24 LPA."
        ),
    },
    {
        "name": "Diya Patel",
        "email": "diya@example.com",
        "source": "linkedin",
        "resume_text": (
            "Full-stack developer, 3 years experience. React, TypeScript, Node, some Python. "
            "Built customer dashboards with Tailwind. Familiar with SQL and REST APIs. "
            "Looking for growth into backend roles. Notice period: immediate."
        ),
    },
    {
        "name": "Rohan Mehta",
        "email": "rohan@example.com",
        "source": "naukri",
        "resume_text": (
            "Software engineer with 8 years experience in Java and Spring. Recently learning "
            "Python and microservices. Strong system design and algorithms. Mentored juniors. "
            "PostgreSQL, Kafka, Docker. M.Tech. Expected CTC 30 LPA."
        ),
    },
]


def run() -> None:
    init_db()
    ai.refresh()
    db = SessionLocal()
    try:
        if db.query(models.HiringRequest).count() > 0:
            print("Data already present — skipping seed.")
            return

        payload = {
            "position": "Senior Backend Engineer",
            "department": "Engineering",
            "budget_ctc": "20-28 LPA",
            "yoe_min": 4,
            "yoe_max": 8,
            "mandatory_skills": ["Python", "FastAPI", "PostgreSQL", "Docker", "AWS"],
            "preferred_skills": ["Kubernetes", "Redis", "Kafka"],
            "priority": "high",
            "hiring_deadline": "2026-07-15",
            "location": "Bengaluru",
            "work_mode": "hybrid",
            "interview_panel": ["Tech Lead", "Engineering Manager"],
            "num_openings": 2,
        }
        hr = models.HiringRequest(**payload)
        db.add(hr)
        db.flush()

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

        jd, jprov = ai.generate_jd(hr_to_dict(hr))
        job = models.Job(hiring_request_id=hr.id, ai_provider=jprov, **{
            k: jd.get(k, default) for k, default in {
                "title": hr.position, "seo_title": "", "description": "", "responsibilities": [],
                "requirements": [], "company_description": "", "benefits": [], "culture": "",
                "linkedin_copy": "", "naukri_copy": "", "social_copy": "",
                "screening_questions": [], "knockout_questions": [], "interview_rubric": [],
            }.items()
        })
        db.add(job)

        for r in DEMO_RESUMES:
            cand = recruitment.ingest_candidate(
                db, name=r["name"], email=r["email"], phone="", source=r["source"], resume_text=r["resume_text"]
            )
            recruitment.apply_candidate(db, cand, hr, auto_score=True)

        db.commit()
        print(f"Seeded demo data using AI provider: {provider}")
        print("Start the API:  uvicorn app.main:app --reload")
    finally:
        db.close()


if __name__ == "__main__":
    run()
