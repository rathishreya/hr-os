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
    from .. import skill_normalize

    # Synonym/abbreviation-aware matching (so "recruiting" credits a "hiring" requirement),
    # shared with the scoring engine so the chips, the skill dimension, and this rationale agree.
    rep = skill_normalize.match_report(
        parsed.get("skills", []), hr.get("mandatory_skills", []), hr.get("preferred_skills", [])
    )
    n_mand = len(rep["mandatory_canon"])
    n_pref = len(rep["preferred_canon"])
    n_matched = len(rep["matched_canon"])
    skill_match = 0.0
    if n_mand:
        skill_match = 100 * n_matched / n_mand
        if n_pref:
            skill_match = _clamp(skill_match + 10 * len(rep["matched_pref_canon"]) / n_pref)

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
            f"Matched {n_matched}/{n_mand} mandatory skills "
            f"(~{round(skill_match)}%). Experience {yoe:g} yrs vs required {ymin:g}-{ymax:g} "
            f"(~{round(exp_match)}% fit). Soft dimensions are heuristic defaults — confirm in interview."
        ),
        "strengths": sorted(set(rep["matched_canon"]) | set(rep["matched_pref_canon"]))[:5] or ["See resume"],
        "concerns": [f"Missing: {s}" for s in sorted(rep["missing_canon"])[:5]],
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
    role = hr.get("position") or "this role"
    skills = (hr.get("mandatory_skills") or [])[:2] or (parsed.get("skills") or [])[:2]
    jd = hr.get("jd") or {}

    def _clip(s: str) -> str:  # trim a JD line to a short, quotable phrase
        return " ".join(str(s).split()[:14]).rstrip(".")

    def _lines(key):
        return [x for x in (jd.get(key) or []) if isinstance(x, str) and x.strip()]

    jd_qs = _lines("screening_questions")
    resp = _lines("responsibilities")
    reqs = _lines("requirements")

    # Two "middle" questions grounded in the JD when we have one; otherwise skill-based.
    middle: list[str] = list(jd_qs[:2])
    if len(middle) < 2 and resp:
        middle.append(f'One key responsibility is "{_clip(resp[0])}". Tell me about your hands-on experience with that.')
    if len(middle) < 2 and reqs:
        middle.append(f'The role asks for "{_clip(reqs[0])}". How do you meet that?')
    generics = [
        f"Tell me about a recent project where you used {skills[0] if skills else 'your core skills'}.",
        (f"How would you approach a problem involving {skills[1]}?" if len(skills) > 1
         else "Walk me through how you debug a tricky issue."),
    ]
    gi = 0
    while len(middle) < 2:
        middle.append(generics[gi % len(generics)]); gi += 1

    qs = [
        f"To start, what attracted you to the {role} role?",
        *middle[:2],
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

    mand = hr.get("mandatory_skills") or []
    per_question = []
    for t in transcript:
        ans = (t.get("a") or "").strip()
        words = len(ans.split())
        low = ans.lower()
        hits = sorted({s for s in mand if s and s.lower() in low})
        rating = round(_clamp(35 + words * 2.2 + 8 * len(hits)))
        strengths, gaps = [], []
        if words >= 30:
            strengths.append("Thorough, detailed answer")
        elif words >= 15:
            strengths.append("Clear and on-point")
        if hits:
            strengths.append("Referenced relevant skills: " + ", ".join(hits[:3]))
        if not ans:
            gaps.append("No answer given")
        elif words < 12:
            gaps.append("Brief — limited detail or examples")
        if mand and not hits:
            gaps.append("Didn't tie the answer to the role's key skills")
        if not strengths:
            strengths.append("Answered the question")
        per_question.append({"rating": rating, "strengths": strengths, "gaps": gaps})

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
        "per_question": per_question,
        "recommendation": rec,
    }


def _split_answers(questions: list, transcript: str, timeline: list) -> list[str]:
    """Heuristically split a single continuous transcript into one answer per question. Uses the
    question timeline (start times) to allocate words proportional to the time spent on each
    question; falls back to an even split when the timing isn't usable. Never raises."""
    n = len(questions)
    if n == 0:
        return []
    words = (transcript or "").split()
    if not words:
        return ["" for _ in range(n)]

    starts: list[float | None] = [None] * n
    for t in timeline or []:
        if isinstance(t, dict):
            qi, at = t.get("q_index"), t.get("at")
            if isinstance(qi, int) and 0 <= qi < n and isinstance(at, (int, float)):
                starts[qi] = float(at)

    increasing = all(starts[i] is not None and starts[i + 1] is not None and starts[i] < starts[i + 1]
                     for i in range(n - 1))
    w_count = len(words)
    if n > 1 and increasing:
        gaps = [starts[i + 1] - starts[i] for i in range(n - 1)]
        windows = gaps + [sum(gaps) / len(gaps)]   # last question gets the average window
        total = sum(windows) or 1.0
        bounds, acc = [0], 0.0
        for w in windows:
            acc += w
            bounds.append(round(w_count * acc / total))
    else:
        per = w_count / n
        bounds = [round(i * per) for i in range(n)] + [w_count]
    bounds[-1] = w_count
    # Guarantee every question gets at least one word when there are enough to go around, so a
    # candidate who answered them all is never shown a falsely "unanswered" question just because
    # one answer ran long (time spent ≠ word count, and rounding can otherwise collapse a slice).
    if w_count >= n:
        for i in range(1, n):
            bounds[i] = max(bounds[i - 1] + 1, min(bounds[i], w_count - (n - i)))

    return [" ".join(words[bounds[i]:bounds[i + 1]]).strip() for i in range(n)]


def _evaluate_video(
    role: dict[str, Any], questions: list, transcript: str, timeline: list
) -> dict[str, Any]:
    questions = [str(q) for q in (questions or [])]
    answers = _split_answers(questions, transcript, timeline)
    mand = [s for s in (role.get("mandatory_skills") or []) if s]

    per_question, ratings = [], []
    for i, q in enumerate(questions):
        ans = answers[i] if i < len(answers) else ""
        words = len(ans.split())
        low = ans.lower()
        hits = sorted({s for s in mand if s.lower() in low})
        rating = 0 if not ans else round(_clamp(35 + words * 2.0 + 8 * len(hits)))
        ratings.append(rating)
        comment = (
            "No discernible answer to this question in the transcript."
            if not ans
            else f"Answered in ~{words} words" + (f", referencing {', '.join(hits[:3])}." if hits else ".")
        )
        per_question.append({"q_index": i, "question": q, "answer": ans, "rating": rating, "comment": comment})

    overall = round(sum(ratings) / len(ratings)) if ratings else 0
    verdict = "fit" if overall >= 65 else "maybe" if overall >= 45 else "unfit"

    answered = [a for a in answers if a]
    avg_len = sum(len(a.split()) for a in answered) / len(answered) if answered else 0
    covered = sorted({s for s in mand if s.lower() in " ".join(answers).lower()})

    strengths, gaps = [], []
    if avg_len >= 40:
        strengths.append("Gave detailed, substantive answers")
    elif avg_len >= 20:
        strengths.append("Clear, on-point answers")
    if covered:
        strengths.append("Referenced required skills: " + ", ".join(covered[:4]))
    if questions and len(answered) == len(questions):
        strengths.append("Engaged with every question")
    if not strengths:
        strengths.append("Completed the interview")
    if len(answered) < len(questions):
        gaps.append(f"Left {len(questions) - len(answered)} question(s) effectively unanswered")
    if avg_len and avg_len < 15:
        gaps.append("Answers were brief — limited depth or examples")
    if mand and not covered:
        gaps.append("Didn't tie answers to the role's required skills")

    return {
        "per_question": per_question,
        "verdict": verdict,
        "reasoning": (
            f"Heuristic assessment: averaged {overall}/100 across {len(questions)} answers "
            f"(~{round(avg_len)} words each), referencing {len(covered)}/{len(mand) or 0} required skills. "
            "This is a rule-based estimate — confirm depth in a live round."
        ),
        "strengths": strengths,
        "gaps": gaps,
        "summary": (
            f"Candidate completed the video interview, answering {len(answered)} of {len(questions)} "
            f"questions with ~{round(avg_len)} words each."
        ),
        "scores": {
            "communication": round(_clamp(40 + avg_len * 1.5)),
            "technical_depth": round(_clamp(35 + 60 * (len(covered) / (len(mand) or 1)) + avg_len * 0.5)),
            "confidence": round(_clamp(45 + avg_len * 1.2)),
            "overall": overall,
        },
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


# Deterministic role -> skills knowledge base for the offline/no-key skill suggester.
# Each entry: (position/department keywords, mandatory core skills, preferred nice-to-haves).
# A role matches if ANY keyword is a substring of "<position> <department>"; all matches union.
_ROLE_SKILLS: list[tuple[tuple[str, ...], list[str], list[str]]] = [
    (("backend", "back end", "back-end", "server side", "server-side"),
     ["data structures", "algorithms", "sql", "rest api", "git"],
     ["docker", "microservices", "redis", "ci/cd", "aws"]),
    (("frontend", "front end", "front-end", "ui engineer", "ui developer"),
     ["javascript", "html", "css", "react"],
     ["typescript", "redux", "tailwind", "testing", "webpack"]),
    (("full stack", "fullstack", "full-stack"),
     ["javascript", "react", "node", "sql", "rest api"],
     ["typescript", "docker", "aws", "graphql", "ci/cd"]),
    (("django", "fastapi", "flask", "python developer", "python engineer"),
     ["python", "sql", "rest api", "git"],
     ["docker", "aws", "celery", "redis"]),
    (("golang", "go developer", "go engineer"),
     ["go", "data structures", "sql", "git"],
     ["microservices", "docker", "kubernetes", "grpc"]),
    (("ruby", "rails"),
     ["ruby", "ruby on rails", "sql", "git"],
     ["rspec", "docker", "aws"]),
    (("php", "laravel"),
     ["php", "sql", "rest api", "git"],
     ["laravel", "mysql", "docker"]),
    ((".net", "c# developer", "dotnet", "asp.net"),
     ["c#", ".net", "sql", "data structures"],
     ["azure", "microservices", "docker"]),
    (("spring", "java developer", "java engineer", "core java"),
     ["java", "spring", "sql", "data structures"],
     ["microservices", "kafka", "docker", "aws"]),
    (("android",), ["kotlin", "java", "android"], ["jetpack compose", "rest api", "git"]),
    (("ios ", "ios developer", "iphone"), ["swift", "ios", "xcode"], ["swiftui", "rest api", "git"]),
    (("mobile", "react native", "flutter"),
     ["mobile development", "rest api", "git"],
     ["react native", "flutter", "kotlin", "swift"]),
    (("devops", "site reliability", "sre", "platform engineer", "infrastructure"),
     ["linux", "docker", "kubernetes", "ci/cd", "aws"],
     ["terraform", "ansible", "monitoring", "python", "networking"]),
    (("data scientist", "data science", "machine learning", "ml engineer", "ai engineer", "ai/ml"),
     ["python", "machine learning", "statistics", "sql", "pandas"],
     ["deep learning", "nlp", "tensorflow", "pytorch", "data visualization"]),
    (("data engineer", "data engineering"),
     ["python", "sql", "etl", "data warehousing", "spark"],
     ["airflow", "kafka", "aws", "snowflake", "dbt"]),
    (("data analyst", "business intelligence", "bi analyst", "analytics"),
     ["sql", "excel", "data visualization", "statistics"],
     ["python", "tableau", "power bi", "a/b testing"]),
    (("qa", "quality assurance", "test engineer", "sdet", "tester", "automation engineer"),
     ["test automation", "selenium", "manual testing", "test cases"],
     ["api testing", "ci/cd", "performance testing", "python"]),
    (("security", "infosec", "cybersecurity", "cyber security", "soc analyst"),
     ["network security", "vulnerability assessment", "siem", "incident response"],
     ["penetration testing", "python", "cloud security", "compliance"]),
    (("product manager", "product management", "product owner"),
     ["product management", "roadmapping", "stakeholder management", "analytics"],
     ["sql", "a/b testing", "agile", "user research", "wireframing"]),
    (("project manager", "program manager", "delivery manager", "scrum master"),
     ["project management", "agile", "scrum", "stakeholder management"],
     ["jira", "risk management", "budgeting", "pmp"]),
    (("designer", "ux", "ui/ux", "user experience", "product design"),
     ["figma", "ux design", "wireframing", "prototyping"],
     ["user research", "design systems", "interaction design", "usability testing"]),
    (("graphic", "visual design", "motion design"),
     ["graphic design", "adobe photoshop", "adobe illustrator", "typography"],
     ["branding", "figma", "motion graphics"]),
    (("marketing", "growth", "seo specialist"),
     ["digital marketing", "seo", "content marketing", "analytics"],
     ["google ads", "social media marketing", "email marketing", "copywriting"]),
    (("sales", "business development", "account executive", "inside sales"),
     ["sales", "lead generation", "negotiation", "crm"],
     ["salesforce", "cold calling", "account management", "pipeline management"]),
    (("recruit", "talent acquisition", "sourcer", "hr "),
     ["recruiting", "sourcing", "interviewing", "applicant tracking system"],
     ["boolean search", "employer branding", "stakeholder management", "linkedin recruiter"]),
    (("human resource", "people operations", "people ops", "hrbp", "hr generalist"),
     ["hr operations", "employee relations", "onboarding", "performance management"],
     ["hris", "payroll", "compensation and benefits", "labour law"]),
    (("finance", "financial analyst", "fp&a", "fpa"),
     ["financial analysis", "excel", "financial modeling", "accounting"],
     ["sql", "power bi", "forecasting", "sap"]),
    (("accountant", "accounting", "bookkeep"),
     ["accounting", "bookkeeping", "excel", "taxation"],
     ["tally", "quickbooks", "gst", "auditing"]),
    (("content writer", "copywriter", "content strategist", "technical writer"),
     ["content writing", "copywriting", "seo", "editing"],
     ["content strategy", "wordpress", "social media", "research"]),
    (("customer success", "customer support", "account manager", "client success"),
     ["customer success", "communication", "crm", "account management"],
     ["upselling", "saas", "onboarding", "zendesk"]),
]

# Whole-word language detection (token match avoids "go" matching inside "django").
# "golang" is omitted — the ("golang", ...) role entry already maps it to canonical "go".
_LANGS = {
    "python", "java", "javascript", "typescript", "go", "ruby", "php", "c++",
    "c#", "kotlin", "swift", "scala", "rust", "perl",
}


def _dedupe_keep(seq: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for s in seq:
        k = str(s).strip().lower()
        if k and k not in seen:
            seen.add(k)
            out.append(str(s).strip())
    return out


def _suggest_skills(payload: dict[str, Any]) -> dict[str, Any]:
    text = f"{payload.get('position', '')} {payload.get('department', '')}".lower()
    mandatory: list[str] = []
    preferred: list[str] = []
    for keywords, mand, pref in _ROLE_SKILLS:
        if any(k in text for k in keywords):
            mandatory += mand
            preferred += pref
    # Fold in any explicitly-named language (whole-word) from the title.
    words = set(re.findall(r"[a-z0-9+#]+", text))
    mandatory += [w for w in _LANGS if w in words]

    if not mandatory and not preferred:  # unknown role — safe generic baseline
        mandatory = ["communication", "problem solving", "teamwork"]
        preferred = ["leadership", "time management"]

    mandatory = _dedupe_keep(mandatory)
    mset = {s.lower() for s in mandatory}
    preferred = [s for s in _dedupe_keep(preferred) if s.lower() not in mset]

    # Seniority nudge: senior roles value architecture/leadership.
    yoe = max(float(payload.get("yoe_max") or 0), float(payload.get("yoe_min") or 0))
    if yoe >= 6:
        for s in ("system design", "mentoring", "leadership"):
            if s.lower() not in mset and s not in preferred:
                preferred.append(s)

    return {"mandatory_skills": mandatory[:10], "preferred_skills": preferred[:8]}


def _assessment_email(ctx: dict[str, Any]) -> dict[str, Any]:
    role = ctx.get("role") or "the role"
    company = ctx.get("company") or "our team"
    sender = ctx.get("sender") or "the hiring team"
    aname = ctx.get("assessment_name") or "a short assessment"
    link = ctx.get("link") or ""
    desc = (ctx.get("description") or "").strip()
    subject = f"{aname} — next step for the {role}"
    body = (
        f"Hi {{name}},\n\n"
        f"Thanks for your interest in the {role} role at {company}. As the next step, we'd like you to "
        f"complete {aname}.\n\n"
        f"You can access it here: {link}\n\n"
        + (f"{desc}\n\n" if desc else "")
        + "Please complete it at your convenience and reply to this email once you're done — and let us "
        "know if you have any questions.\n\n"
        f"Best regards,\n{sender}\n{company}"
    )
    return {"subject": subject, "body": body}


def _video_questions(role: dict[str, Any]) -> dict[str, Any]:
    pos = role.get("position") or "this role"
    skills = [s for s in (role.get("mandatory_skills") or []) if s][:2]
    qs = [
        f"Tell us about yourself and why you're interested in the {pos} role.",
        "Walk us through a project or accomplishment you're most proud of.",
    ]
    if skills:
        qs.append(f"Describe your hands-on experience with {', '.join(skills)}.")
    qs.append("Tell us about a challenging problem you faced and how you worked through it.")
    qs.append("What are you looking for in your next role, and where do you want to grow?")
    return {"questions": qs[:6]}


def run(task: str, context: dict[str, Any]) -> dict[str, Any]:
    if task == "validate_hiring_request":
        return _validate(context["hr"])
    if task == "suggest_skills":
        return _suggest_skills(context["payload"])
    if task == "generate_video_questions":
        return _video_questions(context["role"])
    if task == "assessment_email":
        return _assessment_email(context["ctx"])
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
    if task == "evaluate_video":
        return _evaluate_video(context["role"], context["questions"], context["transcript"], context["timeline"])
    if task == "generate_document":
        return _document(context["doc_type"], context["ctx"])
    if task == "generate_onboarding":
        return _onboarding(context["ctx"])
    return {}
