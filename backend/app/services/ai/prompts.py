"""Prompt builders. Each returns (system, user) and specifies the exact JSON schema
we expect back, so any capable model produces parseable output."""
from __future__ import annotations

import json
from typing import Any

_SYSTEM = (
    "You are an expert technical recruiter and hiring strategist working inside an "
    "AI-native ATS. You are precise, unbiased, and you NEVER fabricate candidate facts. "
    "Always respond with a single valid JSON object and nothing else — no prose, no "
    "markdown fences."
)


def hiring_request(hr: dict[str, Any]) -> tuple[str, str]:
    user = f"""Analyze this hiring request and return JSON with this exact shape:
{{
  "summary": "<2-3 sentence summary of the role and what it takes to fill it>",
  "validation": {{
     "issues": ["<missing or weak fields>"],
     "inconsistencies": ["<contradictions, e.g. senior title but junior budget>"]
  }},
  "difficulty_score": <0-100 integer, higher = harder to hire>,
  "difficulty_label": "<easy|moderate|hard|very hard>",
  "est_time_to_hire_days": <integer>,
  "suggested_salary": {{"min": <number>, "max": <number>, "currency": "<e.g. INR>", "note": "<why>"}},
  "hiring_plan": ["<ordered, concrete steps to fill this role>"]
}}

Hiring request:
{json.dumps(hr, indent=2, default=str)}"""
    return _SYSTEM, user


def suggest_skills(payload: dict[str, Any]) -> tuple[str, str]:
    user = f"""For the role below, list the hard skills a recruiter would typically screen for.
Return JSON with this exact shape:
{{
  "mandatory_skills": ["<6-10 core must-have skills/technologies for this exact role>"],
  "preferred_skills": ["<5-8 nice-to-have skills that strengthen a candidate>"]
}}
Rules: short skill names (1-3 words), no duplicates, NO overlap between the two lists,
tailor depth to the experience range (more foundational for juniors, leadership/architecture
for seniors). Skills/tools only — not responsibilities or soft fluff unless genuinely required.

Role:
{json.dumps(payload, indent=2, default=str)}"""
    return _SYSTEM, user


def assessment_email(ctx: dict[str, Any]) -> tuple[str, str]:
    user = f"""Write a short, warm, professional email inviting a candidate to complete an assessment.
Return JSON: {{"subject": "<concise subject>", "body": "<plain-text email, 90-140 words>"}}
Requirements: address the candidate as the LITERAL placeholder {{name}} (do not invent a name, keep
"{{name}}" verbatim so it can be personalized); name the assessment and include the access link EXACTLY
as given; mention the role; be encouraging and clear about the next step; sign off as the sender + company.

Assessment: {ctx.get('assessment_name', '')}
Access link: {ctx.get('link', '')}
Role: {ctx.get('role', '')}
Company: {ctx.get('company', '')}
Sender: {ctx.get('sender', '')}
Notes/instructions: {ctx.get('description', '')}"""
    return _SYSTEM, user


def video_interview_questions(role: dict[str, Any]) -> tuple[str, str]:
    """Generate questions for a one-way async VIDEO interview (candidate speaks to camera)."""
    jd = role.get("jd") or {}
    system = (
        "You write questions for a one-way ASYNC VIDEO interview where the candidate speaks their "
        "answer to camera (no interviewer present). Each question must be open-ended, answerable "
        "verbally in 1-2 minutes, and tailored to the role. Avoid yes/no questions and anything that "
        "needs a whiteboard, code editor, or shared screen. "
        'Return ONLY JSON: {"questions": ["...", "..."]} with 4 to 6 questions.'
    )
    user = (
        f"Role: {role.get('position', '')}\n"
        f"Department: {role.get('department', '')}\n"
        f"Must-have skills: {', '.join(role.get('mandatory_skills') or [])}\n"
        f"Nice-to-have skills: {', '.join(role.get('preferred_skills') or [])}\n"
        f"JD title: {jd.get('title', '')}\n"
        f"Key responsibilities: {', '.join((jd.get('responsibilities') or [])[:6])}\n"
        f"Key requirements: {', '.join((jd.get('requirements') or [])[:6])}\n\n"
        "Write 4-6 spoken-answer video interview questions tailored to this role."
    )
    return system, user


def job_description(hr: dict[str, Any]) -> tuple[str, str]:
    from ...config import settings

    company_ctx = (
        f'The hiring company is "{settings.COMPANY_NAME}". '
        f'Use THIS for "company_description" (lightly edited to fit, do not invent other facts): '
        f'{settings.COMPANY_ABOUT}\n\n' if settings.COMPANY_ABOUT else ""
    )
    user = f"""{company_ctx}Write a complete, modern job posting. Return JSON with this exact shape:
{{
  "title": "<clean role title>",
  "seo_title": "<search-optimized title>",
  "description": "<engaging markdown overview, 2-3 paragraphs>",
  "responsibilities": ["<bullet>", "..."],
  "requirements": ["<bullet>", "..."],
  "company_description": "<short company blurb>",
  "benefits": ["<bullet>", "..."],
  "culture": "<short culture paragraph>",
  "linkedin_copy": "<punchy LinkedIn post version>",
  "naukri_copy": "<Naukri/Indeed-optimized version>",
  "social_copy": "<1-2 line social hiring hook>",
  "screening_questions": ["<question>", "..."],
  "knockout_questions": ["<hard yes/no disqualifier question>", "..."],
  "interview_rubric": [{{"area": "<skill area>", "what_to_assess": "<...>", "weight": <0-1>}}]
}}

Base it on this hiring request:
{json.dumps(hr, indent=2, default=str)}"""
    return _SYSTEM, user


def parse_resume(resume_text: str) -> tuple[str, str]:
    user = f"""Extract structured data from the resume below. Use ONLY information present
in the text — do not invent anything. Return JSON with this exact shape:
{{
  "name": "<or empty>",
  "email": "<or empty>",
  "phone": "<or empty>",
  "location": "<city/location, or empty>",
  "linkedin": "<LinkedIn profile URL, or empty>",
  "github": "<GitHub profile URL, or empty>",
  "skills": ["<skill>", "..."],
  "total_yoe": <number, best estimate>,
  "current_company": "<most recent employer, or empty>",
  "current_title": "<most recent job title, or empty>",
  "companies": [{{"name": "<...>", "title": "<...>", "duration": "<...>"}}],
  "education": [{{"degree": "<...>", "institution": "<...>", "year": "<...>"}}],
  "certifications": ["<...>"],
  "projects": ["<short project name/desc>"],
  "achievements": ["<...>"],
  "gaps": ["<noticeable employment gaps, or empty>"],
  "current_ctc": "<current salary if stated, or empty>",
  "salary_expectation": "<expected salary if stated, or empty>",
  "notice_period": "<or empty>",
  "summary": "<3-4 sentence neutral summary of the candidate>"
}}

Resume:
\"\"\"{resume_text[:8000]}\"\"\""""
    return _SYSTEM, user


def screening_questions(role: dict[str, Any], parsed: dict[str, Any]) -> tuple[str, str]:
    jd = role.get("jd") or {}
    has_jd = any(jd.get(k) for k in ("description", "responsibilities", "requirements"))
    jd_instr = (
        "Base the questions on the JOB DESCRIPTION below — probe the specific responsibilities "
        "and requirements it lists (not just the skill keywords), and tailor them to where the "
        "candidate's background meets or falls short of the JD.\n\n"
        if has_jd else ""
    )
    user = f"""Design a short AI screening interview (5 questions) for this role. {jd_instr}Mix one
warm opener, 2-3 role/skill-specific questions grounded in the job description and the
candidate's background, and one behavioral question. Keep each question to one sentence and
make them concrete to THIS role — avoid generic questions that could apply to any job.
Return JSON:
{{"questions": ["<q1>", "<q2>", "<q3>", "<q4>", "<q5>"]}}

ROLE:
{json.dumps(role, indent=2, default=str)}

CANDIDATE (parsed resume):
{json.dumps(parsed, indent=2, default=str)}"""
    return _SYSTEM, user


def evaluate_screening(role: dict[str, Any], transcript: list[dict[str, Any]]) -> tuple[str, str]:
    user = f"""Evaluate this screening interview transcript fairly, citing evidence from the
answers. Scores are 0-100. Return JSON with this exact shape:
{{
  "scores": {{
     "communication": <0-100>,
     "technical_depth": <0-100>,
     "confidence": <0-100>,
     "clarity": <0-100>,
     "overall": <0-100>
  }},
  "summary": "<3-4 sentence neutral summary of how the candidate did>",
  "strengths": ["<...>"],
  "concerns": ["<...>"],
  "per_question": [
     {{"rating": <0-100 for THIS answer>, "strengths": ["<what was strong in this specific answer>"], "gaps": ["<what was weak or missing in this specific answer>"]}}
  ],
  "recommendation": "<advance|hold|reject>"
}}

`per_question` MUST have exactly one entry per transcript question, in the SAME ORDER. Rate each
answer on its own merit, citing evidence; give 1-2 concrete strengths and 1-2 concrete gaps each
(use an empty list if there genuinely are none).

ROLE: {json.dumps(role, default=str)}

TRANSCRIPT:
{json.dumps(transcript, indent=2, default=str)}"""
    return _SYSTEM, user


def evaluate_video(
    role: dict[str, Any], questions: list[str], transcript: str, timeline: list[dict[str, Any]]
) -> tuple[str, str]:
    """Segment a single continuous video-interview transcript into per-question answers, rate
    each, and give an overall fit verdict. The transcript is one block of speech (the candidate
    answered each question aloud in order); `timeline` lists when each question was asked, so use
    the question ORDER to split the transcript into the answer that follows each one."""
    n = len(questions)
    qlist = "\n".join(f"{i}. {q}" for i, q in enumerate(questions))
    user = f"""You are reviewing a recorded one-way video interview. The candidate was asked the
{n} questions below, in order, and answered each one aloud. You are given the full continuous
transcript of their speech and the question timeline. Split the transcript into the answer that
follows each question (in order), then judge each answer and the interview overall. Quote/lightly
clean the candidate's own words for each answer — do NOT invent content; if an answer is missing
or off-topic, say so and rate it low. Ratings are 0-100.

Return JSON with this EXACT shape:
{{
  "per_question": [
     {{"q_index": <0-based question number>,
       "question": "<the question text>",
       "answer": "<the candidate's answer to THIS question, extracted from the transcript (verbatim or lightly cleaned)>",
       "rating": <0-100 for this answer>,
       "comment": "<1-2 sentence assessment of this answer, citing what they said>"}}
  ],
  "verdict": "<fit|maybe|unfit>",
  "reasoning": "<3-5 sentences justifying the verdict with concrete evidence from the answers>",
  "strengths": ["<specific strength shown across the interview>", "..."],
  "gaps": ["<specific gap, risk, or concern>", "..."],
  "summary": "<2-3 sentence neutral overview of how the candidate came across>",
  "scores": {{"communication": <0-100>, "technical_depth": <0-100>, "confidence": <0-100>, "overall": <0-100>}}
}}

`per_question` MUST have exactly {n} entries, one per question, in order (q_index 0..{n - 1}).
`verdict` MUST be exactly one of: fit, maybe, unfit. Give 1-3 concrete strengths and 1-3 concrete
gaps (use an empty list only if there genuinely are none). Be fair, evidence-based, and unbiased.

ROLE: {json.dumps(role, default=str)}

QUESTIONS (in order):
{qlist}

QUESTION TIMELINE (seconds into the recording):
{json.dumps(timeline, default=str)}

CONTINUOUS TRANSCRIPT:
{transcript[:8000]}"""
    return _SYSTEM, user


_DOC_INTENT = {
    "offer_letter": "a warm but formal employment offer letter",
    "employment_agreement": "a standard full-time employment agreement",
    "nda": "a mutual non-disclosure agreement (NDA)",
    "contractor_agreement": "an independent contractor services agreement",
}


def generate_document(doc_type: str, ctx: dict[str, Any]) -> tuple[str, str]:
    intent = _DOC_INTENT.get(doc_type, "an employment document")
    user = f"""Draft {intent} as a clean, professional document in MARKDOWN.
Use the details provided; where a detail is missing, insert a clearly bracketed placeholder
like [START DATE]. Include the usual sections for this document type (parties, role,
compensation, confidentiality/IP where relevant, term, termination, governing law).
This is a DRAFT TEMPLATE, not legal advice. Return JSON:
{{"title": "<document title>", "content": "<full markdown document>"}}

Details:
{json.dumps(ctx, indent=2, default=str)}"""
    return _SYSTEM, user


def generate_onboarding(ctx: dict[str, Any]) -> tuple[str, str]:
    user = f"""Create a practical 30-day onboarding plan for this new hire. Return JSON:
{{
  "tasks": [{{"title": "<task>", "category": "<IT|HR|Team|Learning|Compliance>", "owner": "<role responsible>"}}],
  "induction": [{{"day": "Day 1", "items": ["<item>", "..."]}}, {{"day": "Week 1", "items": [...]}}, {{"day": "Month 1", "items": [...]}}],
  "tools": ["<tool/account to provision>", "..."],
  "buddy": "<suggested buddy/mentor role>"
}}
Make tasks specific to the role. 8-14 tasks total.

New hire / role:
{json.dumps(ctx, indent=2, default=str)}"""
    return _SYSTEM, user


def compose_email(template: str, ctx: dict[str, Any]) -> tuple[str, str]:
    intent = {
        "acknowledgment": "acknowledge their application warmly and set expectations",
        "shortlisted": "tell them they've been shortlisted and that next steps are coming",
        "interview_invite": "invite them to interview and ask for availability",
        "rejection": "respectfully decline, kindly and without specifics that invite dispute",
        "offer": "congratulate them and say a formal offer is on the way",
    }.get(template, "write a professional recruiting email")
    user = f"""Write a concise, warm, professional recruiting email to {ctx.get('name') or 'the candidate'}
for the role "{ctx.get('role') or 'the role'}" at {ctx.get('company')}. Intent: {intent}.
Sign off as {ctx.get('sender')}. Keep it under 140 words, no placeholders.
Return JSON: {{"subject": "<subject>", "body": "<plain-text body with line breaks>"}}"""
    return _SYSTEM, user


def score_candidate(hr: dict[str, Any], parsed: dict[str, Any]) -> tuple[str, str]:
    user = f"""Score how well this candidate fits the role. Be fair and evidence-based;
cite reasons from the resume. Each dimension is 0-100. Return JSON with this exact shape:
{{
  "dimensions": {{
     "skill_match": <0-100>,
     "experience_match": <0-100>,
     "domain_relevance": <0-100>,
     "communication": <0-100>,
     "leadership": <0-100>,
     "culture_fit": <0-100>,
     "growth_potential": <0-100>,
     "salary_fit": <0-100>,
     "stability": <0-100>
  }},
  "rationale": "<3-5 sentences explaining the scores, with evidence>",
  "strengths": ["<...>"],
  "concerns": ["<...>"],
  "recommendation": "<strong_yes|yes|maybe|no>",
  "fit_label": "<excellent|good|average|weak>"
}}

ROLE:
{json.dumps(hr, indent=2, default=str)}

CANDIDATE (parsed resume):
{json.dumps(parsed, indent=2, default=str)}"""
    return _SYSTEM, user
