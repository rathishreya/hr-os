"""Hiring request intake + AI validation + JD generation."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..services.ai import ai
from ..services.jobs_table import row_from_hiring_request
from ..services.recruitment import hr_to_dict, log

router = APIRouter(prefix="/api/hiring-requests", tags=["hiring-requests"])


def _normalize_questions(qs) -> list[dict]:
    """Clean the application-form questions: drop blanks, ensure each has a stable id + type."""
    out: list[dict] = []
    seen: set[str] = set()
    for i, q in enumerate(qs or []):
        if isinstance(q, str):
            q = {"label": q}
        if not isinstance(q, dict):
            continue
        label = str(q.get("label") or q.get("question") or "").strip()
        if not label:
            continue
        qid = str(q.get("id") or "").strip() or f"q{i + 1}"
        while qid in seen:
            qid = f"{qid}_{i}"
        seen.add(qid)
        qtype = q.get("type") if q.get("type") in ("text", "textarea") else "textarea"
        out.append({"id": qid, "label": label, "type": qtype, "required": bool(q.get("required"))})
    return out


def _clean_str_list(values) -> list[str]:
    return [t for t in dict.fromkeys(str(x).strip() for x in (values or [])) if t]


@router.post("", response_model=schemas.HiringRequestOut)
def create_hiring_request(payload: schemas.HiringRequestCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["application_questions"] = _normalize_questions(data.get("application_questions"))
    data["interview_types"] = _clean_str_list(data.get("interview_types"))
    data["interview_panel"] = _clean_str_list(data.get("interview_panel"))
    data["start_hiring_date"] = (data.get("start_hiring_date") or "").strip()
    data["hiring_manager"] = (data.get("hiring_manager") or "").strip()
    data["recruiter"] = (data.get("recruiter") or "").strip()
    hr = models.HiringRequest(**data)
    db.add(hr)
    db.flush()

    # AI: validate, estimate difficulty + time-to-hire, suggest salary, draft plan.
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

    log(db, "hiring_request.created", "hiring_request", hr.id, {"provider": provider, "position": hr.position})
    db.commit()
    db.refresh(hr)
    return hr


@router.post("/suggest-skills", response_model=schemas.SuggestSkillsOut)
def suggest_skills(payload: schemas.SuggestSkillsIn):
    """Stateless helper for the create-job form: suggest mandatory/preferred skills from the
    position + department + experience range, so the user gets an editable starting checklist."""
    if not payload.position.strip():
        return schemas.SuggestSkillsOut()
    result, provider = ai.suggest_skills(payload.model_dump())
    if not isinstance(result, dict):  # defensive: a malformed provider response
        result = {}
    return schemas.SuggestSkillsOut(
        mandatory_skills=[s for s in (result.get("mandatory_skills") or []) if s],
        preferred_skills=[s for s in (result.get("preferred_skills") or []) if s],
        provider=provider,
    )


@router.get("")
def list_hiring_requests(
    table: bool = False,
    q: str = "",
    status: str = "",
    db: Session = Depends(get_db),
):
    rows = db.scalars(select(models.HiringRequest).order_by(models.HiringRequest.created_at.desc())).all()
    if status.strip():
        rows = [r for r in rows if r.status == status.strip()]
    if q.strip():
        needle = q.strip().lower()
        rows = [
            r for r in rows
            if needle in " ".join([
                r.position or "", r.department or "", r.location or "",
                r.budget_ctc or "", " ".join(r.mandatory_skills or []),
            ]).lower()
        ]
    if not table:
        return [schemas.HiringRequestOut.model_validate(r) for r in rows]
    out = []
    for hr in rows:
        apps = db.scalars(
            select(models.Application).where(models.Application.hiring_request_id == hr.id)
        ).all()
        base = schemas.HiringRequestOut.model_validate(hr).model_dump()
        out.append({**base, **row_from_hiring_request(hr, apps)})
    return out


@router.get("/{hr_id}", response_model=schemas.HiringRequestOut)
def get_hiring_request(hr_id: int, db: Session = Depends(get_db)):
    hr = db.get(models.HiringRequest, hr_id)
    if not hr:
        raise HTTPException(404, "Hiring request not found")
    return hr


@router.patch("/{hr_id}", response_model=schemas.HiringRequestOut)
def update_hiring_request(hr_id: int, body: schemas.HiringRequestUpdate, db: Session = Depends(get_db)):
    hr = db.get(models.HiringRequest, hr_id)
    if not hr:
        raise HTTPException(404, "Hiring request not found")
    data = body.model_dump(exclude_unset=True)  # only fields the client actually sent
    changed: list[str] = []

    if "status" in data:
        if data["status"] not in ("open", "closed", "on_hold", "draft"):
            raise HTTPException(422, "Invalid status")
        hr.status = data["status"]
        changed.append("status")

    # Plain text fields (stripped).
    for fld in ("position", "department", "budget_ctc", "priority", "hiring_deadline",
                "location", "work_mode", "start_hiring_date", "hiring_manager", "recruiter"):
        if fld in data and data[fld] is not None:
            val = str(data[fld]).strip()
            if fld == "position" and not val:
                raise HTTPException(422, "Position cannot be empty")
            setattr(hr, fld, val)
            changed.append(fld)

    if data.get("yoe_min") is not None:
        hr.yoe_min = float(data["yoe_min"]); changed.append("yoe_min")
    if data.get("yoe_max") is not None:
        hr.yoe_max = float(data["yoe_max"]); changed.append("yoe_max")
    if data.get("num_openings") is not None:
        hr.num_openings = max(1, int(data["num_openings"])); changed.append("num_openings")

    for listf in ("mandatory_skills", "preferred_skills", "interview_panel"):
        if listf in data and data[listf] is not None:
            setattr(hr, listf, _clean_str_list(data[listf]))
            changed.append(listf)
    if data.get("application_questions") is not None:
        hr.application_questions = _normalize_questions(data["application_questions"])
        changed.append("application_questions")
    if data.get("interview_types") is not None:
        hr.interview_types = _clean_str_list(data["interview_types"])
        changed.append("interview_types")

    # Keep the published JD title in sync with the role title so the careers page, feeds and
    # JSON-LD reflect the edit. (The JD body is regenerated separately via Generate JD.)
    if "position" in changed:
        job = db.scalar(select(models.Job).where(models.Job.hiring_request_id == hr.id))
        if job:
            job.title = hr.position
            if not (job.seo_title or "").strip():
                job.seo_title = hr.position

    if changed:
        log(db, "hiring_request.updated", "hiring_request", hr.id, {"fields": changed})
    db.commit()
    db.refresh(hr)
    return hr


def _delete_hiring_request_cascade(db: Session, hr: models.HiringRequest) -> int:
    """Remove job + applications and related records. Candidates stay in the talent pool."""
    apps = db.scalars(
        select(models.Application).where(models.Application.hiring_request_id == hr.id)
    ).all()
    app_ids = [a.id for a in apps]
    if app_ids:
        # Delete EVERY child that references these applications first, or Postgres rejects the
        # delete with a foreign-key violation (which is why "posted" jobs — the ones that have
        # accumulated interview rounds / video interviews — wouldn't delete). VideoInterview's
        # answers cascade via the ORM relationship.
        for model, col in (
            (models.EmailMessage, models.EmailMessage.application_id),
            (models.ScreeningInterview, models.ScreeningInterview.application_id),
            (models.InterviewRound, models.InterviewRound.application_id),
            (models.VideoInterview, models.VideoInterview.application_id),
            (models.Document, models.Document.application_id),
            (models.OnboardingPlan, models.OnboardingPlan.application_id),
        ):
            for row in db.scalars(select(model).where(col.in_(app_ids))).all():
                db.delete(row)
        for app in apps:
            db.delete(app)
    if hr.job:
        db.delete(hr.job)
    position = hr.position
    hr_id = hr.id
    db.delete(hr)
    log(db, "hiring_request.deleted", "hiring_request", hr_id, {"position": position, "applications_removed": len(app_ids)})
    return len(app_ids)


@router.delete("/{hr_id}", status_code=204)
def delete_hiring_request(hr_id: int, db: Session = Depends(get_db)):
    hr = db.get(models.HiringRequest, hr_id)
    if not hr:
        raise HTTPException(404, "Hiring request not found")
    _delete_hiring_request_cascade(db, hr)
    db.commit()
    return Response(status_code=204)


@router.post("/{hr_id}/duplicate", response_model=schemas.HiringRequestOut)
def duplicate_hiring_request(hr_id: int, db: Session = Depends(get_db)):
    hr = db.get(models.HiringRequest, hr_id)
    if not hr:
        raise HTTPException(404, "Hiring request not found")
    clone = models.HiringRequest(
        position=f"{hr.position} (copy)",
        department=hr.department,
        budget_ctc=hr.budget_ctc,
        yoe_min=hr.yoe_min,
        yoe_max=hr.yoe_max,
        mandatory_skills=list(hr.mandatory_skills or []),
        preferred_skills=list(hr.preferred_skills or []),
        priority=hr.priority,
        hiring_deadline=hr.hiring_deadline,
        location=hr.location,
        work_mode=hr.work_mode,
        interview_panel=list(hr.interview_panel or []),
        num_openings=hr.num_openings,
        status="open",
    )
    db.add(clone)
    db.flush()
    log(db, "hiring_request.duplicated", "hiring_request", clone.id, {"from": hr_id, "position": clone.position})
    db.commit()
    db.refresh(clone)
    return clone


@router.post("/{hr_id}/generate-jd", response_model=schemas.JobOut)
def generate_jd(hr_id: int, db: Session = Depends(get_db)):
    hr = db.get(models.HiringRequest, hr_id)
    if not hr:
        raise HTTPException(404, "Hiring request not found")

    result, provider = ai.generate_jd(hr_to_dict(hr))

    job = hr.job or models.Job(hiring_request_id=hr.id)
    job.title = result.get("title", hr.position)
    job.seo_title = result.get("seo_title", "")
    job.description = result.get("description", "")
    job.responsibilities = result.get("responsibilities", [])
    job.requirements = result.get("requirements", [])
    # Always use the canonical company "About" (EZ Works) so every JD describes the real company.
    job.company_description = settings.COMPANY_ABOUT or result.get("company_description", "")
    job.benefits = result.get("benefits", [])
    job.culture = result.get("culture", "")
    job.linkedin_copy = result.get("linkedin_copy", "")
    job.naukri_copy = result.get("naukri_copy", "")
    job.social_copy = result.get("social_copy", "")
    job.screening_questions = result.get("screening_questions", [])
    job.knockout_questions = result.get("knockout_questions", [])
    job.interview_rubric = result.get("interview_rubric", [])
    job.ai_provider = provider
    if job.id is None:
        db.add(job)

    log(db, "job.generated", "job", hr.id, {"provider": provider})
    db.commit()
    db.refresh(job)
    return job


@router.get("/{hr_id}/job", response_model=schemas.JobOut)
def get_job(hr_id: int, db: Session = Depends(get_db)):
    hr = db.get(models.HiringRequest, hr_id)
    if not hr or not hr.job:
        raise HTTPException(404, "No JD generated yet")
    return hr.job
