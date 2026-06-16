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
    ("data analysis", "data analyst", "business intelligence", "bi", "bi analyst"),
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
    # ── HR / People (the headline "HR ↔ Human Resources" case) ───────────────
    ("human resources", "hr", "human resource", "hrm", "hr management",
     "human resource management", "human resources management"),
    ("payroll", "payroll management", "payroll processing"),
    ("performance management", "performance appraisal", "performance reviews"),
    # ── Microsoft / Office tools (MS ↔ Microsoft, full app names) ─────────────
    ("excel", "ms excel", "microsoft excel", "msexcel", "advanced excel"),
    ("word", "ms word", "microsoft word", "msword"),
    ("powerpoint", "ms powerpoint", "microsoft powerpoint", "power point", "ppt", "mspowerpoint"),
    ("outlook", "ms outlook", "microsoft outlook"),
    ("microsoft office", "ms office", "msoffice", "office suite", "microsoft office suite"),
    ("google workspace", "g suite", "gsuite", "google suite"),
    ("power bi", "powerbi", "microsoft power bi", "ms power bi"),
    # ── Common abbreviations recruiters actually type ────────────────────────
    ("search engine optimization", "search engine optimisation", "seo"),
    ("search engine marketing", "sem"),
    ("customer relationship management", "crm"),
    ("standard operating procedures", "standard operating procedure", "sop", "sops"),
    ("software as a service", "saas"),
    ("object oriented programming", "object-oriented programming", "oop", "oops"),
    ("application programming interface", "api", "apis"),
    ("artificial intelligence", "ai"),
    ("generative ai", "gen ai", "genai", "generative artificial intelligence"),
    ("key performance indicators", "key performance indicator", "kpi", "kpis"),
    ("return on investment", "roi"),
    ("user acceptance testing", "uat"),
    ("master of business administration", "mba"),
    # ── More cross-role abbreviations & synonyms (sales, marketing, finance, eng) ──
    ("enterprise resource planning", "erp"),
    ("salesforce", "sfdc"),
    ("google ads", "google adwords", "adwords"),
    ("pay per click", "ppc"),
    ("conversion rate optimization", "conversion rate optimisation", "cro"),
    ("goods and services tax", "gst"),
    ("computer aided design", "cad"),
    ("test driven development", "tdd"),
    ("behaviour driven development", "behavior driven development", "bdd"),
    ("internationalization", "internationalisation", "i18n"),
    ("localization", "localisation", "l10n"),
    ("business analysis", "business analyst"),
    ("six sigma", "lean six sigma"),
    ("email marketing", "e-mail marketing"),
    ("electronic health records", "electronic medical records", "ehr", "emr"),
    ("financial modelling", "financial modeling"),
]

# Bidirectional "related / near" clusters — members are NOT identical (so they keep their own
# canonical) but are CLOSE ENOUGH to count as a match in both directions. This is what makes a
# "PowerPoint" requirement satisfied by a candidate's "presentation design", or "Figma" by
# "Sketch". Keep each cluster to genuinely substitutable / adjacent skills.
RELATED_GROUPS: list[tuple[str, ...]] = [
    # Presentation family — the headline "PowerPoint ↔ presentation/slides" case.
    ("powerpoint", "presentation", "presentations", "presentation design", "presentation skills",
     "slides", "slide deck", "slide decks", "keynote", "google slides", "pitch deck", "pitch decks"),
    # Spreadsheets
    ("excel", "spreadsheets", "spreadsheet", "google sheets", "advanced excel"),
    # UI/UX design tools (substitutable)
    ("figma", "sketch", "adobe xd", "framer", "invision", "ui design", "ux design"),
    # Graphic / visual design tools
    ("photoshop", "illustrator", "indesign", "coreldraw", "canva", "graphic design",
     "adobe creative suite", "adobe creative cloud", "adobe photoshop", "adobe illustrator"),
    # Communication / soft skills
    ("communication", "communication skills", "verbal communication", "written communication",
     "interpersonal skills", "interpersonal communication", "presentation skills"),
    # Documentation / writing
    ("documentation", "technical writing", "technical documentation", "report writing", "content writing"),
    # Analytics / BI tools
    ("data analysis", "data analytics", "analytics", "power bi", "tableau", "looker", "qlik",
     "business intelligence", "google analytics"),
    # Project / agile
    ("agile", "scrum", "kanban", "agile methodology", "agile methodologies", "jira"),
    # Marketing / advertising (substitutable channels & tools)
    ("google ads", "facebook ads", "linkedin ads", "pay per click", "search engine marketing",
     "paid advertising", "digital advertising", "performance marketing", "paid media"),
    ("email marketing", "mailchimp", "marketing automation", "hubspot", "klaviyo"),
    # Sales / CRM tools
    ("salesforce", "hubspot", "zoho crm", "customer relationship management", "pipedrive"),
    # Accounting / finance tools
    ("tally", "quickbooks", "sap", "zoho books", "accounting software", "busy accounting"),
    # Relational databases (substitutable for shortlisting)
    ("mysql", "postgresql", "sql server", "oracle", "mariadb", "relational database",
     "relational databases", "rdbms"),
    # Cloud platforms
    ("amazon web services", "microsoft azure", "google cloud platform", "cloud computing", "cloud"),
    # Word processing / docs
    ("word", "google docs", "word processing"),
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

# Negation cues — used so "no experience with X" / "not familiar with X" in the resume body
# doesn't count as having skill X (a resume-text false positive).
_NEGATION = re.compile(r"\b(?:no|not|without|lack|lacking|never|nil|zero)\b|n't\b", re.IGNORECASE)


def _damerau(a: str, b: str) -> int:
    """Damerau-Levenshtein edit distance (counts a transposition as 1) — catches common typos
    including swapped letters ('pyhton' → 'python')."""
    la, lb = len(a), len(b)
    prev2: list[int] = []
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        cur = [i] + [0] * lb
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                cur[j] = min(cur[j], prev2[j - 2] + 1)
        prev2, prev = prev, cur
    return prev[lb]


def _fuzzy_token(t1: str, t2: str) -> bool:
    """True if two tokens are the same skill with a typo. Conservative: only for tokens ≥5 chars,
    same first AND last letter, length within 1, and edit distance ≤1 — so 'kubernets'≈'kubernetes'
    but 'react'≉'redux' and 'java'≉'rust'."""
    if t1 == t2:
        return True
    n1, n2 = len(t1), len(t2)
    if n1 < 5 or n2 < 5 or abs(n1 - n2) > 1:
        return False
    if t1[0] != t2[0] or t1[-1] != t2[-1]:
        return False
    return _damerau(t1, t2) <= 1


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
    # Knowing an Office app implies general MS Office familiarity (one-directional: requiring
    # "MS Office" is satisfied by "Excel", but requiring "Excel" is NOT satisfied by bare "Office").
    "excel": ["microsoft office"],
    "word": ["microsoft office"],
    "powerpoint": ["microsoft office"],
    "outlook": ["microsoft office"],
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


def _build_related() -> dict[str, frozenset[str]]:
    """canonical -> the set of canonicals in its related cluster(s) (bidirectional)."""
    m: dict[str, set[str]] = {}
    for group in RELATED_GROUPS:
        canons = {canonical(t) for t in group}
        for c in canons:
            m.setdefault(c, set()).update(canons - {c})
    return {k: frozenset(v) for k, v in m.items()}


_RELATED_MAP: dict[str, frozenset[str]] = _build_related()


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
    extra_text: str = "",
) -> dict:
    """Match a candidate's skills against a role's mandatory/preferred skills.

    Returns canonical lists + a per-skill reason map. Each required skill is judged
    independently against the candidate's whole skill set; the score denominator uses
    UNIQUE canonicals so a JD listing both 'js' and 'javascript' can't distort it.

    `extra_text` (e.g. the raw resume body) is a LAST-RESORT signal: a required skill that
    isn't in the extracted skill list still counts if it literally appears in the resume
    text. This fixes "0 matched skills" when a domain's skills (QA, etc.) weren't extracted.
    """
    # Guard every list at the source — a caller (e.g. a provider) may pass None for a
    # present-but-null field, which dict.get(k, []) would not catch.
    cand_skills = cand_skills or []
    mandatory = mandatory or []
    preferred = preferred or []
    if allow_semantic is None:
        allow_semantic = _semantic_enabled()

    # Normalized resume-text blob + its token set, for the text-presence fallback.
    _text_norm = " " + re.sub(r"[^a-z0-9+#.]+", " ", (extra_text or "").lower()) + " "
    _text_tokens = set(_TOKEN.findall(_text_norm)) if extra_text else set()

    def _present(needle: str) -> bool:
        """An occurrence of `needle` (a whole token/phrase) that is NOT preceded by a negation
        cue within ~30 chars — so 'no experience with java' doesn't count as having java."""
        i = _text_norm.find(" " + needle + " ")
        while i != -1:
            if not _NEGATION.search(_text_norm[max(0, i - 30):i]):
                return True
            i = _text_norm.find(" " + needle + " ", i + 1)
        return False

    def _in_text(req_canon: str) -> bool:
        if not _text_tokens:
            return False
        rt = skill_tokens(req_canon)
        if not rt:
            return False
        if len(rt) == 1:
            tok = next(iter(rt))
            # Single common/ambiguous words ("go", "r", "rest") are too noisy to trust from
            # free text; require a distinctive token (len>=3, not an ambiguous core).
            if len(tok) < 3 or tok in AMBIGUOUS_TITLE_CORES:
                return False
            if tok in _text_tokens and _present(tok):
                return True
            # Catch a typo of the skill in the resume body ("kubernets" → kubernetes).
            return any(_fuzzy_token(tok, tt) and _present(tt) for tt in _text_tokens)
        # Multi-token: the whole phrase, or all of its tokens, present in the resume.
        if (" " + req_canon + " ") in _text_norm:
            return _present(req_canon)
        return all(t in _text_tokens for t in rt)

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
        # Tier 3.5 — bidirectional "near" cluster (PowerPoint ↔ presentation/slides, Figma ↔
        # Sketch, communication ↔ interpersonal). Near-equivalent skills count in both directions.
        near = _RELATED_MAP.get(req_canon)
        if near:
            for c in cand_canons:
                if c in near:
                    return {"reason": "near", "matched_with": cand_map[c], "confidence": 0.82}
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
        # Tier 4.6 — fuzzy typo match: same token shape, each token a typo of the candidate's
        # ("kubernets"≈"kubernetes", "manual testng"≈"manual testing"). Guarded so it never fuses
        # two DISTINCT known skills, and only for tokens ≥5 chars (see _fuzzy_token).
        rt_sorted = sorted(rt)
        for c in cand_canons:
            ct_sorted = sorted(cand_tokens[c])
            if len(rt_sorted) != len(ct_sorted) or rt_sorted == ct_sorted:
                continue
            pairs = list(zip(rt_sorted, ct_sorted))
            if all(_fuzzy_token(a, b) for a, b in pairs) and not any(
                a != b and a in KNOWN_TERMS and b in KNOWN_TERMS for a, b in pairs
            ):
                return {"reason": "fuzzy", "matched_with": cand_map[c], "confidence": 0.78}
        # Tier 4.65 — a distinctive single-token requirement is a token of a MORE-SPECIFIC
        # candidate skill ("Python" ⊂ "Python 3.11", "CSS" ⊂ "HTML/CSS"). Generic words excluded.
        if len(rt) == 1:
            rtok = next(iter(rt))
            if len(rtok) >= 3 and rtok not in _DENY_GENERIC and rtok not in AMBIGUOUS_TITLE_CORES:
                for c in cand_canons:
                    if len(cand_tokens[c]) >= 2 and rtok in cand_tokens[c]:
                        return {"reason": "subset", "matched_with": cand_map[c], "confidence": 0.8}
        # Tier 4.7 — the skill (or a near-equivalent) literally appears in the resume text.
        # The related-term scan makes "PowerPoint" match a resume that mentions "presentation"
        # even when neither was extracted as a discrete skill — flexible matching for any role.
        if _in_text(req_canon):
            return {"reason": "resume", "matched_with": "resume text", "confidence": 0.8}
        for rel in _RELATED_MAP.get(req_canon, ()):
            if _in_text(rel):
                return {"reason": "near", "matched_with": rel, "confidence": 0.78}
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
