"""EZ designation master list + best-fit designation suggestion for talent-pool candidates.

Powers the Talent Pool "AI suggested role" column: instead of ranking open job requisitions, we
rank this fixed list of company designations for a candidate — primarily by how well the
candidate's parsed current title matches a designation title, with resume-embedding similarity as
a secondary signal. The list itself also backs the Role dropdown on the frontend (mirrored in
frontend/src/designations.js)."""
from __future__ import annotations

import re
from typing import Any

from . import embeddings

# Auto-generated EZ designation master list (title + primary department/team). Do not hand-edit;
# regenerate from the org designation table if it changes.
DESIGNATIONS: list[dict[str, str]] = [
    {"title": "Account Manager", "dept": "Delivery", "team": "Audio Visual Team"},
    {"title": "Accountant", "dept": "Finance and Accounting", "team": "Accounting"},
    {"title": "AI Software Engineer", "dept": "Technology", "team": "Technology"},
    {"title": "Analyst", "dept": "CEOs Office", "team": "CEOs Office"},
    {"title": "Analyst I", "dept": "CEOs Office", "team": "Product Design"},
    {"title": "Analyst II", "dept": "CEOs Office", "team": "Product Design"},
    {"title": "Analyst III", "dept": "CEOs Office", "team": "Product Design"},
    {"title": "Animation Intern", "dept": "Delivery", "team": "Audio Visual Team"},
    {"title": "Animator", "dept": "Delivery", "team": "Audio Visual Team"},
    {"title": "Arabic Linguist", "dept": "Technology", "team": "Applied Research"},
    {"title": "Assistant Creative Director", "dept": "Delivery", "team": "Audio Visual Team"},
    {"title": "Assistant Director", "dept": "Delivery", "team": "Audio Visual Team"},
    {"title": "Assistant Manager", "dept": "Delivery", "team": "Operations"},
    {"title": "Assistant Quality Manager", "dept": "Delivery", "team": "Visual Graphics Team"},
    {"title": "Assistant Vice President (AVP)", "dept": "Sales", "team": "Sales"},
    {"title": "Associate", "dept": "Delivery", "team": "Operations"},
    {"title": "Associate Director", "dept": "Delivery", "team": "Delivery"},
    {"title": "Associate HH", "dept": "Administration", "team": "Administration"},
    {"title": "Backend Engineer", "dept": "Technology", "team": "Product Development"},
    {"title": "Backend Intern", "dept": "Technology", "team": "Product Development"},
    {"title": "Botany Intern", "dept": "Administration", "team": "Facilities"},
    {"title": "Brand and Communication Specialist", "dept": "CEOs Office", "team": "CEOs Office"},
    {"title": "Brand and Communication Team Lead", "dept": "Branding and Marketing", "team": "Branding and Marketing"},
    {"title": "Business Analyst", "dept": "Technology", "team": "Product Development"},
    {"title": "Business Analyst Intern", "dept": "Technology", "team": "Product Development"},
    {"title": "Business Associate", "dept": "CEOs Office", "team": "CEOs Office"},
    {"title": "Business Development Manager", "dept": "Sales", "team": "Sales"},
    {"title": "Business Manager", "dept": "CEOs Office", "team": "CEOs Office"},
    {"title": "CEO", "dept": "CEOs Office", "team": "CEOs Office"},
    {"title": "Chief Operating Officer", "dept": "CEOs Office", "team": "CEOs Office"},
    {"title": "Co Founder", "dept": "CEOs Office", "team": "CEOs Office"},
    {"title": "Consultant", "dept": "Sales", "team": "Sales"},
    {"title": "Content and Communication Associate", "dept": "Branding and Marketing", "team": "Branding and Marketing"},
    {"title": "Content Writer", "dept": "Branding and Marketing", "team": "Branding and Marketing"},
    {"title": "Content Writing Associate", "dept": "Branding and Marketing", "team": "Branding and Marketing"},
    {"title": "Content Writing Intern", "dept": "Branding and Marketing", "team": "Branding and Marketing"},
    {"title": "Contractual Expert", "dept": "Delivery", "team": "Visual Graphics Team"},
    {"title": "Copywriter", "dept": "Delivery", "team": "Arabic Language Team"},
    {"title": "Creative Director", "dept": "Delivery", "team": "Audio Visual Team"},
    {"title": "Creative Lead", "dept": "Delivery", "team": "Visual Graphics Team"},
    {"title": "Data Analyst", "dept": "CEOs Office", "team": "CEOs Office"},
    {"title": "Data Associate", "dept": "Delivery", "team": "Research and Data"},
    {"title": "Data Engineer", "dept": "Technology", "team": "Applied Research"},
    {"title": "Data Engineering Intern", "dept": "Technology", "team": "Applied Research"},
    {"title": "Data Science Intern", "dept": "Technology", "team": "Applied Research"},
    {"title": "Data Scientist", "dept": "Technology", "team": "Applied Research"},
    {"title": "Dev Ops Engineer", "dept": "Technology", "team": "Product Operations"},
    {"title": "Dev Ops Engineer Intern", "dept": "Technology", "team": "Product Operations"},
    {"title": "Dev Ops Manager", "dept": "Technology", "team": "Technology"},
    {"title": "Digital Marketing Associate", "dept": "Branding and Marketing", "team": "Branding and Marketing"},
    {"title": "Digital Marketing Specialist", "dept": "Branding and Marketing", "team": "Branding and Marketing"},
    {"title": "Director", "dept": "Delivery", "team": "Audio Visual Team"},
    {"title": "Entrepreneur in Residence", "dept": "CEOs Office", "team": "CEOs Office"},
    {"title": "Executive Assistant", "dept": "CEOs Office", "team": "CEOs Office"},
    {"title": "Fellow: Level 1", "dept": "Delivery", "team": "Arabic Language Team"},
    {"title": "Fellow: Level 2", "dept": "Delivery", "team": "Arabic Language Team"},
    {"title": "Frontend Intern", "dept": "Technology", "team": "Product Development"},
    {"title": "Graphic Design Intern", "dept": "Delivery", "team": "Visual Graphics Team"},
    {"title": "Graphic Designer", "dept": "Delivery", "team": "Visual Graphics Team"},
    {"title": "Growth Team Lead", "dept": "Branding and Marketing", "team": "Branding and Marketing"},
    {"title": "Head", "dept": "Technology", "team": "Applied Research"},
    {"title": "Head of Department (HoD)", "dept": "Delivery", "team": "Delivery"},
    {"title": "Horticulture Associate", "dept": "Administration", "team": "Facilities"},
    {"title": "Housekeeping Trainer HH", "dept": "Administration", "team": "Administration"},
    {"title": "HR Specialist", "dept": "People", "team": "People"},
    {"title": "Intern", "dept": "Delivery", "team": "Research and Data"},
    {"title": "Junior AI Software Engineer", "dept": "Technology", "team": "Technology"},
    {"title": "Junior Backend Developer", "dept": "Technology", "team": "Product Development"},
    {"title": "Junior Data Scientist", "dept": "Technology", "team": "Applied Research"},
    {"title": "Junior Data Scientist II", "dept": "Technology", "team": "Applied Research"},
    {"title": "Junior Presentation Designer", "dept": "Delivery", "team": "Visual Graphics Team"},
    {"title": "Junior Software Developer", "dept": "Technology", "team": "Product Development"},
    {"title": "Junior Supervisor", "dept": "Administration", "team": "Facilities"},
    {"title": "Learning and Development Specialist", "dept": "People", "team": "People"},
    {"title": "Linguist", "dept": "Delivery", "team": "Arabic Language Team"},
    {"title": "Machine Learning Engineer", "dept": "Technology", "team": "Applied Research"},
    {"title": "Machine Learning Scientist", "dept": "Technology", "team": "Technology"},
    {"title": "Manager", "dept": "Administration", "team": "Operations"},
    {"title": "Market Research and Data Intern", "dept": "COOs Office", "team": "COOs Office"},
    {"title": "Market Research Intern", "dept": "Delivery", "team": "Market Research Team"},
    {"title": "MR Specialist", "dept": "Delivery", "team": "Market Research Team"},
    {"title": "Network Engineer", "dept": "Administration", "team": "IT"},
    {"title": "Presentation Design Intern", "dept": "Delivery", "team": "Visual Graphics Team"},
    {"title": "Presentation Designer", "dept": "Delivery", "team": "Visual Graphics Team"},
    {"title": "Presentation Specialist", "dept": "Delivery", "team": "Visual Graphics Team"},
    {"title": "Process Associate I", "dept": "CEOs Office", "team": "Product Design"},
    {"title": "Process Associate II", "dept": "CEOs Office", "team": "Product Design"},
    {"title": "Process Associate III", "dept": "CEOs Office", "team": "Product Design"},
    {"title": "Process Lead", "dept": "CEOs Office", "team": "Product Design"},
    {"title": "Process Manager", "dept": "CEOs Office", "team": "Product Design"},
    {"title": "Producer", "dept": "Delivery", "team": "Audio Visual Team"},
    {"title": "Product Lead", "dept": "Technology", "team": "Product Development"},
    {"title": "Product Management Associate", "dept": "Technology", "team": "Technology"},
    {"title": "Product Management Associate I", "dept": "CEOs Office", "team": "Product Design"},
    {"title": "Product Management Associate II", "dept": "CEOs Office", "team": "Product Design"},
    {"title": "Product Management Intern", "dept": "Technology", "team": "Technology"},
    {"title": "Product Manager", "dept": "Technology", "team": "Technology"},
    {"title": "Project Lead", "dept": "Technology", "team": "Product Development"},
    {"title": "Project Management Intern", "dept": "Technology", "team": "Product Development"},
    {"title": "Quality Manager", "dept": "Delivery", "team": "Arabic Language Team"},
    {"title": "Recruiter", "dept": "People", "team": "Human Resources"},
    {"title": "Regional Manager", "dept": "Sales", "team": "Sales"},
    {"title": "Research Analyst", "dept": "Delivery", "team": "Research and Data"},
    {"title": "Research Associate", "dept": "Delivery", "team": "Research and Data"},
    {"title": "Research Lead", "dept": "Delivery", "team": "Market Research Team"},
    {"title": "Research Specialist", "dept": "Delivery", "team": "Market Research Team"},
    {"title": "Resident Associate", "dept": "Administration", "team": "Facilities"},
    {"title": "Sales Associate", "dept": "Delivery", "team": "Client Relations"},
    {"title": "Senior Associate", "dept": "Administration", "team": "Operations"},
    {"title": "Senior Consultant", "dept": "Sales", "team": "Sales"},
    {"title": "Senior Dev Ops Engineer", "dept": "Technology", "team": "Product Operations"},
    {"title": "Senior Frontend Developer", "dept": "Technology", "team": "Technology"},
    {"title": "Senior Graphic Designer", "dept": "Delivery", "team": "Visual Graphics Team"},
    {"title": "Senior Linguist", "dept": "Delivery", "team": "Arabic Language Team"},
    {"title": "Senior Manager", "dept": "Branding and Marketing", "team": "Branding and Marketing"},
    {"title": "Senior Project Lead", "dept": "Technology", "team": "Product Development"},
    {"title": "Senior SEO Specialist", "dept": "Branding and Marketing", "team": "Branding and Marketing"},
    {"title": "Senior Software AI Engineer", "dept": "Technology", "team": "Product Development"},
    {"title": "Senior Software Developer", "dept": "Technology", "team": "Product Development"},
    {"title": "Senior Software QA Engineer", "dept": "Technology", "team": "Product Development"},
    {"title": "Senior Team Lead", "dept": "Delivery", "team": "Operations"},
    {"title": "Senior UI Designer", "dept": "Delivery", "team": "Visual Graphics Team"},
    {"title": "Social Media Marketing Intern", "dept": "Branding and Marketing", "team": "Branding and Marketing"},
    {"title": "Social Media Specialist", "dept": "Branding and Marketing", "team": "Branding and Marketing"},
    {"title": "Software Developer", "dept": "Technology", "team": "Product Development"},
    {"title": "Software Developer Intern", "dept": "Technology", "team": "Product Development"},
    {"title": "Software Lead", "dept": "Technology", "team": "Product Development"},
    {"title": "Software QA Engineer", "dept": "Technology", "team": "Product Development"},
    {"title": "Supervisor", "dept": "Administration", "team": "Facilities"},
    {"title": "Team Lead", "dept": "Delivery", "team": "Operations"},
    {"title": "Team Lead HH", "dept": "Administration", "team": "Administration"},
    {"title": "Technology Consultant", "dept": "Technology", "team": "Technology"},
    {"title": "Testing Engineer", "dept": "Technology", "team": "Technology"},
    {"title": "Trainee", "dept": "Technology", "team": "Product Development"},
    {"title": "Translator", "dept": "Delivery", "team": "Arabic Language Team"},
    {"title": "UI Designer", "dept": "Delivery", "team": "Visual Graphics Team"},
    {"title": "UI/ UX Designer", "dept": "CEOs Office", "team": "Product Design"},
    {"title": "VG Expert", "dept": "Delivery", "team": "Chinese Visual Graphics Team"},
    {"title": "VG Master Specialist", "dept": "Delivery", "team": "Visual Graphics Team"},
    {"title": "VG Specialist", "dept": "Delivery", "team": "Visual Graphics Team"},
    {"title": "Vice President (VP)", "dept": "Sales", "team": "Sales"},
    {"title": "Visual Graphics Associate", "dept": "Delivery", "team": "Visual Graphics Team"},
]

_STOP = {"and", "the", "of", "a", "an", "to", "for", "in", "at", "with"}


def _tokens(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", (s or "").lower()) if len(w) > 1 and w not in _STOP}


def _designation_text(d: dict[str, str]) -> str:
    return f"{d['title']} {d['team']} {d['dept']}"


# Designation-text embeddings are stable, so compute them once per process (embeddings are also
# cached inside the embeddings service). Reset if the provider changes at startup.
_vecs: list[tuple[dict[str, str], list[float]]] | None = None


def build_designation_vectors() -> list[tuple[dict[str, str], list[float]]]:
    global _vecs
    if _vecs is None:
        _vecs = [(d, embeddings.embed(_designation_text(d))) for d in DESIGNATIONS]
    return _vecs


def suggest_designations_for(candidate, *, limit: int = 1) -> list[dict[str, Any]]:
    """Best-fit designation(s) from the fixed list for a candidate. Ranks mainly by title-token
    overlap with the candidate's parsed current title, with resume-embedding cosine as a secondary
    signal (and the only signal when no current title was parsed). Returns
    [{designation, department, team, score}] (score is a 0-100 blend)."""
    parsed = candidate.parsed or {}
    title_toks = _tokens(parsed.get("current_title") or "")
    emb = candidate.embedding or []
    scored: list[tuple[float, dict[str, str]]] = []
    for d, vec in build_designation_vectors():
        emb_sim = embeddings.cosine(emb, vec) if emb else 0.0
        if title_toks:
            dtoks = _tokens(d["title"])
            union = len(title_toks | dtoks) or 1
            title_sim = len(title_toks & dtoks) / union
            blended = 0.7 * title_sim + 0.3 * emb_sim
        else:
            blended = emb_sim
        scored.append((blended, d))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [
        {"designation": d["title"], "department": d["dept"], "team": d["team"], "score": round(s * 100)}
        for s, d in scored[:limit]
    ]
