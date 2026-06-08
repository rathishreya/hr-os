"""Compensation breakdown — turns an annual CTC into the EZ Lab salary structure used in
the offer letter / contract Compensation table (Annexure-2 / Schedule A).

The structure mirrors EZ Lab's actual letters:

    Basic + HRA + Special Allowance                          = Monthly Salary (A)
    PF(employer) + ESI(employer) + LWF(62) + Health(516)     = Employer Contribution (B)
    PF(employee) + ESI(employee) + LWF(31)                   = Employee Contribution (C)   [deducted from A]
    Monthly Salary (A) + Performance Bonus                    = Gross Salary (D)
    B + D                                                     = Total Monthly CTC
    Total Monthly CTC * 12                                    = Total Annual CTC

Statutory values follow Indian norms: PF is 12% of Basic capped at ₹1,800 (i.e. ₹15,000 basic
ceiling); ESI applies only when monthly gross ≤ ₹21,000 (employee 0.75%, employer 3.25%) and
in that bracket the company drops the separate ₹516 health-insurance premium (ESI covers it),
matching the trainee letter. LWF is the Haryana half-yearly figure shown in the letters.
"""
from __future__ import annotations

import re
from typing import Any

# Fixed statutory / policy constants from the EZ Lab letters.
PF_CAP = 1800            # 12% of the ₹15,000 PF wage ceiling
LWF_EMPLOYER = 62
LWF_EMPLOYEE = 31
HEALTH_PREMIUM = 516     # employer-paid health insurance (when ESI does not apply)
ESI_WAGE_CEILING = 21000
ESI_EMPLOYER_RATE = 0.0325
ESI_EMPLOYEE_RATE = 0.0075


def _inr(n: int) -> str:
    """Format an integer rupee amount with Indian digit grouping, e.g. 900000 -> '₹ 9,00,000'."""
    n = int(round(n))
    sign = "-" if n < 0 else ""
    s = str(abs(n))
    if len(s) <= 3:
        grouped = s
    else:
        head, tail = s[:-3], s[-3:]
        head = re.sub(r"(?<=\d)(?=(\d\d)+$)", ",", head)
        grouped = f"{head},{tail}"
    return f"₹ {sign}{grouped}"


def parse_ctc(value: Any) -> int | None:
    """Best-effort parse of an annual CTC (in rupees) from a number or free-text string like
    '20-28 LPA', '₹9,00,000', '9 lpa', '900000'. Returns None if nothing usable is found.

    For a range ('20-28 LPA') the upper bound is used — the offer is usually the agreed top of
    the band, and the recruiter can always override the exact figure at generation time.
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value) if value > 0 else None
    text = str(value).strip().lower()
    if not text or text.startswith("-"):  # negative CTC is not usable
        return None
    is_lpa = "lpa" in text or "lakh" in text or "lac" in text
    # Pull all numbers (allow decimals); strip thousands separators first. The pattern has no sign,
    # so the dash in a range like "20-28" splits cleanly into 20 and 28 (not a negative).
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", text.replace(",", ""))]
    if not nums:
        return None
    amount = max(nums)  # upper bound of any range
    if amount <= 0:  # "0", "0.0", "0 lpa" → not usable
        return None
    if is_lpa or amount < 1000:  # "9", "9.5", "20-28 LPA" → lakhs per annum
        amount *= 100000
    return int(round(amount))


def breakdown(annual_ctc: int | None) -> dict[str, Any]:
    """Compute the full EZ Lab compensation breakdown from an annual CTC (rupees).

    Returns a dict with raw integers (for any downstream math) and a `rows` list ready to render
    as the Compensation table: each row is {label, value, emphasis}. When `annual_ctc` is missing
    or non-positive, every amount is left as the '₹ —' placeholder so the recruiter fills it in.
    """
    if not annual_ctc or annual_ctc <= 0:
        return {"known": False, "rows": _placeholder_rows(), "notes": _NOTES, "annual_ctc": None}

    monthly_ctc = round(annual_ctc / 12)

    def _regime(esi_applies: bool):
        """Statutory pieces for one regime. Gross is the remainder (monthly − B) so Total Monthly
        CTC (B + D) always ties to the input. In the ESI regime employer statutory ≈ 9.25% of gross
        + LWF (no separate health premium); otherwise it's PF cap + LWF + health."""
        if esi_applies:
            est_gross = max(0, (monthly_ctc - LWF_EMPLOYER) / (1 + 0.06 + ESI_EMPLOYER_RATE))
            health_ = 0
        else:
            est_gross = max(0, monthly_ctc - PF_CAP - LWF_EMPLOYER - HEALTH_PREMIUM)
            health_ = HEALTH_PREMIUM
        # PF is 12% of Basic (~50% of gross) capped at the ceiling.
        pf_ = min(PF_CAP, round(est_gross * 0.5 * 0.12))
        esi_er = round(est_gross * ESI_EMPLOYER_RATE) if esi_applies else 0
        esi_ee = round(est_gross * ESI_EMPLOYEE_RATE) if esi_applies else 0
        b_ = pf_ + esi_er + LWF_EMPLOYER + health_
        return health_, pf_, esi_er, esi_ee, b_, monthly_ctc - b_

    # Apply ESI only if the gross actually printed lands within the ESI ceiling — so the ESI decision
    # can never contradict the gross shown on the letter.
    health, pf, esi_employer, esi_employee, employer_b, gross_d = _regime(True)
    if gross_d > ESI_WAGE_CEILING:
        health, pf, esi_employer, esi_employee, employer_b, gross_d = _regime(False)

    if gross_d <= 0:
        # CTC too small to cover the fixed employer statutory floor — fall back to placeholders
        # rather than printing negative pay components on a legal document.
        return {"known": False, "rows": _placeholder_rows(), "notes": _NOTES, "annual_ctc": None}

    employee_c = pf + esi_employee + LWF_EMPLOYEE
    monthly_a = gross_d  # performance bonus defaults to 0 → Gross (D) == Monthly Salary (A)
    basic = round(monthly_a * 0.5)
    hra = round(basic * 0.5)
    special = monthly_a - basic - hra  # absorbs rounding so Basic + HRA + Special == A
    total_monthly = employer_b + gross_d
    total_annual = total_monthly * 12

    rows = [
        {"label": "Basic Salary", "value": _inr(basic)},
        {"label": "HRA", "value": _inr(hra)},
        {"label": "Special Allowance", "value": _inr(special)},
        {"label": "Monthly Salary (A)", "value": _inr(monthly_a), "emphasis": True},
        {"label": "Provident Fund", "value": _inr(pf)},
        {"label": "ESI", "value": _inr(esi_employer)},
        {"label": "LWF", "value": _inr(LWF_EMPLOYER)},
        {"label": "Health Insurance Premium", "value": _inr(health)},
        {"label": "Statutory and Misc. Benefits Employer Contribution (B)", "value": _inr(employer_b), "emphasis": True},
        {"label": "Provident Fund", "value": _inr(pf)},
        {"label": "ESI", "value": _inr(esi_employee)},
        {"label": "LWF", "value": _inr(LWF_EMPLOYEE)},
        {"label": "Statutory Benefits Employee Contribution (C)", "value": _inr(employee_c), "emphasis": True},
        {"label": "Performance Bonus (Paid Quarterly, as per PPR) *", "value": _inr(0)},
        {"label": "Gross Salary (D)", "value": _inr(gross_d), "emphasis": True},
        {"label": "Total Monthly CTC (B+D)", "value": _inr(total_monthly), "emphasis": True},
        {"label": "Total Annual CTC", "value": _inr(total_annual), "emphasis": True},
    ]
    for r in rows:
        r.setdefault("emphasis", False)
    return {
        "known": True,
        "rows": rows,
        "notes": _NOTES,
        "annual_ctc": total_annual,
        "raw": {
            "basic": basic, "hra": hra, "special": special, "monthly_a": monthly_a,
            "pf": pf, "esi_employer": esi_employer, "esi_employee": esi_employee,
            "employer_b": employer_b, "employee_c": employee_c,
            "gross_d": gross_d, "total_monthly": total_monthly, "total_annual": total_annual,
        },
    }


_NOTES = [
    "Employee share of PF, ESI, LWF i.e. (C) shall be deducted from the Monthly Salary (A) mentioned above.",
    "Gratuity, as applicable under Payment of Gratuity Act, shall be over and above the CTC.",
    "The compensation shall be subject to Tax Deduction as per applicable slabs and regime.",
    "The performance bonus will be applicable after 3 months of your joining and is paid quarterly as per PPR ratings: "
    "A: Distinctive 125% · B: Meets Expectations 100% · C: Needs Improvement 75% · D: Needs Assistance 0% · E: Probation 0%.",
]

_COMP_LABELS = [
    "Basic Salary", "HRA", "Special Allowance", "Monthly Salary (A)", "Provident Fund", "ESI", "LWF",
    "Health Insurance Premium", "Statutory and Misc. Benefits Employer Contribution (B)", "Provident Fund",
    "ESI", "LWF", "Statutory Benefits Employee Contribution (C)", "Performance Bonus (Paid Quarterly, as per PPR) *",
    "Gross Salary (D)", "Total Monthly CTC (B+D)", "Total Annual CTC",
]
_EMPHASIS_LABELS = {
    "Monthly Salary (A)", "Statutory and Misc. Benefits Employer Contribution (B)",
    "Statutory Benefits Employee Contribution (C)", "Gross Salary (D)",
    "Total Monthly CTC (B+D)", "Total Annual CTC",
}


def _placeholder_rows() -> list[dict[str, Any]]:
    return [
        {"label": label, "value": "₹ —", "emphasis": label in _EMPHASIS_LABELS}
        for label in _COMP_LABELS
    ]
