"""What the generate form asks for, per template.

Every template used to be offered the same sixteen boxes - name, designation, CTC, reporting
manager, notice period and the rest - whatever paper it was. On an agency contract that is
nonsense: there is no candidate and no salary, and the things it genuinely needs (the agency's
name, its registered office, its authorised signatory, the service, the fees) were not asked at
all, so they printed as blanks nobody could fill.

Each list here is exactly the set of context keys that template's builder reads AND that a
person has to supply: house constants (the People-team signatory, the entity's own address, the
governing law) are deliberately absent, because they are not decisions a recruiter makes.

type is one of: text | date | money | lines  (lines = a textarea, one list item per line).
"""
from __future__ import annotations


def _f(key: str, label: str, *, placeholder: str = "", required: bool = False,
       type: str = "text") -> dict:
    return {"key": key, "label": label, "placeholder": placeholder,
            "required": required, "type": type}


FIELDS: dict[str, list[dict]] = {
    # individual
    "ez_offer_letter": [
        _f("name", "Full name", placeholder="Priya Sharma", required=True),
        _f("designation", "Designation", placeholder="Senior Software Engineer", required=True),
        _f("manager", "Reporting manager's name", placeholder="Rahul Mehta", required=True),
        _f("manager_role", "Reporting manager's position", placeholder="Head of Engineering", required=True),
        _f("validity_date", "Offer valid till", placeholder="30 September 2026", required=True),
        _f("start_date", "Joining date", placeholder="1 October 2026", required=True),
        _f("responsibilities", "Job description (one duty per line)",
           placeholder="Leave blank to keep the standard write-up, or list the role's key duties", type="lines"),
        _f("annual_ctc", "Annual CTC", placeholder="9 LPA or 900000", required=True, type="money"),
        _f("comp_basic", "Basic salary (monthly)", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_hra", "HRA (monthly)", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_special", "Special allowance (monthly)", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_pf_employer", "Provident fund - employer", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_esi_employer", "ESI - employer", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_lwf_employer", "LWF - employer", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_health", "Health insurance premium", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_pf_employee", "Provident fund - employee", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_esi_employee", "ESI - employee", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_lwf_employee", "LWF - employee", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_bonus", "Performance bonus (monthly)", placeholder="Leave blank to compute from the CTC", type="money"),
    ],
    # individual
    "ez_traineeship_offer": [
        _f("name", "Trainee's full name", placeholder="Aarav Sharma", required=True),
        _f("designation", "Role (before 'Trainee')", placeholder="Digital Marketing", required=True),
        _f("manager", "Reporting mentor's name", placeholder="Priya Menon", required=True),
        _f("manager_role", "Mentor's designation", placeholder="Marketing Manager", required=True),
        _f("validity_date", "Offer valid till", placeholder="30 September 2026", required=True, type="date"),
        _f("start_date", "Training start date", placeholder="01 October 2026", required=True, type="date"),
        _f("annual_ctc", "Annual stipend", placeholder="3,00,000 or 3 LPA", required=True, type="money"),
        _f("comp_basic", "Basic salary (monthly)", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_hra", "HRA (monthly)", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_special", "Special allowance (monthly)", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_pf_employer", "Provident fund - employer", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_esi_employer", "ESI - employer", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_lwf_employer", "LWF - employer", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_health", "Health insurance premium", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_pf_employee", "Provident fund - employee", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_esi_employee", "ESI - employee", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_lwf_employee", "LWF - employee", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_bonus", "Performance bonus (monthly)", placeholder="Leave blank to compute from the CTC", type="money"),
    ],
    # individual
    "ez_full_contract": [
        _f("name", "Full name", placeholder="Priya Sharma", required=True),
        _f("address", "Permanent address", placeholder="House 12, Sector 45, Gurugram, Haryana 122003", required=True),
        _f("designation", "Designation", placeholder="Senior Software Engineer", required=True),
        _f("start_date", "Joining date", placeholder="01 October 2026", required=True, type="date"),
        _f("annual_ctc", "Annual CTC", placeholder="1800000 (or ”18 LPA”)", required=True, type="money"),
        _f("manager", "Reporting manager's name", placeholder="Rahul Mehta", required=True),
        _f("manager_role", "Reporting manager's position", placeholder="Engineering Manager", required=True),
        _f("approving_manager", "Approving manager's name", placeholder="Ananya Rao", required=True),
        _f("approving_manager_role", "Approving manager's position", placeholder="VP, Engineering", required=True),
        _f("comp_basic", "Basic salary (monthly)", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_hra", "HRA (monthly)", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_special", "Special allowance (monthly)", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_pf_employer", "Provident fund - employer", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_esi_employer", "ESI - employer", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_lwf_employer", "LWF - employer", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_health", "Health insurance premium", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_pf_employee", "Provident fund - employee", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_esi_employee", "ESI - employee", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_lwf_employee", "LWF - employee", placeholder="Leave blank to compute from the CTC", type="money"),
        _f("comp_bonus", "Performance bonus (monthly)", placeholder="Leave blank to compute from the CTC", type="money"),
    ],
    # individual
    "ez_nda": [
        _f("name", "Participant's full name", placeholder="Priya Sharma", required=True),
        _f("execution_date", "Date of execution", placeholder="5th day of September 2026"),
    ],
    # individual
    "ez_nda_tech": [
        _f("name", "Participant's full name", placeholder="e.g. Ananya Sharma", required=True),
        _f("execution_date", "Date of execution", placeholder="e.g. 12th day of September 2026 (leave blank to sign by hand)"),
    ],
    # agency
    "ez_agency_contract": [
        _f("agency_name", "Agency name", placeholder="Lingua Services Pvt Ltd", required=True),
        _f("agency_address", "Agency registered office address", placeholder="4th Floor, 12 MG Road, Bengaluru 560001, India", required=True),
        _f("agency_signatory_name", "Agency authorised signatory", placeholder="Ramesh Iyer", required=True),
        _f("agency_signatory_title", "Signatory's position at the agency", placeholder="Managing Director", required=True),
        _f("agency_poc_name", "Point of contact (if not the signatory)", placeholder="Leave blank to address the authorised signatory"),
        _f("service_type", "Type of services", placeholder="translation and localisation services", required=True),
        _f("service_name", "Name of the service", placeholder="Arabic-to-English document translation", required=True),
        _f("services", "Description of services (one per line)", placeholder="Arabic to English translation / Proofreading and QA / Certified transcript delivery", required=True, type="lines"),
        _f("fees", "Fees for service (one rate per line)", placeholder="USD 0.06 per source word / USD 25 per hour for proofreading", required=True, type="lines"),
        _f("commencement_date", "Engagement start date", placeholder="1 October 2026", required=True, type="date"),
        _f("effective_date", "Confidentiality agreement date", placeholder="1 October 2026", required=True, type="date"),
        _f("bank_name", "Agency's bank", placeholder="HDFC Bank Ltd"),
    ],
    # agency
    "ez_agency_nda": [
        _f("agency_name", "Agency name", placeholder="Lingua Services Pvt. Ltd.", required=True),
        _f("agency_address", "Agency registered office address", placeholder="4th Floor, Tower B, DLF Cyber City, Gurugram 122002, India", required=True),
        _f("agency_signatory_name", "Agency authorised signatory", placeholder="Rahul Mehta", required=True),
        _f("agency_signatory_title", "Signatory's position at the agency", placeholder="Managing Director", required=True),
        _f("service_type", "Type of services", placeholder="translation and localisation services", required=True),
        _f("effective_date", "Confidentiality agreement date", placeholder="1 October 2026", type="date"),
    ],
    # individual
    "aez_professional_service_contract": [
        _f("name", "Full name", placeholder="Aarav Sharma", required=True),
        _f("address", "Permanent address", placeholder="Flat 12B, Green Acres, Sector 44, Gurugram 122003", required=True),
        _f("designation", "Designation", placeholder="Presentation Designer", required=True),
        _f("start_date", "Engagement start date", placeholder="1 October 2026", required=True, type="date"),
        _f("manager", "Reporting manager's name", placeholder="Priya Nair", required=True),
        _f("manager_role", "Reporting manager's position", placeholder="Team Lead, Presentation Design", required=True),
        _f("approving_manager", "Approving manager's name", placeholder="Rahul Menon", required=True),
        _f("approving_manager_role", "Approving manager's position", placeholder="Head, Delivery", required=True),
    ],
    # individual
    "aez_professional_service_nda": [
        _f("name", "Participant's full name", placeholder="Aisha Rahman", required=True),
        _f("start_date", "Joining date", placeholder="15 October 2026", required=True, type="date"),
    ],
    # individual
    "aez_freelance_contract": [
        _f("name", "Freelancer's full name", placeholder="Aisha Rahman", required=True),
        _f("address", "Permanent address", placeholder="Flat 402, Al Nahda Tower, Sharjah, UAE", required=True),
        _f("designation", "Freelance role", placeholder="Graphic Design", required=True),
        _f("start_date", "Contract start date", placeholder="01 October 2026", required=True, type="date"),
        _f("manager", "Reporting manager's name", placeholder="Rahul Menon", required=True),
        _f("manager_role", "Reporting manager's position", placeholder="Design Lead", required=True),
        _f("approving_manager", "Approving manager's name", placeholder="Sana Qureshi", required=True),
        _f("approving_manager_role", "Approving manager's position", placeholder="Head, Creative Services", required=True),
    ],
    # individual
    "aez_freelance_nda": [
        _f("name", "Freelancer's full name", placeholder="Rahul Menon", required=True),
        _f("execution_date", "Date of execution", placeholder="__ day of _______ 20__"),
    ],
    # agency
    "aez_agency_contract": [
        _f("agency_name", "Agency name", placeholder="Pixelforge Design LLP", required=True),
        _f("agency_address", "Agency registered office address", placeholder="4th Floor, Tower B, Cyber Hub, Gurugram 122002, India", required=True),
        _f("agency_signatory_name", "Agency authorised signatory", placeholder="Rahul Menon", required=True),
        _f("agency_signatory_title", "Signatory's position at the agency", placeholder="Managing Partner", required=True),
        _f("agency_poc_name", "Point of contact (if not the signatory)", placeholder="Leave blank to address the signatory"),
        _f("service_type", "Type of services", placeholder="design agency", required=True),
        _f("service_name", "Name of the service", placeholder="presentation design services", required=True),
        _f("services", "Description of services (one per line)", placeholder="Basic Level Design / Intermediate Level Design / Customized Design Projects", required=True, type="lines"),
        _f("fees", "Fees for service (one rate per line)", placeholder="Basic slide: $8 per slide / High-end slide: $15 per slide / Hourly basis: $25 per hour", required=True, type="lines"),
        _f("commencement_date", "Contract start date", placeholder="01 October 2026", required=True, type="date"),
        _f("effective_date", "Confidentiality agreement date", placeholder="25 September 2026", required=True, type="date"),
        _f("bank_name", "Agency's bank", placeholder="HDFC Bank"),
    ],
    # agency
    "aez_agency_nda": [
        _f("agency_name", "Agency name", placeholder="Acme Design Studio LLC", required=True),
        _f("agency_address", "Agency registered office address", placeholder="Office 402, Business Bay, Dubai, UAE", required=True),
        _f("agency_signatory_name", "Agency authorised signatory", placeholder="Rahul Mehta", required=True),
        _f("agency_signatory_title", "Signatory's position at the agency", placeholder="Managing Director", required=True),
        _f("service_type", "Type of services", placeholder="graphic design", required=True),
        _f("effective_date", "Confidentiality agreement date", placeholder="1 October 2026", required=True, type="date"),
    ],
}


# Every letter prints a date at the top right ("Date: ..."). It defaults to the day the document
# is generated, but a recruiter often back- or forward-dates a letter, so it is offered as an
# editable box on every template rather than being silently stamped with today. Left blank, the
# render falls back to today's date (see render._resolve_context).
_LETTER_DATE = _f("letter_date", "Letter date (top right)",
                  placeholder="Leave blank for today, e.g. 13 September 2026")


def for_template(template_key: str) -> list[dict]:
    """The fields to ask for. An unknown key returns [] and the caller falls back to its own
    list, so a template added without an entry here is still usable rather than unfillable.

    Every known template also gets the editable top-right letter date appended, so the recruiter
    can set the date on any document without touching the template code."""
    fields = [dict(f) for f in FIELDS.get(template_key, [])]
    if fields:
        fields.append(dict(_LETTER_DATE))
    return fields
