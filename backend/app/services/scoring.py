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

import re
from typing import Any

from . import skill_normalize

# Bump when the deterministic matcher changes meaningfully — lets read paths lazily re-derive
# stale scores with the current matcher (see pipeline board auto-heal). v2 = flexible matcher
# (synonyms/abbreviations/near clusters + resume-text fallback). v3 = + fuzzy/typo matching,
# distinctive-token subset (versioned/concatenated skills), and negation-aware resume text.
# v4 = + semantic tier active (Gemini/Ollama embeddings) for morphology & unseen synonyms.
SCORER_VERSION = 4

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


def _num(x: Any, default: float = 60.0) -> float:
    """Coerce a model-supplied value to a float, falling back to `default` — so a malformed
    AI dimension (e.g. the string "high") degrades to neutral instead of crashing scoring."""
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def _method_counts(reasons: dict[str, dict]) -> dict[str, int]:
    counts = {"exact": 0, "synonym": 0, "related": 0, "near": 0, "subset": 0, "title": 0, "fuzzy": 0, "resume": 0, "semantic": 0}
    for r in reasons.values():
        if r.get("reason") in counts:
            counts[r["reason"]] += 1
    return counts


# How each non-exact match reads in the audit trail, e.g. 'javascript (implied by "React")'.
_REASON_PHRASE = {
    "synonym": "synonym of",
    "related": "implied by",
    "near": "related to",
    "subset": "matches",
    "title": "role-title match",
    "fuzzy": "likely typo of",
    "resume": "found in resume",
    "semantic": "similar to",
}


def keyword_skill_match_detailed(
    parsed: dict[str, Any], hr: dict[str, Any]
) -> tuple[float, list[str], list[str], dict[str, dict]]:
    """Intelligent skill overlap: maps synonyms/abbreviations/related terms (via
    skill_normalize) so e.g. JD "hiring" is satisfied by a resume's "recruiting".

    Returns (score, matched_canonical, missing_canonical, reasons) where `reasons`
    maps each matched canonical skill to how it matched (exact/synonym/subset/semantic)
    and the candidate's own wording — for an explainable, bias-defensible report.

    The mandatory-skill component is floored at the old exact-overlap result (so smarter
    matching never lowers it). The preferred bonus counts a shared skill once, whereas the
    old formula double-counted a skill listed in BOTH mandatory and preferred — so for that
    (unusual) JD shape the new total can be marginally lower, which is the more correct read.
    """
    cand = list(parsed.get("skills", []) or [])
    mand = list(hr.get("mandatory_skills", []) or [])
    pref = list(hr.get("preferred_skills", []) or [])
    # Pass the raw resume text so a required skill counts when it appears in the body even if
    # it wasn't extracted as a discrete skill (fixes "0 matched skills" on e.g. QA resumes).
    rep = skill_normalize.match_report(cand, mand, pref, extra_text=parsed.get("_resume_text", ""))

    n_mand = len(rep["mandatory_canon"])
    n_pref = len(rep["preferred_canon"])
    matched = sorted(set(rep["matched_canon"]) | set(rep["matched_pref_canon"]))
    if not n_mand:
        # No mandatory skills declared — neutral 60, credit any preferred overlap.
        return 60.0, matched, [], rep["reasons"]

    # Floor at the old exact-overlap score so smarter matching can only ever ADD credit
    # — canonical de-duplication (a JD listing both 'js' and 'javascript') can't drop a
    # candidate below what plain string matching would have given.
    cand_l = {str(s).lower().strip() for s in cand if s and str(s).strip()}
    mand_l = {str(s).lower().strip() for s in mand if s and str(s).strip()}
    old_exact = 100 * len(cand_l & mand_l) / len(mand_l) if mand_l else 0.0
    score = max(old_exact, 100 * len(rep["matched_canon"]) / n_mand)
    if n_pref:
        score = _clamp(score + 10 * len(rep["matched_pref_canon"]) / n_pref)
    return score, matched, sorted(rep["missing_canon"]), rep["reasons"]


def keyword_skill_match(parsed: dict[str, Any], hr: dict[str, Any]) -> tuple[float, list[str], list[str]]:
    """Back-compatible 3-tuple wrapper around keyword_skill_match_detailed."""
    score, matched, missing, _ = keyword_skill_match_detailed(parsed, hr)
    return score, matched, missing


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

    kw_skill, matched, missing, match_reasons = keyword_skill_match_detailed(parsed, hr)
    # Blend keyword overlap with semantic similarity for the skill dimension — BUT only when a
    # real embedder (Ollama) is configured. The default hash embedder returns ~0 similarity for
    # reworded skills, which would wrongly drag the skill score down, so use keyword alone there.
    semantic_ok = skill_normalize._semantic_enabled()
    if semantic_ok:
        # Semantic resume↔role similarity can only ADD to the deterministic keyword score, never
        # dilute it — so a stale or mismatched-dimension candidate vector (similarity 0) is a
        # no-op rather than a penalty.
        skill = _clamp(max(kw_skill, 0.65 * kw_skill + 0.35 * similarity * 100))
        skill_blend = {"keyword": 0.65, "semantic": 0.35}
    else:
        skill = _clamp(kw_skill)
        skill_blend = {"keyword": 1.0, "semantic": 0.0}
    exp = experience_match(parsed, hr)

    ai_dims = ai_result.get("dimensions", {})
    if not isinstance(ai_dims, dict):  # a malformed provider may send a list/scalar here
        ai_dims = {}
    dims: dict[str, float] = {}
    for key in DEFAULT_WEIGHTS:
        if key == "skill_match":
            dims[key] = round(skill)
        elif key == "experience_match":
            dims[key] = round(exp)
        else:
            dims[key] = round(_clamp(_num(ai_dims.get(key, 60))))

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

    def _matched_frag(skill: str) -> str:
        r = match_reasons.get(skill)
        if r and r["reason"] != "exact" and r.get("matched_with"):
            phrase = _REASON_PHRASE.get(r["reason"], r["reason"])
            return f"{skill} ({phrase} \"{r['matched_with']}\")"
        return skill

    matched_str = ", ".join(_matched_frag(m) for m in matched) or "none"
    audit = (
        f"[scoring] skill={dims['skill_match']} (keyword {round(kw_skill)} + semantic "
        f"{round(similarity * 100)}), experience={dims['experience_match']}. "
        f"Matched skills: {matched_str}. "
        f"Missing mandatory: {', '.join(missing) or 'none'}."
    )

    strengths = ai_result.get("strengths") or matched[:5]
    concerns = ai_result.get("concerns") or [f"Missing: {m}" for m in missing[:5]]

    # Reconcile the AI's free-form strengths/concerns with the DETERMINISTIC skill match, which is
    # authoritative for whether a skill is present. The AI judges skills independently (and via the
    # raw resume), so it can wrongly call a skill "missing" that our matcher matched — which would
    # render as the same skill being BOTH a green "matched" chip and an amber "missing" gap. Drop
    # those self-contradicting lines so the report is internally consistent.
    matched_lc = {str(m).lower().strip() for m in matched if str(m).strip()}
    missing_lc = {str(m).lower().strip() for m in missing if str(m).strip()}
    _MISS_CUE = re.compile(r"missing|lack|absent|without|\bno\b|\bnot\b|\bgap|weak|limited|little|few", re.I)
    _HAS_CUE = re.compile(r"strong|solid|proficient|experienc|skilled|expert|excellent|deep|good|background", re.I)

    def _names(text: str, skills: set[str]) -> bool:
        t = " " + re.sub(r"[^a-z0-9+#]+", " ", str(text).lower()).strip() + " "
        return any(sk and (" " + sk + " ") in t for sk in skills)

    # A concern that flags a MATCHED skill as absent is a contradiction → drop it.
    concerns = [c for c in concerns if not (_MISS_CUE.search(str(c)) and _names(c, matched_lc))]
    # A strength that credits a MISSING skill as present is the inverse contradiction → drop it.
    strengths = [s for s in strengths if not (_HAS_CUE.search(str(s)) and _names(s, missing_lc))]

    # Per-dimension contribution to the overall score, so the UI can show *why* the
    # number is what it is. `measured` dims are deterministic; `ai_estimate` are softer.
    measured = {"skill_match", "experience_match"}
    contributions = sorted(
        (
            {
                "key": k,
                "score": dims[k],
                "weight": round(weights[k] * 100, 1),  # percent
                "points": round(dims[k] * weights[k], 1),  # contribution to overall
                "kind": "measured" if k in measured else "ai_estimate",
            }
            for k in dims
        ),
        key=lambda d: d["points"],
        reverse=True,
    )

    # Self-describing breakdown the frontend renders as the "AI report" (strengths,
    # gaps, and a transparent explanation of how the rating was derived).
    breakdown = {
        "strengths": strengths,
        "concerns": concerns,
        "matched_skills": matched,
        "missing_skills": missing,
        # How each skill matched (exact / synonym / subset / semantic) + the candidate's
        # own wording, so the report can explain *why* a skill counted. Additive keys —
        # the UI ignores them until it opts in to render the reasons.
        "match_reasons": match_reasons,
        "match_method_counts": _method_counts(match_reasons),
        "contributions": contributions,
        "keyword_skill": round(kw_skill),
        "semantic_skill": round(similarity * 100),
        "skill_blend": skill_blend,
        "weights": weights,
        "similarity": round(similarity, 4),
        "thresholds": {"strong_yes": 80, "yes": 65, "maybe": 50},
        "summary": rationale,
        "audit": audit,
        "scorer_version": SCORER_VERSION,
    }

    return {
        "overall": overall,
        "dimensions": dims,
        "weights": weights,
        "rationale": (rationale + "\n\n" + audit).strip(),
        "recommendation": recommendation,
        "fit_label": fit_label,
        "strengths": strengths,
        "concerns": concerns,
        "matched_skills": matched,
        "missing_skills": missing,
        "similarity": round(similarity, 4),
        "breakdown": breakdown,
    }
