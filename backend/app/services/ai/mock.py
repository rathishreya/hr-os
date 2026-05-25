"""Deterministic, dependency-free fallback "AI".

This is not random noise — it's a real rule-based engine that reads the input data and
produces useful, consistent output. It guarantees the whole product works end-to-end with
no API key and no model server, and serves as the safety net when a real provider errors.
"""
from __future__ import annotations

import re
from typing import Any

_SKILL_HINTS = [
    "python", "java", "javascript", "typescript", "react", "node", "fastapi", "django",
    "flask", "sql", "postgresql", "mysql", "mongodb", "redis", "aws", "gcp", "azure",
    "docker", "kubernetes", "terraform", "go", "rust", "c++", "c#", "kotlin", "swift",
    "graphql", "rest", "kafka", "spark", "airflow", "pytorch", "tensorflow", "ml",
    "nlp", "llm", "langchain", "tailwind", "next.js", "vue", "angular", "git", "ci/cd",
    "microservices", "system design", "data structures", "algorithms", "leadership",
]


def _years_from_text(text: str) -> float:
    matches = re.findall(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years|yrs|year)", text, re.IGNORECASE)
    nums = [float(m) for m in matches]
    return max(nums) if nums else 0.0


def _detect_skills(text: str) -> list[str]:
    low = text.lower()
    found = [s for s in _SKILL_HINTS if s in low]
    return sorted(set(found))


def _clamp(v: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, v))


def _validate(hr: dict[str, Any]) -> dict[str, Any]:
    issues, inconsistencies = [], []
    if not hr.get("mandatory_skills"):
        issues.append("No mandatory skills specified.")
    if not hr.get("budget_ctc"):
        issues.append("Budget/CTC is empty — hard to benchmark compensation.")
    if not hr.get("hiring_deadline"):
        issues.append("No hiring deadline set.")
    yoe_min = float(hr.get("yoe_min") or 0)
    yoe_max = float(hr.get("yoe_max") or 0)
    if yoe_max and yoe_min and yoe_min > yoe_max:
        inconsistencies.append("Minimum YOE is greater than maximum YOE.")
    title = (hr.get("position") or "").lower()
    if any(w in title for w in ["senior", "lead", "principal", "staff"]) and yoe_min < 4:
        inconsistencies.append("Senior-level title but low minimum years of experience.")

    n_mand = len(hr.get("mandatory_skills") or [])
    difficulty = _clamp(35 + n_mand * 8 + yoe_min * 3 + (15 if "urgent" == hr.get("priority") else 0))
    label = (
        "easy" if difficulty < 40 else
        "moderate" if difficulty < 60 else
        "hard" if difficulty < 80 else "very hard"
    )
    tth = int(20 + difficulty * 0.6)
    base = 800000 + yoe_min * 350000
    return {
        "summary": (
            f"{hr.get('position') or 'This role'} in {hr.get('department') or 'the team'} "
            f"requiring {len(hr.get('mandatory_skills') or [])} core skills and "
            f"{yoe_min:g}-{yoe_max:g} years of experience."
        ),
        "validation": {"issues": issues, "inconsistencies": inconsistencies},
        "difficulty_score": round(difficulty),
        "difficulty_label": label,
        "est_time_to_hire_days": tth,
        "suggested_salary": {
            "min": round(base),
            "max": round(base * 1.4),
            "currency": "INR",
            "note": "Heuristic estimate from YOE; refine with market data.",
        },
        "hiring_plan": [
            "Finalize JD and screening criteria",
            "Publish to job boards and referral channels",
            "Screen + AI-rank incoming applications",
            "AI/HR screening round",
            "Technical assessment",
            "Panel interviews",
            "Offer and negotiation",
        ],
    }


def _jd(hr: dict[str, Any]) -> dict[str, Any]:
    pos = hr.get("position") or "Software Engineer"
    dept = hr.get("department") or "Engineering"
    mand = hr.get("mandatory_skills") or []
    pref = hr.get("preferred_skills") or []
    loc = hr.get("location") or "Remote"
    mode = hr.get("work_mode") or "onsite"
    return {
        "title": pos,
        "seo_title": f"{pos} — {dept} | {loc} ({mode})",
        "description": (
            f"We're hiring a **{pos}** to join our {dept} team. You'll work on meaningful "
            f"problems with a modern stack and a high-ownership culture. This is a {mode} "
            f"role based in {loc}."
        ),
        "responsibilities": [
            f"Own and deliver {dept} initiatives end to end",
            "Collaborate across product, design, and engineering",
            "Write maintainable, well-tested code",
            "Mentor peers and raise the engineering bar",
        ],
        "requirements": (
            [f"{hr.get('yoe_min', 0):g}+ years of relevant experience"]
            + [f"Strong skills in {s}" for s in mand]
            + ([f"Nice to have: {', '.join(pref)}"] if pref else [])
        ),
        "company_description": "A fast-growing, product-led company building for scale.",
        "benefits": [
            "Competitive compensation",
            "Health insurance",
            "Flexible work",
            "Learning budget",
        ],
        "culture": "We value ownership, curiosity, candor, and shipping with quality.",
        "linkedin_copy": f"🚀 We're hiring a {pos} ({mode}, {loc})! Skills: {', '.join(mand) or 'see JD'}. Apply now.",
        "naukri_copy": f"Hiring {pos} | {dept} | {loc} | {hr.get('yoe_min',0):g}-{hr.get('yoe_max',0):g} yrs | Skills: {', '.join(mand)}",
        "social_copy": f"We're growing our {dept} team — looking for a {pos}. Know someone great? 👀",
        "screening_questions": [
            "Walk us through a project you're most proud of.",
            f"How have you applied {mand[0] if mand else 'your core skills'} recently?",
            "What's your notice period and expected compensation?",
        ],
        "knockout_questions": [
            f"Do you have hands-on experience with {mand[0] if mand else 'the required stack'}? (yes/no)",
            f"Can you work in {mode} mode from {loc}? (yes/no)",
        ],
        "interview_rubric": [
            {"area": s, "what_to_assess": f"Depth and applied experience in {s}", "weight": round(1 / max(len(mand), 1), 2)}
            for s in (mand or ["General engineering"])
        ],
    }


def _parse_resume(text: str) -> dict[str, Any]:
    from ..resume_extract import parse_resume_text

    return parse_resume_text(text)


def _score(hr: dict[str, Any], parsed: dict[str, Any]) -> dict[str, Any]:
    cand_skills = {s.lower() for s in parsed.get("skills", [])}
    mand = {s.lower() for s in hr.get("mandatory_skills", [])}
    pref = {s.lower() for s in hr.get("preferred_skills", [])}
    skill_match = 0.0
    if mand:
        skill_match = 100 * len(cand_skills & mand) / len(mand)
        if pref:
            skill_match = _clamp(skill_match + 10 * len(cand_skills & pref) / max(len(pref), 1))

    yoe = float(parsed.get("total_yoe") or 0)
    ymin = float(hr.get("yoe_min") or 0)
    ymax = float(hr.get("yoe_max") or 0) or (ymin + 4)
    if ymin <= yoe <= ymax:
        exp_match = 100.0
    elif yoe < ymin:
        exp_match = _clamp(100 - (ymin - yoe) * 20)
    else:
        exp_match = _clamp(100 - (yoe - ymax) * 8)

    dims = {
        "skill_match": round(skill_match),
        "experience_match": round(exp_match),
        "domain_relevance": round(_clamp(50 + skill_match * 0.3)),
        "communication": 65,
        "leadership": 60,
        "culture_fit": 65,
        "growth_potential": 70,
        "salary_fit": 70,
        "stability": 65,
    }
    rec = (
        "strong_yes" if skill_match >= 80 and exp_match >= 70 else
        "yes" if skill_match >= 60 else
        "maybe" if skill_match >= 40 else "no"
    )
    fit = (
        "excellent" if skill_match >= 80 else
        "good" if skill_match >= 60 else
        "average" if skill_match >= 40 else "weak"
    )
    return {
        "dimensions": dims,
        "rationale": (
            f"Matched {len(cand_skills & mand)}/{len(mand) or 0} mandatory skills "
            f"(~{round(skill_match)}%). Experience {yoe:g} yrs vs required {ymin:g}-{ymax:g} "
            f"(~{round(exp_match)}% fit). Soft dimensions are heuristic defaults — confirm in interview."
        ),
        "strengths": sorted(cand_skills & (mand | pref))[:5] or ["See resume"],
        "concerns": sorted(mand - cand_skills)[:5] and [f"Missing: {s}" for s in sorted(mand - cand_skills)[:5]] or [],
        "recommendation": rec,
        "fit_label": fit,
    }


def _compose_email(ctx: dict[str, Any]) -> dict[str, Any]:
    from .prompts import _SYSTEM  # noqa: F401  (keep import graph obvious)
    name = ctx.get("name") or "there"
    role = ctx.get("role") or "the role"
    company = ctx.get("company") or "our company"
    sender = ctx.get("sender") or "Talent Team"
    return {
        "subject": f"Regarding the {role} role at {company}",
        "body": (
            f"Hi {name},\n\nThank you for your interest in the {role} role at {company}. "
            f"We're reviewing your profile and will be in touch with next steps soon.\n\n"
            f"Best regards,\n{sender}"
        ),
    }


def _screening_questions(hr: dict[str, Any], parsed: dict[str, Any]) -> dict[str, Any]:
    skills = (hr.get("mandatory_skills") or [])[:2] or (parsed.get("skills") or [])[:2]
    role = hr.get("position") or "this role"
    qs = [
        f"To start, what attracted you to the {role} role?",
        f"Tell me about a recent project where you used {skills[0] if skills else 'your core skills'}.",
        (f"How would you approach a problem involving {skills[1]}?" if len(skills) > 1
         else "Walk me through how you debug a tricky issue."),
        "Describe a time you disagreed with a teammate and how you resolved it.",
        "What are you looking for in your next role, and what's your availability?",
    ]
    return {"questions": qs}


def _evaluate_screening(hr: dict[str, Any], transcript: list[dict[str, Any]]) -> dict[str, Any]:
    answers = [t.get("a", "") for t in transcript if t.get("a")]
    avg_len = sum(len(a.split()) for a in answers) / len(answers) if answers else 0
    joined = " ".join(answers).lower()
    skill_hits = sum(1 for s in (hr.get("mandatory_skills") or []) if s.lower() in joined)
    n_mand = len(hr.get("mandatory_skills") or []) or 1

    communication = _clamp(40 + avg_len * 2)
    technical = _clamp(40 + 100 * skill_hits / n_mand * 0.6 + avg_len)
    confidence = _clamp(50 + avg_len * 1.5)
    clarity = _clamp(45 + avg_len * 1.8)
    overall = round((communication + technical + confidence + clarity) / 4)
    rec = "advance" if overall >= 65 else "hold" if overall >= 45 else "reject"
    return {
        "scores": {
            "communication": round(communication),
            "technical_depth": round(technical),
            "confidence": round(confidence),
            "clarity": round(clarity),
            "overall": overall,
        },
        "summary": (
            f"Answered {len(answers)} questions with ~{round(avg_len)} words each and referenced "
            f"{skill_hits}/{n_mand} required skills. Heuristic evaluation — confirm depth in a live round."
        ),
        "strengths": (["Engaged, detailed answers"] if avg_len > 25 else ["Responsive"]),
        "concerns": (["Answers were brief — probe deeper"] if avg_len < 15 else []),
        "recommendation": rec,
    }


def _document(doc_type: str, ctx: dict[str, Any]) -> dict[str, Any]:
    name = ctx.get("candidate_name") or "[CANDIDATE NAME]"
    role = ctx.get("position") or "[ROLE]"
    company = ctx.get("company") or "[COMPANY]"
    ctc = ctx.get("ctc") or "[COMPENSATION]"
    start = ctx.get("joining_date") or "[START DATE]"
    loc = ctx.get("location") or "[LOCATION]"
    titles = {
        "offer_letter": "Offer of Employment",
        "employment_agreement": "Employment Agreement",
        "nda": "Mutual Non-Disclosure Agreement",
        "contractor_agreement": "Independent Contractor Agreement",
    }
    title = titles.get(doc_type, "Employment Document")
    if doc_type == "nda":
        body = (
            f"# {title}\n\nThis Mutual Non-Disclosure Agreement is entered into between **{company}** "
            f"and **{name}** as of {start}.\n\n## 1. Confidential Information\nEach party may disclose "
            "confidential information to the other. The receiving party agrees to protect it and use it "
            "solely for the stated purpose.\n\n## 2. Term\nThis Agreement remains in effect for [TERM] years.\n\n"
            "## 3. Return of Materials\nUpon request, all confidential materials shall be returned or destroyed.\n\n"
            "## 4. Governing Law\nThis Agreement is governed by the laws of [JURISDICTION].\n\n"
            f"**{company}** ___________________  **{name}** ___________________\n"
        )
    else:
        body = (
            f"# {title}\n\nDear {name},\n\nWe are pleased to offer you the position of **{role}** at "
            f"**{company}**.\n\n## Position\nYou will join as {role}, based in {loc}, reporting to "
            f"{ctx.get('manager') or '[MANAGER]'}.\n\n## Compensation\nYour total compensation will be "
            f"**{ctc}**.\n\n## Start Date\nYour expected start date is {start}.\n\n## Probation\n"
            f"{ctx.get('probation') or '[PROBATION PERIOD]'}.\n\n## Confidentiality & IP\nYou agree to protect "
            "company confidential information and assign work-product IP to the company.\n\n## Termination\n"
            f"Either party may terminate with {ctx.get('notice_period') or '[NOTICE PERIOD]'} notice.\n\n"
            "## Governing Law\nThis document is governed by the laws of [JURISDICTION].\n\n"
            f"Sincerely,\n{company}\n\nAccepted: ___________________  Date: ___________\n"
        )
    return {"title": f"{title} — {name}", "content": body}


def _onboarding(ctx: dict[str, Any]) -> dict[str, Any]:
    role = ctx.get("position") or "the role"
    dept = ctx.get("department") or "the team"
    return {
        "tasks": [
            {"title": "Create email + SSO account", "category": "IT", "owner": "IT Admin"},
            {"title": "Provision laptop and peripherals", "category": "IT", "owner": "IT Admin"},
            {"title": "Add to Slack, calendar, and team channels", "category": "IT", "owner": "IT Admin"},
            {"title": "Collect ID, tax, and bank documents", "category": "HR", "owner": "HR"},
            {"title": "Sign employment agreement and NDA", "category": "Compliance", "owner": "HR"},
            {"title": "Enroll in payroll and benefits", "category": "HR", "owner": "HR"},
            {"title": f"Assign a buddy from {dept}", "category": "Team", "owner": "Manager"},
            {"title": f"Walk through {role} responsibilities and goals", "category": "Team", "owner": "Manager"},
            {"title": "Grant access to code/repos and tools", "category": "IT", "owner": "Tech Lead"},
            {"title": "Complete security & compliance training", "category": "Learning", "owner": "New Hire"},
            {"title": "Set 30/60/90-day goals", "category": "Learning", "owner": "Manager"},
        ],
        "induction": [
            {"day": "Day 1", "items": ["Welcome + workplace tour", "Account setup", "Meet the team", "Buddy intro"]},
            {"day": "Week 1", "items": ["Tooling deep-dive", "Codebase/process walkthrough", "First small task"]},
            {"day": "Month 1", "items": ["Own a deliverable", "30-day check-in", "Feedback session"]},
        ],
        "tools": ["Email/SSO", "Slack", "Calendar", "Jira", "GitHub", "HRMS/Payroll"],
        "buddy": f"Senior member of {dept}",
    }


def run(task: str, context: dict[str, Any]) -> dict[str, Any]:
    if task == "validate_hiring_request":
        return _validate(context["hr"])
    if task == "generate_jd":
        return _jd(context["hr"])
    if task == "parse_resume":
        return _parse_resume(context["resume_text"])
    if task == "score_candidate":
        return _score(context["hr"], context["parsed"])
    if task == "compose_email":
        return _compose_email(context["ctx"])
    if task == "screening_questions":
        return _screening_questions(context["hr"], context["parsed"])
    if task == "evaluate_screening":
        return _evaluate_screening(context["hr"], context["transcript"])
    if task == "generate_document":
        return _document(context["doc_type"], context["ctx"])
    if task == "generate_onboarding":
        return _onboarding(context["ctx"])
    return {}
