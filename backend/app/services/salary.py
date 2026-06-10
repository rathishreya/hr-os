"""Single source of truth for displayed job salary.

The recruiter-edited ``HiringRequest.budget_ctc`` (free text like "4-5 LPA") is the ONLY
salary a candidate/job-board should ever see. The AI also writes salary figures into the
JD body (benefits/description), the social copy, and an advisory ``suggested_salary`` — any
of which can drift from the budget. So before displaying or distributing AI text we run it
through :func:`canonicalize_salary`, which rewrites every embedded salary figure to the
budget (or strips it when no budget is set). Detection is unit-anchored so non-salary
numeric ranges (years of experience, head-counts, %, dates, phone numbers) are never touched.

Out of scope (separate truths — never rewritten here): candidate current/expected CTC and
offer-letter / employment-contract CTC.
"""
from __future__ import annotations

import re

# Indian-style salary detector. A bare numeric range alone never qualifies — a match needs
# EITHER a lakh-family unit (L / LPA / lakh / lac) OR a currency token (₹ / Rs / INR) paired
# with a pay period (per annum / p.a. / per month ...). Validated against an adversarial
# battery (salary phrasings match; "5-7 years", "10-15 engineers", "10-15%", "2024-2025",
# phone numbers, "401(k)", "24x7" do not). See services/salary tests.
_SALARY_RE = re.compile(
    r"""
    (?<![A-Za-z])                                  # not glued to a letter (blocks 'rs' in 'stakeholders')
    (?:
        # (A) number (opt. currency, opt. range) bound to a lakh-family unit. The \s* lives
        # INSIDE the optional currency group so a bare number never swallows a preceding space.
        (?:(?:₹|\bRs\.?|\bINR\b)\s*)?
        \d[\d,]*(?:\.\d+)?
        (?:\s*(?:-|–|—|to|and)\s*(?:(?:₹|\bRs\.?|\bINR\b)\s*)?\d[\d,]*(?:\.\d+)?)?
        \s*
        (?:L|LPA|lakhs?|lacs?)\b
        (?:\s*(?:per\s+annum|p\.?\s?a\.?|per\s+year|/\s?year|annually|per\s+month|/\s?month|p\.?\s?m\.?)\b)?
      |
        # (B) currency token + number (+ opt. range) + a pay period
        (?:₹|\bRs\.?|\bINR\b)\s*
        \d[\d,]*(?:\.\d+)?
        (?:\s*(?:-|–|—|to|and)\s*(?:(?:₹|\bRs\.?|\bINR\b)\s*)?\d[\d,]*(?:\.\d+)?)?
        \s*
        (?:per\s+annum|p\.?\s?a\.?|per\s+year|/\s?year|annually|per\s+month|/\s?month|p\.?\s?m\.?)\b
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Lines that carry a currency amount but are NOT pay (a discount, a fee, a refund...). If any
# of these words is present we leave the line untouched even if a figure matches.
_NEG_CONTEXT = re.compile(r"\b(discount|subscription|refund|cashback|fee|fine|penalty)\b", re.IGNORECASE)


def _tidy(s: str) -> str:
    """Clean up artefacts left after stripping/replacing a figure mid-text."""
    s = re.sub(r"\(\s*\)", "", s)            # empty parens "()"
    s = re.sub(r"\s{2,}", " ", s)            # collapsed double spaces
    s = re.sub(r"\s+([.,;:)])", r"\1", s)    # space before punctuation
    s = re.sub(r"\(\s+", "(", s)             # space just inside an open paren
    s = re.sub(r"\s+([+&/])\s+(?=[.,;:]|$)", " ", s)  # dangling connector before end/punct
    s = re.sub(r"^[\s;,]+", "", s)           # leading delimiter left after stripping a 1st segment
    return s.strip()


def _has_salary(line: str) -> bool:
    return bool(_SALARY_RE.search(line)) and not _NEG_CONTEXT.search(line)


def _meaningful_remainder(line: str) -> str:
    """What's left of a salary line after removing the figure AND the leading salary label,
    used to decide whether an emptied line should be dropped entirely."""
    s = re.sub(
        r"^\s*(?:competitive\s+)?(?:salary|compensation|remuneration|pay(?:\s*band)?|ctc|stipend|budget)"
        r"[^A-Za-z0-9]*(?:range\s+of|of|is|:)?\s*",
        "",
        line,
        flags=re.IGNORECASE,
    )
    return s


def canonicalize_salary(text: str, budget: str) -> str:
    """Rewrite every embedded salary figure in ``text`` to ``budget`` (when set) or strip it.

    Operates line by line so a line that becomes a bare salary stub can be dropped (returns an
    empty string for that line). A multi-figure line collapses to a SINGLE budget figure, so we
    never emit "4-5 LPA + 4-5 LPA". Non-salary numbers are left intact.
    """
    if not text:
        return text
    budget = (budget or "").strip()
    out: list[str] = []
    for raw in str(text).split("\n"):
        if not _has_salary(raw):
            out.append(raw)
            continue
        indent = raw[: len(raw) - len(raw.lstrip())]  # preserve bullet nesting indentation
        body = raw.strip()
        if budget:
            # Replace the first salary span with the budget; drop any further spans so the line
            # ends up with exactly one (canonical) figure.
            state = {"used": False}

            def _sub(_m, _state=state):
                if _state["used"]:
                    return ""
                _state["used"] = True
                return budget

            out.append(indent + _tidy(_SALARY_RE.sub(_sub, body)))
        else:
            stripped = _tidy(_SALARY_RE.sub("", body))
            # If only a salary label/punctuation is left, drop the whole line; otherwise keep
            # the non-salary remainder (e.g. "Competitive salary, health insurance" from a
            # mixed benefit line).
            if not re.search(r"[A-Za-z0-9]", _meaningful_remainder(stripped)):
                continue
            out.append(indent + stripped if stripped else "")
    return "\n".join(out)


def canonicalize_salary_list(items, budget: str) -> list[str]:
    """Apply :func:`canonicalize_salary` to each list item, dropping items that empty out."""
    result: list[str] = []
    for it in (items or []):
        s = canonicalize_salary(str(it), budget)
        if s.strip():
            result.append(s)
    return result


def parse_budget_ctc(text: str) -> tuple[int | None, int | None]:
    """Parse free-text budget ("4-5 LPA", "₹8,00,000", "18-24 LPA") into (min, max) rupees per
    year. Bare numbers < 100 are read as lakhs. Returns (None, None) when nothing parseable —
    so callers can show "—"/omit structured data rather than a fabricated figure."""
    if not text:
        return None, None
    nums = [int(float(x.replace(",", ""))) for x in re.findall(r"(\d+(?:\.\d+)?)", text)]
    if not nums:
        return None, None
    if len(nums) >= 2:
        a, b = nums[0], nums[1]
        lo, hi = min(a, b), max(a, b)
        if hi < 100:  # "4-5 LPA" -> lakhs
            return lo * 100000, hi * 100000
        return lo, hi
    val = nums[0]
    if val < 100:
        return int(val * 100000), int(val * 100000)
    return val, val


def salary_chip(hr) -> str:
    """The one salary string shown to candidates/boards: the recruiter's budget_ctc, trimmed."""
    return (getattr(hr, "budget_ctc", "") or "").strip()
