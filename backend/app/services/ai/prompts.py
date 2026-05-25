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
    user = f"""Design a short AI screening interview (5 questions) for this role. Mix one warm
opener, 2-3 role/skill-specific questions grounded in the candidate's background, and one
behavioral question. Keep each question to one sentence. Return JSON:
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
  "recommendation": "<advance|hold|reject>"
}}

ROLE: {json.dumps(role, default=str)}

TRANSCRIPT:
{json.dumps(transcript, indent=2, default=str)}"""
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
