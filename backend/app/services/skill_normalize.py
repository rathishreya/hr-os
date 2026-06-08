"""Intelligent skill matching for resume shortlisting.

Plain set-intersection treats "hiring" and "recruiting", or "js" and "javascript",
as unrelated — so a strong candidate looks like a miss purely because of wording.
This module maps equivalent terms together so the candidate gets credit, while
staying deterministic, explainable, and conservative about false positives.

Five tiers, first hit wins (so every match is the strongest available):
  1. exact    — same word after normalization            (React / react)
  2. synonym  — different words, same curated group       (hiring / recruiting, js / javascript)
  3. related  — candidate skill IMPLIES the requirement   (React ⇒ JavaScript, Django ⇒ Python);
                one-directional — JS does NOT satisfy a React requirement
  4. subset   — candidate skill is MORE specific (multi-word requirement only)
 4.5 title    — job-title normalization for EVERY job function (a "Sales" requirement matched
                by "Business Development Executive", "Python" by "Senior Python Developer"),
                gated so a stripped core only counts if it is a recognized term (KNOWN_TERMS) —
                generic cores like "Software Engineer" → "software" are discarded
  5. semantic — per-skill embedding cosine ≥ threshold     (long tail; ONLY when a real
                semantic embedder like Ollama is configured — the default hash embedder
                returns 0 for token-disjoint synonyms, so this tier is inert offline)

The curated dictionary is what makes the headline "hiring ↔ recruiting" case work
offline; embeddings are an enhancement, not the foundation. Add terms to
SYNONYM_GROUPS freely — keep each group a set of genuinely interchangeable terms.
"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Iterable

from . import embeddings

# Each tuple is one equivalence group; element[0] is the canonical label shown in the UI.
# Keep groups to genuinely interchangeable terms — over-merging hurts precision.
SYNONYM_GROUPS: list[tuple[str, ...]] = [
    # ── Recruiting / HR domain ──────────────────────────────────────────────
    ("recruiting", "recruitment", "hiring", "talent acquisition", "ta",
     "sourcing", "headhunting", "full-cycle recruiting", "full cycle recruiting",
     "technical recruiting", "tech recruiting", "recruiter", "technical recruiter",
     "tech recruiter"),
    ("applicant tracking system", "ats"),
    ("employee onboarding", "onboarding"),
    ("people operations", "people ops", "hr operations"),
    ("human resources information system", "hris"),
    ("compensation and benefits", "comp & ben", "comp and ben"),
    ("boolean search", "boolean sourcing"),
    ("stakeholder management", "stakeholder engagement"),
    # ── Languages ───────────────────────────────────────────────────────────
    ("javascript", "js", "ecmascript", "es6"),
    ("typescript", "ts"),
    ("python", "py"),
    ("go", "golang"),
    ("c#", "csharp", "c sharp"),
    ("c++", "cpp", "c plus plus"),
    (".net", "dotnet", "dot net"),
    # ── ML / Data ───────────────────────────────────────────────────────────
    ("machine learning", "ml", "ml engineer", "machine learning engineer"),
    ("deep learning", "dl"),
    ("natural language processing", "nlp"),
    ("computer vision", "cv"),
    ("large language models", "large language model", "llm", "llms"),
    ("data science", "data scientist"),
    ("scikit-learn", "sklearn", "scikit learn"),
    # ── Cloud / Infra ───────────────────────────────────────────────────────
    ("kubernetes", "k8s", "k8"),
    ("amazon web services", "aws"),
    ("google cloud platform", "google cloud", "gcp"),
    ("microsoft azure", "azure"),
    ("terraform", "tf"),
    ("ci/cd", "cicd", "ci cd", "continuous integration",
     "continuous delivery", "continuous deployment"),
    # ── Datastores ──────────────────────────────────────────────────────────
    ("postgresql", "postgres", "psql", "postgre"),
    ("mongodb", "mongo"),
    ("elasticsearch", "elastic", "es"),
    # ── Web / Frameworks ────────────────────────────────────────────────────
    ("react", "reactjs", "react.js"),
    ("node", "nodejs", "node.js"),
    ("next.js", "nextjs"),
    ("rest", "rest api", "restful", "restful api"),
    ("graphql", "gql"),
    # ── Go-to-market / Sales ────────────────────────────────────────────────
    ("sales", "business development", "bd", "bdr", "sdr", "biz dev", "bizdev",
     "business dev", "sales development", "sales & business development",
     "sales and business development", "inside sales", "field sales"),
    ("marketing", "digital marketing", "growth marketing", "brand marketing",
     "performance marketing"),
    ("content marketing", "content writing", "copywriting", "content strategy",
     "content writer"),
    # ── Customer-facing ─────────────────────────────────────────────────────
    ("customer success", "csm", "client success", "customer success management",
     "customer success manager"),
    ("customer support", "technical support", "help desk", "helpdesk",
     "service desk", "support engineer", "technical support engineer"),
    # ── Product / Program (kept DISTINCT — "PM" is too ambiguous to alias) ───
    ("product management", "product manager", "product owner"),
    ("project management", "project manager"),
    ("program management", "program manager"),
    # ── Data (science / engineering / analysis kept DISTINCT) ───────────────
    ("data engineering", "data engineer"),
    ("data analysis", "data analyst", "business intelligence", "bi analyst"),
    # ── Design ──────────────────────────────────────────────────────────────
    ("ux design", "ux designer", "user experience design", "product design",
     "product designer", "ui/ux", "ui/ux design"),
    ("graphic design", "graphic designer", "visual design"),
    # ── Engineering disciplines ─────────────────────────────────────────────
    ("devops", "dev ops", "site reliability engineering", "sre",
     "platform engineering", "devops engineer", "site reliability engineer",
     "platform engineer"),
    ("quality assurance", "qa", "quality engineering", "sdet", "qa engineering",
     "qa engineer", "test engineer"),
    ("information security", "infosec", "cybersecurity", "cyber security",
     "security engineer"),
    # multi-word canonical ONLY — intentionally inert for titles, so a JD literally
    # requiring "software" is never matched by a "Software Engineer" (the central guard).
    ("software engineering", "software development"),
    # ── Finance / Ops ───────────────────────────────────────────────────────
    ("finance", "financial planning and analysis", "fp&a", "fpa", "corporate finance"),
    ("accounting", "accountant", "bookkeeping", "accounts payable", "accounts receivable"),
    ("supply chain", "supply chain management", "logistics"),
]

SEMANTIC_THRESHOLD = 0.82  # high, per-skill cosine — precision over recall for the long tail

# Job-title normalization: a resume skill is often a TITLE ("Business Development Executive",
# "Sales Manager") rather than the bare competency. We peel leading seniority words and
# trailing role words to recover the core ("business development", "sales"). Seniority tends
# to LEAD ("Senior X"); role-type tends to TRAIL ("X Executive"). Position-anchored so an
# interior/edge skill word is never lost — "Developer Relations" and "Sales Operations" are
# safe because "relations"/"operations" aren't strip words.
SENIORITY_LEAD = frozenset({
    "senior", "sr", "junior", "jr", "principal", "staff", "chief", "head", "associate",
    "entry", "entry-level", "mid", "mid-level", "intern", "trainee", "graduate",
    "apprentice", "fresher", "vp", "svp", "evp",
})
ROLE_TRAIL = frozenset({
    "executive", "exec", "manager", "mgr", "officer", "specialist", "consultant",
    "representative", "rep", "coordinator", "administrator", "admin", "director",
    "professional", "agent", "lead", "head", "generalist", "partner",
    "associate", "analyst", "developer", "dev", "architect",
    # NOTE: "engineer"/"designer"/"scientist" are deliberately NOT here — "engineer" would
    # make "Sales Engineer" → "sales" (false positive), and stripping designer/scientist
    # breaks "Senior Data Scientist"/"Senior UX Designer". Those titles are matched instead as
    # enumerated multi-word members of their family groups (e.g. "ml engineer", "ux designer").
})
# "Practitioner" trail words signal a hands-on IC role. They're the only trail words allowed to
# strip an AMBIGUOUS core (below): "Vue Developer" → "vue" counts, but "Express Manager" → "express"
# does not — a managerial trail on a common-English word is not evidence of the framework skill.
PRACTITIONER_TRAIL = frozenset({"developer", "dev", "architect"})
# Single-token canonicals that are ALSO ordinary English words / non-tech title heads, so a
# "<word> <managerial-trail>" title would otherwise masquerade as the framework/language
# (e.g. "Express Manager" courier, "Spring Manager", "Go Lead"). For these, the title tier only
# fires when the stripped trailing word was a PRACTITIONER_TRAIL word.
AMBIGUOUS_TITLE_CORES = frozenset({"go", "rest", "spring", "vue", "ruby", "express"})
# Connector words inside titles ("Head of Sales", "Sales & Marketing") — peeled only after a
# role/seniority word so the core ("sales") is recovered without touching skills like
# "Internet of Things" (whose leading word isn't a title word).
_CONNECTORS = frozenset({"of", "and", "&"})
_TITLE_WORDS = SENIORITY_LEAD | ROLE_TRAIL

_WS = re.compile(r"\s+")
_TOKEN = re.compile(r"[a-z0-9+#.]+")  # same token class as embeddings._TOKEN


def normalize_token(raw: str) -> str:
    """Lowercase, collapse whitespace, strip trailing sentence punctuation — while
    PRESERVING the +, #, . characters that distinguish c / c++ / c# / .net / node.js."""
    s = (raw or "").lower().strip()
    s = _WS.sub(" ", s)
    # Strip surrounding punctuation (bullets, "!", "?", ")", "."), but PRESERVE the chars
    # that carry meaning: a leading '.' (".net") and trailing '+'/'#' ("c++", "c#").
    s = re.sub(r"^[^a-z0-9.+#]+", "", s)
    s = re.sub(r"[^a-z0-9+#]+$", "", s)
    return s


def _build_alias_map() -> dict[str, str]:
    alias: dict[str, str] = {}
    for group in SYNONYM_GROUPS:
        canon = normalize_token(group[0])
        for term in group:
            n = normalize_token(term)
            if n in alias and alias[n] != canon:
                raise AssertionError(
                    f"skill synonym '{n}' is in two groups ('{alias[n]}' and '{canon}') — "
                    "each surface form must belong to exactly one group"
                )
            alias[n] = canon
    return alias


_ALIAS_TO_CANON: dict[str, str] = _build_alias_map()


# Directional "implies" edges: using the tool/framework on the LEFT necessarily means you
# know the technology on the RIGHT (React ⇒ JavaScript, Django ⇒ Python, Spring ⇒ Java).
# ONE-WAY — a JavaScript requirement is satisfied by React, but a React requirement is NOT
# satisfied by plain JavaScript. Listed as direct edges; the transitive closure is computed
# at import, so Next.js ⇒ React ⇒ JavaScript credits a "JS" requirement too.
_IMPLIES_RAW: dict[str, list[str]] = {
    # JS ecosystem
    "react": ["javascript"],
    "next.js": ["react"],
    "react native": ["react"],
    "vue": ["javascript"],
    "angular": ["javascript", "typescript"],
    "svelte": ["javascript"],
    "node": ["javascript"],
    "express": ["node"],
    "nestjs": ["node", "typescript"],
    "typescript": ["javascript"],
    "jquery": ["javascript"],
    # Python ecosystem
    "django": ["python"],
    "flask": ["python"],
    "fastapi": ["python"],
    "pandas": ["python"],
    "numpy": ["python"],
    "pytorch": ["python", "machine learning"],
    "tensorflow": ["python", "machine learning"],
    "scikit-learn": ["python", "machine learning"],
    "keras": ["python", "machine learning"],
    # Other language ecosystems
    "spring": ["java"],
    "spring boot": ["java"],
    "ruby on rails": ["ruby"],
    "rails": ["ruby"],
    "laravel": ["php"],
    "tailwind": ["css"],
}


def _build_implies() -> dict[str, frozenset[str]]:
    direct: dict[str, set[str]] = {}
    for k, vs in _IMPLIES_RAW.items():
        direct.setdefault(canonical(k), set()).update(canonical(v) for v in vs)
    closure: dict[str, frozenset[str]] = {}
    for start in direct:
        seen: set[str] = set()
        stack = list(direct[start])
        while stack:  # transitive closure, cycle-safe via `seen`
            n = stack.pop()
            if n in seen:
                continue
            seen.add(n)
            stack.extend(direct.get(n, ()))
        closure[start] = frozenset(seen)
    return closure


def canonical(raw: str) -> str:
    """Normalized form mapped to its group's canonical label; unknown skills pass
    through unchanged (nothing is ever lost)."""
    n = normalize_token(raw)
    return _ALIAS_TO_CANON.get(n, n)


# Built after `canonical` is defined (it depends on it).
_IMPLIES_CLOSURE: dict[str, frozenset[str]] = _build_implies()


# Title-tier gate: a stripped job-title core only COUNTS as a match if it is a term the curated
# dictionary already recognizes. Auto-derived from the dictionary, so every family is covered
# with no per-family edits — and bare generic nouns (software/data/account/engineer/analyst/…)
# are absent, so title-normalization can never widen a generic word into an unrelated match.
KNOWN_TERMS: frozenset[str] = frozenset(
    {canonical(k) for k in _ALIAS_TO_CANON}
    | {canonical(v) for v in _ALIAS_TO_CANON.values()}
    | {canonical(k) for k in _IMPLIES_CLOSURE}
    | {canonical(n) for vs in _IMPLIES_CLOSURE.values() for n in vs}  # java/ruby/php/css live here
)
# Fail-fast (mirrors the alias-map disjointness assert): if a future contributor adds an overly
# generic surface form, it would silently widen the title gate. Lock that out at import.
# Generic NON-function nouns. (Function words like "marketing"/"sales"/"finance" are legit
# canonicals and intentionally NOT here — they only ever match their own title family.)
_DENY_GENERIC = {
    "software", "data", "account", "business", "engineer", "developer", "analyst", "manager",
    "product", "project", "program", "ux", "graphic", "security", "financial", "web", "system",
    "solutions", "frontend", "backend", "design", "support", "operations",
}
assert not (_DENY_GENERIC & KNOWN_TERMS), (
    f"generic noun(s) leaked into KNOWN_TERMS: {sorted(_DENY_GENERIC & KNOWN_TERMS)} — "
    "do not add a bare generic word as a synonym-group surface form (it would over-widen "
    "job-title matching)"
)


@lru_cache(maxsize=2048)
def skill_tokens(canon: str) -> frozenset[str]:
    return frozenset(_TOKEN.findall(canon))


@lru_cache(maxsize=4096)
def _peel(canon: str, trail: frozenset) -> str:
    """Peel the given trailing role words, then leading seniority words (and "<role> of"
    connectors), off a canonical title. No-op for single-token skills, never empties the
    string (keeps ≥1 word), and position-anchored so interior skill words are safe
    ("internet of things", "developer relations")."""
    words = canon.split()
    if len(words) < 2:
        return canon
    while len(words) >= 2 and words[-1] in trail:
        words.pop()
    peeled = False
    while len(words) >= 2:
        if words[0] in SENIORITY_LEAD:
            words.pop(0)
            peeled = True
        elif len(words) >= 3 and words[0] in _TITLE_WORDS and words[1] in _CONNECTORS:
            del words[:2]  # "<role> of <core>": Head of Sales, Director of Sales
            peeled = True
        elif peeled and words[0] in _CONNECTORS:
            words.pop(0)  # leftover connector after a seniority peel ("VP of Sales")
        else:
            break
    return " ".join(words)


def strip_title_core(canon: str) -> str:
    """Full strip: trailing role words + leading seniority ("Sales Manager" → "sales")."""
    return _peel(canon, ROLE_TRAIL)


def strip_seniority_lead(canon: str) -> str:
    """Seniority-only strip ("Senior Product Manager" → "product manager" → product management)."""
    return _peel(canon, frozenset())


def strip_practitioner(canon: str) -> str:
    """Strip seniority + only PRACTITIONER trail words ("Vue Developer" → "vue", "Senior Go
    Architect" → "go"); used to allow ambiguous cores only off a hands-on IC title."""
    return _peel(canon, PRACTITIONER_TRAIL)


def title_cores(canon: str) -> set[str]:
    """Job-title cores eligible to match via Tier 4.5, with the ambiguous-word carve-out:
    a non-ambiguous core counts if reachable by the full or seniority-only strip; an AMBIGUOUS
    core (go/rest/spring/...) counts ONLY if reachable by the practitioner strip (i.e. the
    title used a developer/dev/architect trail, not a managerial one). All gated by KNOWN_TERMS."""
    cores: set[str] = set()
    for core in (canonical(strip_title_core(canon)), canonical(strip_seniority_lead(canon))):
        if core in KNOWN_TERMS and core not in AMBIGUOUS_TITLE_CORES:
            cores.add(core)
    prac = canonical(strip_practitioner(canon))
    if prac in KNOWN_TERMS and prac in AMBIGUOUS_TITLE_CORES:
        cores.add(prac)
    return cores


def _semantic_enabled() -> bool:
    try:
        return embeddings._resolve_provider() == "ollama"
    except Exception:
        return False


def _dedup_canon(skills: Iterable[str]) -> dict[str, str]:
    """canonical -> a representative original surface form (so the UI shows real wording).
    Prefer a surface that IS the canonical form, so an exact match isn't mislabeled as a
    synonym when the candidate lists both forms (e.g. 'JS' and 'JavaScript')."""
    out: dict[str, str] = {}
    for s in skills:
        if not s or not str(s).strip():
            continue
        surf = str(s).strip()
        c = canonical(surf)
        if c not in out:
            out[c] = surf
        elif normalize_token(surf) == c and normalize_token(out[c]) != c:
            out[c] = surf  # upgrade to the canonical-form surface for a clearer reason label
    return out


def match_report(
    cand_skills: Iterable[str],
    mandatory: Iterable[str],
    preferred: Iterable[str] | None = None,
    *,
    allow_semantic: bool | None = None,
) -> dict:
    """Match a candidate's skills against a role's mandatory/preferred skills.

    Returns canonical lists + a per-skill reason map. Each required skill is judged
    independently against the candidate's whole skill set; the score denominator uses
    UNIQUE canonicals so a JD listing both 'js' and 'javascript' can't distort it.
    """
    # Guard every list at the source — a caller (e.g. a provider) may pass None for a
    # present-but-null field, which dict.get(k, []) would not catch.
    cand_skills = cand_skills or []
    mandatory = mandatory or []
    preferred = preferred or []
    if allow_semantic is None:
        allow_semantic = _semantic_enabled()

    cand_map = _dedup_canon(cand_skills)            # canon -> surface
    cand_canons = list(cand_map)
    cand_tokens = {c: skill_tokens(c) for c in cand_canons}
    cand_embeds = (
        {c: embeddings.embed(c) for c in cand_canons} if allow_semantic and cand_canons else {}
    )

    mand_map = _dedup_canon(mandatory)
    pref_map = _dedup_canon(preferred)

    def match_one(req_canon: str, req_surface: str):
        # Tier 1/2 — same canonical (exact if the raw words match, else a synonym).
        if req_canon in cand_map:
            surface = cand_map[req_canon]
            reason = "exact" if normalize_token(surface) == normalize_token(req_surface) else "synonym"
            return {"reason": reason, "matched_with": surface, "confidence": 1.0}
        # Tier 3 — candidate skill IMPLIES the requirement (React ⇒ JavaScript, Django ⇒
        # Python, Spring ⇒ Java). One-directional: a JS requirement is met by React, but a
        # React requirement is NOT met by plain JavaScript.
        for c in cand_canons:
            if req_canon in _IMPLIES_CLOSURE.get(c, ()):
                return {"reason": "related", "matched_with": cand_map[c], "confidence": 0.9}
        # Tier 4 — candidate skill is strictly more specific (required tokens ⊂ candidate).
        # Require a MULTI-TOKEN requirement: a single generic word ("web", "management")
        # appearing as a token inside a longer candidate skill is too weak a signal and
        # caused false positives (JD "web" wrongly matched by "Amazon Web Services"). A
        # multi-word requirement ("machine learning" ⊂ "applied machine learning engineer")
        # is specific enough to trust.
        rt = skill_tokens(req_canon)
        if len(rt) >= 2:
            for c in cand_canons:
                if rt < cand_tokens[c]:  # proper subset, one-directional (candidate is more specific)
                    return {"reason": "subset", "matched_with": cand_map[c], "confidence": 0.85}
        # Tier 4.5 — job-title normalization for EVERY function (see title_cores): strips
        # seniority/role words to a core gated by KNOWN_TERMS, so "Sales Manager" → "sales",
        # "Senior Product Manager" → "product management", "Python Developer" → "python" all
        # match, while generic cores ("Software Engineer" → "software") are discarded and
        # ambiguous common words ("Express Manager" → "express") only match off an IC title.
        req_cores = title_cores(req_canon)
        if req_cores:
            for c in cand_canons:
                if req_cores & title_cores(c):
                    return {"reason": "title", "matched_with": cand_map[c], "confidence": 0.9}
        # Tier 5 — semantic, only when a real embedder is configured.
        if allow_semantic and cand_embeds:
            rv = embeddings.embed(req_canon)
            best_c, best_score = None, 0.0
            for c in cand_canons:
                sc = embeddings.cosine(rv, cand_embeds[c])
                if sc > best_score:
                    best_c, best_score = c, sc
            if best_c is not None and best_score >= SEMANTIC_THRESHOLD:
                return {"reason": "semantic", "matched_with": cand_map[best_c],
                        "confidence": round(best_score, 3)}
        return None

    reasons: dict[str, dict] = {}
    matched_canon: list[str] = []
    missing_canon: list[str] = []
    for canon, surface in mand_map.items():
        hit = match_one(canon, surface)
        if hit:
            matched_canon.append(canon)
            reasons[canon] = hit
        else:
            missing_canon.append(canon)

    matched_pref_canon: list[str] = []
    for canon, surface in pref_map.items():
        if canon in mand_map:
            continue  # already counted as mandatory
        hit = match_one(canon, surface)
        if hit:
            matched_pref_canon.append(canon)
            reasons[canon] = hit

    return {
        "mandatory_canon": list(mand_map),
        "matched_canon": matched_canon,
        "missing_canon": missing_canon,
        "preferred_canon": list(pref_map),
        "matched_pref_canon": matched_pref_canon,
        "reasons": reasons,
    }
