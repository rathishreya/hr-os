"""The scoring engine.

Blends three signals into one explainable, weighted score:
  1. Deterministic keyword skill overlap (reliable, auditable)
  2. Semantic similarity between resume and role (embeddings)
  3. The AI model's judgment on softer dimensions (communication, leadership, ...)

skill_match and experience_match are recomputed deterministically here so the hard
signals don't depend on model whim — key for explainability and bias defensibility.
The output is always a *suggestion* a human can override.
"""
from __future__ import annotations

from typing import Any

DEFAULT_WEIGHTS: dict[str, float] = {
    "skill_match": 0.30,
    "experience_match": 0.20,
    "domain_relevance": 0.12,
    "communication": 0.08,
    "leadership": 0.06,
    "culture_fit": 0.06,
    "growth_potential": 0.06,
    "salary_fit": 0.06,
    "stability": 0.06,
}


def _clamp(v: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, v))


def keyword_skill_match(parsed: dict[str, Any], hr: dict[str, Any]) -> tuple[float, list[str], list[str]]:
    cand = {s.lower().strip() for s in parsed.get("skills", []) if s}
    mand = {s.lower().strip() for s in hr.get("mandatory_skills", []) if s}
    pref = {s.lower().strip() for s in hr.get("preferred_skills", []) if s}
    if not mand:
        return 60.0, sorted(cand & pref), []
    matched = cand & mand
    score = 100 * len(matched) / len(mand)
    if pref:
        score = _clamp(score + 10 * len(cand & pref) / len(pref))
    missing = sorted(mand - cand)
    return score, sorted(matched | (cand & pref)), missing


def experience_match(parsed: dict[str, Any], hr: dict[str, Any]) -> float:
    yoe = float(parsed.get("total_yoe") or 0)
    ymin = float(hr.get("yoe_min") or 0)
    ymax = float(hr.get("yoe_max") or 0) or (ymin + 4)
    if ymin <= yoe <= ymax:
        return 100.0
    if yoe < ymin:
        return _clamp(100 - (ymin - yoe) * 20)
    return _clamp(100 - (yoe - ymax) * 8)


def normalize_weights(weights: dict[str, float]) -> dict[str, float]:
    total = sum(weights.values()) or 1.0
    return {k: v / total for k, v in weights.items()}


def finalize(
    ai_result: dict[str, Any],
    hr: dict[str, Any],
    parsed: dict[str, Any],
    similarity: float,
    weights: dict[str, float] | None = None,
) -> dict[str, Any]:
    weights = normalize_weights(weights or DEFAULT_WEIGHTS)

    kw_skill, matched, missing = keyword_skill_match(parsed, hr)
    # Blend keyword overlap with semantic similarity for the skill dimension.
    skill = _clamp(0.65 * kw_skill + 0.35 * similarity * 100)
    exp = experience_match(parsed, hr)

    ai_dims = ai_result.get("dimensions", {}) or {}
    dims: dict[str, float] = {}
    for key in DEFAULT_WEIGHTS:
        if key == "skill_match":
            dims[key] = round(skill)
        elif key == "experience_match":
            dims[key] = round(exp)
        else:
            dims[key] = round(_clamp(float(ai_dims.get(key, 60))))

    overall = round(sum(dims[k] * weights[k] for k in dims), 1)

    recommendation = (
        "strong_yes" if overall >= 80 else
        "yes" if overall >= 65 else
        "maybe" if overall >= 50 else "no"
    )
    fit_label = (
        "excellent" if overall >= 80 else
        "good" if overall >= 65 else
        "average" if overall >= 50 else "weak"
    )

    rationale = ai_result.get("rationale", "")
    audit = (
        f"[scoring] skill={dims['skill_match']} (keyword {round(kw_skill)} + semantic "
        f"{round(similarity * 100)}), experience={dims['experience_match']}. "
        f"Matched skills: {', '.join(matched) or 'none'}. "
        f"Missing mandatory: {', '.join(missing) or 'none'}."
    )

    return {
        "overall": overall,
        "dimensions": dims,
        "weights": weights,
        "rationale": (rationale + "\n\n" + audit).strip(),
        "recommendation": recommendation,
        "fit_label": fit_label,
        "strengths": ai_result.get("strengths", matched[:5]),
        "concerns": ai_result.get("concerns", [f"Missing: {m}" for m in missing[:5]]),
        "matched_skills": matched,
        "missing_skills": missing,
        "similarity": round(similarity, 4),
    }
