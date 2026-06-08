"""Heuristic resume parsing — fills talent-pool columns from raw resume text."""
from __future__ import annotations

import re
from typing import Any

_SKILL_HINTS = [
    "python", "java", "javascript", "typescript", "react", "node", "fastapi", "django",
    "flask", "sql", "postgresql", "mysql", "mongodb", "redis", "aws", "gcp", "azure",
    "docker", "kubernetes", "terraform", "go", "rust", "c++", "c#", "kotlin", "swift",
    "graphql", "rest", "kafka", "spark", "airflow", "pytorch", "tensorflow", "machine learning",
    "nlp", "llm", "langchain", "tailwind", "next.js", "vue", "angular", "git", "ci/cd",
    "microservices", "pandas", "numpy", "scikit-learn", "matplotlib", "tableau", "power bi",
    "excel", "r ", "data science", "deep learning",
]

_SECTION_MARKERS = {
    "summary": ("professional summary", "summary", "profile", "objective", "about me"),
    "skills": ("technical skills", "skills", "core competencies", "technologies"),
    "experience": (
        "experience", "work experience", "employment", "internship experience",
        "professional experience", "career",
    ),
    "education": ("education", "academic", "qualification"),
    "projects": ("projects", "personal projects"),
    "certifications": ("certifications", "certificates"),
    "achievements": ("achievements", "awards", "honors"),
}

_LOCATION_RE = re.compile(
    r"(?:location|based in|city)[:\s]*([A-Za-z][A-Za-z\s,.-]{2,40})",
    re.IGNORECASE,
)
_CITY_RE = re.compile(
    r"\b(Delhi|Bengaluru|Bangalore|Mumbai|Hyderabad|Chennai|Pune|Gurugram|Gurgaon|Noida|"
    r"Kolkata|India|Remote)\b[^,\n]{0,30}",
    re.IGNORECASE,
)
_CTC_CURRENT_RE = re.compile(
    r"current(?:\s+ctc|\s+salary)?[:\s]*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(lpa|lac|lakh|lakhs|cr|crore)?",
    re.IGNORECASE,
)
_CTC_EXPECTED_RE = re.compile(
    r"(?:expected|desired)(?:\s+ctc|\s+salary)?[:\s]*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(lpa|lac|lakh|lakhs|cr|crore)?",
    re.IGNORECASE,
)
_CTC_RUPEE_RE = re.compile(r"₹\s*([\d,]+(?:\.\d+)?)")
_NOTICE_RE = re.compile(r"notice\s+period[:\s]*([^\n.]{2,40})", re.IGNORECASE)


def _norm_money(num: str, unit: str = "") -> str:
    try:
        val = float(num.replace(",", ""))
    except ValueError:
        return num
    u = (unit or "").lower()
    if u in ("lpa", "lac", "lakh", "lakhs"):
        if val < 100:
            return f"₹{val:g} LPA"
        return f"₹{val:,.0f}"
    if u in ("cr", "crore"):
        return f"₹{val:g} Cr"
    if val >= 100000:
        return f"₹{val:,.0f}"
    if val >= 1000:
        return f"₹{val/100000:g} LPA" if val < 10000000 else f"₹{val:,.0f}"
    return f"₹{val:g} LPA"


def _years_from_text(text: str) -> float:
    matches = re.findall(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years|yrs|year)", text, re.IGNORECASE)
    nums = [float(m) for m in matches]
    if nums:
        return max(nums)
    exp_match = re.search(r"experience\s*\(?\s*yrs?\s*\)?[:\s]*(\d+(?:\.\d+)?)", text, re.IGNORECASE)
    if exp_match:
        return float(exp_match.group(1))
    return 0.0


def _detect_skills(text: str) -> list[str]:
    low = text.lower()
    found = []
    for s in _SKILL_HINTS:
        if s.strip() in low or re.search(rf"\b{re.escape(s.strip())}\b", low):
            found.append(s.strip().title() if len(s) > 3 else s.upper())
    # Title-case common short ones
    return sorted(set(found), key=str.lower)


def _is_section_header(line: str) -> str | None:
    low = line.lower().strip().rstrip(":")
    for key, markers in _SECTION_MARKERS.items():
        if low in markers:
            return key
        for m in markers:
            if low == m:
                return key
    return None


def _split_sections(text: str) -> dict[str, list[str]]:
    lines = [ln.strip() for ln in text.splitlines()]
    sections: dict[str, list[str]] = {"header": []}
    current = "header"
    for line in lines:
        if not line:
            continue
        matched = _is_section_header(line)
        if matched:
            current = matched
            sections.setdefault(current, [])
        else:
            sections.setdefault(current, []).append(line)
    return sections


def _extract_name(header_lines: list[str], fallback: str = "") -> str:
    for line in header_lines[:4]:
        if re.search(r"@|linkedin|github|phone|\+91|\d{10}", line, re.I):
            continue
        if len(line) < 3 or len(line) > 60:
            continue
        if re.match(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,4}$", line):
            return line
        if header_lines.index(line) == 0 and not re.search(r"\d{4}|@", line):
            return line
    return fallback


def _extract_location(text: str, header_lines: list[str]) -> str:
    for line in header_lines:
        m = _LOCATION_RE.search(line)
        if m:
            return m.group(1).strip().rstrip("|,")
        loc = re.search(r"location[:\s]*([^|]+)", line, re.I)
        if loc:
            return loc.group(1).strip()
        if "|" in line and re.search(r"india|delhi|gurugram|bangalore|mumbai|pune|hyderabad", line, re.I):
            parts = [p.strip() for p in line.split("|")]
            for p in parts:
                if re.search(r"india|delhi|gurugram|bangalore|mumbai|pune|hyderabad|chennai|noida", p, re.I):
                    return re.sub(r"^(email|phone|location)[:\s]*", "", p, flags=re.I).strip()
    m = _CITY_RE.search(text[:800])
    return m.group(0).strip().rstrip(",") if m else ""


def _extract_compensation(text: str) -> tuple[str, str]:
    current, expected = "", ""
    m = _CTC_CURRENT_RE.search(text)
    if m:
        current = _norm_money(m.group(1), m.group(2) or "")
    m = _CTC_EXPECTED_RE.search(text)
    if m:
        expected = _norm_money(m.group(1), m.group(2) or "")
    if not current and not expected:
        amounts = _CTC_RUPEE_RE.findall(text)
        if len(amounts) >= 2:
            current = _norm_money(amounts[0])
            expected = _norm_money(amounts[1])
        elif len(amounts) == 1:
            expected = _norm_money(amounts[0])
    # "Expected CTC: 40 LPA" inline
    inline_exp = re.search(r"expected\s+ctc[:\s]*([\d,.]+)\s*(lpa|lac|lakh)?", text, re.I)
    if inline_exp and not expected:
        expected = _norm_money(inline_exp.group(1), inline_exp.group(2) or "lpa")
    inline_cur = re.search(r"current\s+ctc[:\s]*([\d,.]+)\s*(lpa|lac|lakh)?", text, re.I)
    if inline_cur and not current:
        current = _norm_money(inline_cur.group(1), inline_cur.group(2) or "lpa")
    return current, expected


def _extract_notice(text: str) -> str:
    m = _NOTICE_RE.search(text)
    if m:
        return m.group(1).strip()
    m = re.search(r"notice[:\s]*(\d+\s*(?:days?|months?))", text, re.I)
    return m.group(1).strip() if m else ""


def _normalize_dashes(text: str) -> str:
    text = text.replace("\ufffd", "-")
    return re.sub(r"\s*[\u2013\u2014\u00ad\-]+\s*", " – ", text)


def _parse_job_line(line: str) -> dict[str, str] | None:
    line = _normalize_dashes(re.sub(r"^[\s•\-\*\(cid:\d+\)]+", "", line).strip())
    if len(line) < 8 or len(line) > 120:
        return None
    if re.search(r"\b(passionate|building|strong foundations|aspiring)\b", line, re.I):
        return None
    if len(re.findall(r"\.\s+[A-Z]", line)) >= 2:
        return None
    # "Data Science Intern – XYZ Analytics Pvt. Ltd. (Jan 2025 – Apr 2025)"
    dash = r"[–—\-]"
    m = re.match(
        rf"^(.+?)\s*{dash}\s*(.+?)\s*\(([^)]+)\)\s*$",
        line,
    )
    if m:
        return {"title": m.group(1).strip(), "name": m.group(2).strip(), "duration": m.group(3).strip()}
    # "Acme AI (2021-2025): Lead Data Scientist"
    m = re.match(r"^(.+?)\s*\(([^)]+)\)\s*:\s*(.+)$", line)
    if m:
        return {"name": m.group(1).strip(), "duration": m.group(2).strip(), "title": m.group(3).strip()}
    m = re.match(r"^(.+?)\s+at\s+(.+?)(?:\s*\(([^)]+)\))?$", line, re.I)
    if m:
        return {"title": m.group(1).strip(), "name": m.group(2).strip(), "duration": (m.group(3) or "").strip()}
    if len(line) < 80 and re.search(
        r"\b(intern|engineer|developer|analyst|manager|lead|associate|scientist|consultant)\b",
        line,
        re.I,
    ):
        return {"title": line, "name": "", "duration": ""}
    return None


def _best_company(companies: list[dict[str, str]]) -> dict[str, str]:
    for c in companies:
        if (c.get("name") or "").strip():
            return c
    return companies[0] if companies else {}


def _extract_companies(exp_lines: list[str], full_text: str) -> list[dict[str, str]]:
    companies = []
    for line in exp_lines:
        job = _parse_job_line(line)
        if job:
            companies.append(job)
    if not companies:
        for line in full_text.splitlines():
            if line.strip().startswith("-") or line.strip().startswith("•"):
                job = _parse_job_line(line)
                if job:
                    companies.append(job)
    return companies


def _extract_education(edu_lines: list[str], full_text: str) -> list[dict[str, str]]:
    education = []
    pending_degree = ""
    for line in edu_lines:
        line = line.strip()
        if not line or len(line) < 4:
            continue
        year_m = re.search(r"(\d{4})", line)
        year = year_m.group(1) if year_m else ""
        if pending_degree and re.search(
            r"university|college|institute|\bIIT\b|\bDTU\b|\bNIT\b",
            line,
            re.I,
        ):
            education.append({"degree": pending_degree, "institution": line, "year": year})
            pending_degree = ""
            continue
        if re.search(r"b\.?tech|m\.?tech|mba|bca|mca|b\.?sc|m\.?sc|ph\.?d|bachelor|master", line, re.I):
            if pending_degree:
                education.append({"degree": pending_degree, "institution": "", "year": ""})
            pending_degree = line
        elif pending_degree:
            education.append({"degree": pending_degree, "institution": line, "year": year})
            pending_degree = ""
        elif re.search(r"university|college|institute", line, re.I):
            education.append({"degree": "", "institution": line, "year": year})
        elif re.search(r"cgpa|gpa", line, re.I):
            continue
        else:
            education.append({"degree": "", "institution": line, "year": year})
    if pending_degree:
        education.append({"degree": pending_degree, "institution": "", "year": ""})
    if not education:
        inline = re.search(
            r"education[:\s]*(.+?)(?:\n|certifications|experience|skills|$)",
            full_text,
            re.I | re.S,
        )
        if inline:
            chunk = inline.group(1).strip().split("\n")[0]
            if chunk:
                education.append({"degree": chunk, "institution": "", "year": ""})
    return education


def _build_summary(parsed: dict[str, Any]) -> str:
    parts = []
    yoe = parsed.get("total_yoe")
    if yoe:
        parts.append(f"~{yoe:g} years experience")
    skills = parsed.get("skills") or []
    if skills:
        parts.append(f"skills: {', '.join(skills[:8])}")
    if parsed.get("current_title"):
        parts.append(parsed["current_title"])
    if parsed.get("current_company"):
        parts.append(f"at {parsed['current_company']}")
    if parts:
        return " · ".join(parts)
    return parsed.get("summary") or "Candidate profile from resume."


def parse_resume_text(text: str, *, fallback_name: str = "", fallback_source: str = "direct") -> dict[str, Any]:
    """Extract structured fields from resume plain text."""
    text = (text or "").strip()
    if not text:
        return {}

    sections = _split_sections(text)
    header = sections.get("header", [])
    exp_lines = sections.get("experience", [])
    edu_lines = sections.get("education", [])

    email_m = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
    phone_m = re.search(r"(\+?\d[\d\s-]{8,}\d)", text)
    linkedin_m = re.search(r"(https?://)?(www\.)?linkedin\.com/[^\s)|]+", text, re.I)
    github_m = re.search(r"(https?://)?(www\.)?github\.com/[^\s)|]+", text, re.I)

    current_ctc, salary_expectation = _extract_compensation(text)
    companies = _extract_companies(exp_lines, text)
    education = _extract_education(edu_lines, text)
    co0 = _best_company(companies)

    parsed: dict[str, Any] = {
        "name": _extract_name(header, fallback_name),
        "email": email_m.group(0) if email_m else "",
        "phone": phone_m.group(0).strip() if phone_m else "",
        "location": _extract_location(text, header),
        "linkedin": linkedin_m.group(0) if linkedin_m else "",
        "github": github_m.group(0) if github_m else "",
        "skills": _detect_skills(text),
        "total_yoe": _years_from_text(text),
        "current_company": co0.get("name") or "",
        "current_title": co0.get("title") or "",
        "companies": companies,
        "education": education,
        "certifications": [],
        "projects": [],
        "achievements": [],
        "gaps": [],
        "current_ctc": current_ctc,
        "salary_expectation": salary_expectation,
        "notice_period": _extract_notice(text),
        "sub_source": fallback_source,
        "summary": "",
    }

    summ_lines = sections.get("summary", [])
    if summ_lines:
        parsed["summary"] = " ".join(summ_lines[:4])[:500]
    else:
        parsed["summary"] = _build_summary(parsed)

    return parsed


def _has_value(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, (list, dict)):
        return len(v) > 0
    if isinstance(v, (int, float)):
        return v != 0
    return bool(str(v).strip())


def merge_parsed(ai: dict[str, Any], heur: dict[str, Any]) -> dict[str, Any]:
    """Combine AI JSON with heuristic extraction; prefer non-empty, richer values."""
    out: dict[str, Any] = {}
    keys = set(heur) | set(ai or {})
    for key in keys:
        hv, av = heur.get(key), (ai or {}).get(key)
        if key in ("companies", "education", "skills"):
            out[key] = av if isinstance(av, list) and len(av) >= len(hv or []) else (hv or av or [])
            continue
        if key == "total_yoe":
            out[key] = av if (isinstance(av, (int, float)) and av > 0) else (hv or av or 0)
            continue
        if _has_value(av) and (not _has_value(hv) or len(str(av)) >= len(str(hv))):
            out[key] = av
        else:
            out[key] = hv if _has_value(hv) else av
    if not _has_value(out.get("summary")):
        out["summary"] = _build_summary(out)
    return out


def enrich_from_resume(
    stored_parsed: dict | None,
    resume_text: str,
    *,
    name: str = "",
    email: str = "",
    phone: str = "",
    source: str = "direct",
) -> dict[str, Any]:
    """Merge stored parsed JSON with fresh extraction from resume_text."""
    heur = parse_resume_text(resume_text, fallback_name=name, fallback_source=source)
    merged = merge_parsed(stored_parsed or {}, heur)
    if name:
        merged["name"] = name
    if email:
        merged["email"] = email
    if phone:
        merged["phone"] = phone
    return merged


def table_fields(parsed: dict[str, Any], candidate: Any) -> dict[str, Any]:
    """Flatten parsed resume into talent-pool table columns."""
    edu_list = parsed.get("education") or []
    edu0 = edu_list[0] if edu_list else {}
    companies = parsed.get("companies") or []
    co0 = companies[0] if companies else {}
    return {
        "phone": parsed.get("phone") or getattr(candidate, "phone", "") or "",
        "linkedin": parsed.get("linkedin") or "",
        "github": parsed.get("github") or "",
        "location": parsed.get("location") or "",
        "current_company": parsed.get("current_company") or co0.get("name") or "",
        "current_title": parsed.get("current_title") or co0.get("title") or "",
        "education_degree": edu0.get("degree") or "",
        "education_institution": edu0.get("institution") or "",
        "current_ctc": parsed.get("current_ctc") or "",
        "salary_expectation": parsed.get("salary_expectation") or "",
        "total_yoe": parsed.get("total_yoe") if parsed.get("total_yoe") is not None else None,
        "sub_source": parsed.get("sub_source") or getattr(candidate, "source", "") or "",
        "notice_period": parsed.get("notice_period") or "",
        "skills_preview": parsed.get("skills") or [],
    }
