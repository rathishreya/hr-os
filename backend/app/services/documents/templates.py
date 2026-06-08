"""The EZ Lab document templates, as structured blocks with placeholders.

These reproduce EZ Lab's real letters (supplied as PDFs): the full Employment Contract
(offer letter + Schedule A terms + Compensation table + Schedule B covenants), the short
Offer Letter (terms + Annexure-1 JD + Annexure-2 compensation + acceptance), and the
Traineeship Offer. A context dict fills the placeholders (name, designation, manager,
dates, responsibilities, CTC); compensation tables come from `comp.breakdown`.

Block shapes consumed by the frontend renderer (frontend/src/components/docs/DocumentBlocks.jsx):
  {"type": "heading", "level": 1|2|3, "text": str}
  {"type": "para", "text": str, "strong_prefix": str?, "align": "right"?, "muted": bool?}
  {"type": "list", "ordered": bool, "items": [str, ...]}
  {"type": "terms", "rows": [{"label": str, "blocks": [<para|list>, ...]}]}   # 2-col Schedule A table
  {"type": "comp", "rows": [{"label": str, "value": str, "emphasis": bool}], "notes": [str, ...]}
  {"type": "signature", "columns": [{"label": str, "name": str}, ...]}
  {"type": "divider"}
"""
from __future__ import annotations

from typing import Any

from . import comp

# ---- block constructors -------------------------------------------------------------------

def _h(level: int, text: str, underline: bool = False) -> dict:
    return {"type": "heading", "level": level, "text": text, "underline": underline}
def _p(text: str, **kw) -> dict: return {"type": "para", "text": text, **kw}
def _ol(items: list[str]) -> dict: return {"type": "list", "ordered": True, "items": list(items)}
def _ul(items: list[str]) -> dict: return {"type": "list", "ordered": False, "items": list(items)}
def _divider() -> dict: return {"type": "divider"}


def _terms(rows: list[tuple[str, list[dict]]]) -> dict:
    return {"type": "terms", "rows": [{"label": label, "blocks": blocks} for label, blocks in rows]}


def _comp_block(annual_ctc: int | None, *, extra_notes: list[str] | None = None) -> dict:
    b = comp.breakdown(annual_ctc)
    notes = list(b["notes"]) + list(extra_notes or [])
    return {"type": "comp", "rows": b["rows"], "notes": notes, "known": b["known"]}


def _signature(*columns: tuple[str, str]) -> dict:
    return {"type": "signature", "columns": [{"label": lbl, "name": name} for lbl, name in columns]}


# ---- shared boilerplate -------------------------------------------------------------------

def _responsibilities_blocks(ctx: dict) -> list[dict]:
    items = ctx.get("responsibilities") or ["[Responsibility 1]", "[Responsibility 2]", "[Responsibility 3]"]
    return [_p("Your key responsibilities would include:"), _ol(items)]


_EXCLUSIVITY = (
    "While employed by EZ Lab, you agree to work on a full-time basis exclusively for EZ Lab and agree "
    "that you shall not, while you are employed by EZ Lab, be employed or engaged in any capacity, in "
    "promoting, undertaking or carrying on any other business that competes with EZ Lab or interferes or "
    "could reasonably interfere with your duties to EZ Lab without our prior written permission."
)

_TERMINATION_DISCRETION = [
    "commit any act of gross misconduct;",
    "breach the Company's Code of Conduct or policies;",
    "commit any serious breach or repeatedly or continually commit a material breach of the terms of your employment with the Company;",
    "are guilty of conduct tending to bring yourself or the Company into disrepute;",
    "are convicted of a criminal offence;",
    "cease to hold the qualifications necessary for you to carry out your work with the Company;",
    "are found in an act of moral turpitude or to have indulged in violations of any laws, rule or regulations as applicable generally or in respect of the Company;",
    "are absent for a continuous period of 3+ business days which has not been duly authorized or approved by the Company (absconding and abandonment policy applicable); or",
    "provide false, inaccurate or incomplete information to the Company regarding your background (including but not limited to your educational background, professional/technical skills) and/or previous employment history.",
]

_NOTICE_BUYOUT = [
    "You may opt to buy out your notice period, subject to approval from both the Reporting Manager and the People Team.",
    "The buyout amount shall be calculated based on the employee's base salary for the unserved notice period and must be paid in full before the final clearance process is initiated.",
    "No leave adjustments shall be allowed against the notice period buyout. Any pending leave encashment shall be processed separately as per company policy.",
    "The buyout request must be submitted in writing and will only be considered valid upon formal approval from both the Reporting Manager and the People Team.",
    "The company reserves the right to reject a notice period buyout request based on business requirements or other operational considerations.",
]

_MISC_PROVISIONS = [
    "You shall be governed by the rules and regulations and policies of the organization, which are in force and/or are framed from time to time. The terms and conditions of service can be changed without any reference to you and the same shall be binding upon you as is applicable to other employees of your grade/level/function/department of the company. You will abide by the rules & regulations of the Company which are in force for the time being and/or which may be framed from time to time and you shall also ensure compliance to statutes, regulations and requirements laid down by various regulatory and statutory bodies including the Information Technology Act and its related rules and regulations.",
    "You shall communicate the change, if any, in your permanent/present residential address/telephone/mobile number hereafter immediately, failing which communication sent to you at your notified address shall be deemed to have been received by you.",
    "You shall throughout your service with the company, conduct yourself in a manner befitting a responsible employee of the company and maintain absolute integrity. In case your behaviour or conduct is found wanting or undesirable, the company reserves the right to terminate your services without any compensation, notice or salary in lieu thereof.",
    "In the event of your resignation from the Company or leaving the company due to any other reason, you will not use / utilize / provide any work / material / information that may be either produced or acquired by you during your tenure with the Company. The Company reserves the right to initiate appropriate legal action and claim appropriate damages in the event of your failure to comply with this provision, resulting in any financial / non-financial loss to the Company.",
    "The company reserves the right to get you medically examined by a medical practitioner nominated by the company and your further employment will depend on your being found fit.",
    "You will not accept any present, commission or any sort of gratification in cash or kind from any person, party, firm or company having dealing with the Company and if you are offered any, you should immediately report the same to the Management.",
    "If any provision of this letter is held to be invalid or unenforceable, then such provision shall so far as it is invalid or unenforceable, be given no effect and shall be deemed to be included in this letter but without invalidating any of the remaining provisions of this letter.",
    "Any dispute arising out of this employment shall be referred to the exclusive jurisdiction of court in Gurgaon, INDIA only.",
]

_SCHEDULE_B_COVENANTS = [
    "Employment with EZ Lab as an employee or engagement with EZ Lab as an independent contractor, as the case may be (the “**Engagement**”), will give the Participant access to proprietary and confidential information belonging to EZ Lab, its customers, its suppliers and others (the proprietary and confidential information is collectively referred to in this Agreement as “**Confidential Information**”). Confidential Information includes but is not limited to customer lists, marketing plans, proposals, contracts, technical and/or financial information, databases, software and know-how. All Confidential Information remains the confidential and proprietary information of EZ Lab.",
    "As referred to herein, the “Business of EZ Lab” shall relate to the business of EZ Lab as the same is determined by the Proprietor of EZ Lab from time to time.",
    "The Participant may in the course of the Engagement conceive, develop or contribute to material or information related to the Business of EZ Lab, including, without limitation, software, technical documentation, ideas, inventions (whether or not patentable), hardware, know-how, marketing plans, designs, techniques, documentation and records (referred to in this Agreement as “**Proprietary Property**”). EZ Lab shall exclusively own all Proprietary Property which the Participant conceives, develops or contributes to in the course of the Engagement and all intellectual and industrial property and other rights of any kind in or relating to the Proprietary Property. For greater certainty, the Participant hereby assigns to EZ Lab any and all rights that the Participant may have or obtain in or to the Proprietary Property.",
    "The Participant shall, both during and after the Engagement, keep all Confidential Information and Proprietary Property confidential and shall not use any of it except for the purpose of carrying out authorized activities on behalf of EZ Lab, save for information that is or becomes public other than through a breach, was already known without obligation of confidentiality, or is required to be disclosed by law.",
    "The Participant shall return or destroy, as directed by EZ Lab, Confidential Information and Proprietary Property to EZ Lab upon request at any time, and shall certify by way of affidavit or statutory declaration that all such Confidential Information and Proprietary Property has been returned or destroyed, as applicable.",
    "The Participant covenants and agrees not to make any unauthorized use whatsoever of, or to bring onto EZ Lab's premises, any trade secrets, confidential information or proprietary property of any third party during the course of the Engagement. The Participant represents that the Engagement and the execution of this Agreement do not and will not breach any agreement to which the Participant is currently a party.",
    "At the reasonable request and at the sole expense of EZ Lab, the Participant shall do all reasonable acts and sign all reasonable documentation necessary to ensure EZ Lab's ownership of the Proprietary Property and all intellectual and industrial property rights in the same, anywhere in the world.",
    "The Participant hereby irrevocably and unconditionally waives all moral rights the Participant may now or in the future have in any Proprietary Property.",
    "The Participant agrees that the Participant will, if requested from time to time by EZ Lab, execute such further reasonable agreements as to confidentiality and proprietary rights as EZ Lab's customers or suppliers reasonably require.",
    "Regardless of any changes in position, salary or otherwise, including termination of the Engagement, the Participant will continue to be subject to each of the terms and conditions of this Agreement.",
    "The Participant agrees that the Participant's sole and exclusive remedy for any breach of this Agreement by EZ Lab will be limited to monetary damages and that the Participant will not make any claim in respect of any rights to or interest in any Confidential Information or Proprietary Property.",
    "The Participant agrees that, during the term of this Agreement and for one (1) year after termination for any reason, he or she will not hire or solicit nor attempt to hire or solicit EZ Lab's employees (or any person employed by EZ Lab within the past one year) without the prior written consent of EZ Lab.",
    "The Participant acknowledges that, during the term of this Agreement, he or she may become familiar with Confidential Information concerning Related Companies, and therefore agrees that during the term of this Agreement and for a period of two years thereafter (the “Noncompete Period”), he or she will not directly or indirectly engage in, or invest in or lend money to, any business which is competitive with any business conducted by any System owned or managed by any Related Company.",
    "The Participant acknowledges that the services provided are unique and that irreparable harm will be suffered by EZ Lab in the event of breach, and that EZ Lab will be entitled to seek, in addition to any other remedies, a temporary or permanent injunction restraining the Participant from continuing any such breach.",
    "This Agreement is governed by the laws of India and the Participant agrees to the non-exclusive jurisdiction of the courts of New Delhi in relation to this Agreement.",
    "If any provision of this Agreement is held by a court of competent jurisdiction to be invalid or unenforceable, that provision shall be deleted, and the other provisions shall remain in effect.",
]


def _witness(ctx: dict) -> list[dict]:
    sig = f"{ctx['signatory_name']} – {ctx['signatory_title']}"
    return [
        _p(f"IN WITNESS WHEREOF {ctx['legal_entity']} has caused this Agreement to be executed as of {ctx['start_date']}.", strong_prefix="IN WITNESS WHEREOF"),
        _p("Signed in the presence of:"),
        _signature(("PARTICIPANT", ctx["name"]), ("WITNESS to PARTICIPANT", sig)),
    ]


# ---- templates ----------------------------------------------------------------------------

def employment_contract(ctx: dict) -> dict:
    name, le = ctx["name"], ctx["legal_entity"]
    blocks: list[dict] = [
        _p(f"Reference: {ctx['reference']}", align="right", muted=True),
        _p(f"Date: {ctx['letter_date']}", align="right", muted=True),
        _p(name, strong_prefix=name),
        _p(ctx["address"], muted=True),
        _p(f"Dear {name},"),
        _p(f"We are pleased to confirm this offer of employment to you for a regular full-time position with "
           f"**{le.upper()}** (hereinafter referred to as EZ Lab) as a **{ctx['designation']}** effective {ctx['start_date']}. "
           "As discussed, this offer is conditional upon completion of satisfactory references that could include, but "
           "is not necessarily limited to, a review of past employment and education records."),
        _p("The details of our offer, including the terms and conditions of your employment, are attached as "
           "Schedule **“A”**. This letter, along with the enclosed schedules, outlines the obligations of both EZ "
           "Lab and yourself, and will form our agreed upon employment contract with you once signed."),
        _p("Accepting employment will be conditional upon agreeing to and signing the attached copy of this letter "
           "and the attached Schedule(s), initialing each page in the right-hand corner, and returning it to us prior "
           "to your first day of employment."),
        _p(f"{name}, we look forward to welcoming you to the EZ Lab team and wish you a successful and rewarding career with us."),
        _p("Sincerely,"),
        _p(ctx["signatory_name"], strong_prefix=ctx["signatory_name"]),
        _p(ctx["signatory_title"], muted=True),
        _p(f"I, {name}, acknowledge that I have read, understood and accept this offer and the terms and conditions "
           "contained in the attached Schedule(s), and agree to be bound by the terms and conditions of employment as outlined therein."),
        _signature(("Signature", ""), ("Date", "")),
        _divider(),
        _h(1, "Schedule A — Terms and Conditions of Employment"),
        _p("The following outlines the terms and conditions of employment with EZ Lab. EZ Lab reserves the right to "
           "change these terms and conditions as necessary, with due notice."),
        _terms([
            ("Title", [_p(ctx["designation"])]),
            ("Reporting Relationship", [_p(ctx["manager"])]),
            ("Responsibilities", _responsibilities_blocks(ctx) + [_p(_EXCLUSIVITY)]),
            ("Location", [_p(ctx["location"])]),
            ("Joining Bonus", [_p("N/A")]),
            ("Bond", [_p("N/A")]),
            ("Status", [_p("Full-time")]),
            ("Start Date", [_p(ctx["start_date"])]),
            ("Hours of Work", [_p(ctx["hours_of_work"])]),
            ("Overtime", [_p("There is no provision for payment for overtime. We track output and you will be paid for additional output as defined in the Bonus/Incentive section.")]),
            ("Payroll Schedule", [_p("Salary will be paid monthly, with deductions for statutory obligations including but not limited to PF, ESIC, TDS, LWF, Professional Tax as applicable from time to time.")]),
            ("Vacation", [_p("You shall be entitled to leaves and annual holidays as per the rules of the company.")]),
        ]),
        _h(2, "Compensation"),
        _comp_block(ctx.get("annual_ctc")),
        _terms([
            ("Benefits", [_p("You shall be entitled to participate in all benefit plans of EZ Lab as may be made available to employees of EZ Lab from time to time for which you are eligible.")]),
            ("Travel", [_p("You will need to travel for work as required. You are required to maintain a valid passport during your tenure at EZ Lab.")]),
            ("Nature of Employment", [_p("You will be a permanent employee of the Company from the date of your joining and will be entitled to all the benefits and facilities applicable to the rest of the employees. Your position is a wholetime employment with the Company and you shall devote yourself exclusively to the business and interests of the Company.")]),
            ("Retirement Age", [_p("Your age of retirement from the services of the company will be 58 (Fifty-Eight) years. The date of birth as submitted by you at the time of joining will be treated as binding and final.")]),
            ("Place of Posting & Transfer", [_p("Your initial place of posting will be at GURGAON (India). However, your services are liable to be transferred/lent to any place/branch of our organization or subsidiary and/or associated company in India or abroad, at the sole discretion of the Management.")]),
            ("Policies and Standards", [_p("During the period of your employment with us, you agree to be bound by EZ Lab's policies and standards, and any future policies and standards that are reasonably introduced. It is agreed that these policies do not form a part of this Agreement and that their introduction, amendment or deletion does not constitute a breach of this Agreement.")]),
            ("Confidentiality & Intellectual Property", [_p("Our offer of employment is conditional upon you agreeing to and abiding by the “Confidentiality and Proprietary Information Agreement”, attached as Schedule “B”.")]),
            ("Non-Solicitation", [_p("You agree that, while you are employed by EZ Lab and for one (1) year following termination, you will not (i) recruit or attempt to recruit any EZ Lab employee, or (ii) solicit or interfere with any customer or supplier of EZ Lab in a manner that conflicts with the business of EZ Lab.")]),
            ("Representation", [_p("You represent and warrant that you are not party to any written or oral agreement with any third party that would restrict your ability to enter into this Agreement, and that you will not, by joining EZ Lab, breach any covenant in favour of any third party.")]),
            ("Changes to Duties and/or Compensation", [_p("If your duties or compensation change during the course of your employment, the validity of this agreement will not be affected. If one or more provisions are deemed void by law, the remaining provisions continue in full force and effect.")]),
            ("Termination", [
                _p(f"This agreement can be terminated by either side by giving {ctx['notice_period']} written notice or payment of {ctx['notice_period']} Base Salary and all admissible allowances in lieu of such notice. The notice period shall commence on the date the resignation is formally approved/accepted via email by either the Manager or the People Team."),
                _p("Notice Period Buyout:"),
                _ol(_NOTICE_BUYOUT),
                _p("The Company may at its absolute discretion terminate your employment immediately without notice, or pay in lieu thereof, if at any time during your employment you:"),
                _ol(_TERMINATION_DISCRETION),
            ]),
            ("Company's Honor Code & Workplace Guidelines", [_p("During the course of your employment, you will be required to adhere to the Code of Conduct of the Company and follow the Workplace Guidelines and Policies as compiled in the HR Handbook of the Company.")]),
            ("Misc. Provisions", [_ol(_MISC_PROVISIONS)]),
            ("Legal Advice", [_p("If you are uncertain about the contents of this offer, we suggest that it may be advisable to seek independent legal advice prior to signing.")]),
        ]),
        *_witness(ctx),
        _divider(),
        _h(1, "Schedule B — Employee Covenants"),
        _h(3, "Confidentiality and Proprietary Information Agreement"),
        _p(f"In consideration of employment as an employee or engagement as an independent contractor with {le} "
           "(“EZ Lab”), the undersigned (the “**Participant**”) agrees and covenants as follows:"),
        _ol(_SCHEDULE_B_COVENANTS),
        *_witness(ctx),
    ]
    return {"title": f"Employment Contract — {name}", "doc_type": "employment_contract", "blocks": blocks}


def nda(ctx: dict) -> dict:
    name, le = ctx["name"], ctx["legal_entity"]
    blocks: list[dict] = [
        _h(1, "Confidentiality and Proprietary Information Agreement"),
        _p(f"Reference: {ctx['reference']}", align="right", muted=True),
        _p(f"Date: {ctx['letter_date']}", align="right", muted=True),
        _p(f"In consideration of employment as an employee or engagement as an independent contractor with {le} "
           "(“EZ Lab”), the undersigned (the “**Participant**”) agrees and covenants as follows:"),
        _ol(_SCHEDULE_B_COVENANTS),
        *_witness(ctx),
    ]
    return {"title": f"NDA / Confidentiality Agreement — {name}", "doc_type": "nda", "blocks": blocks}


def _offer_letter_common(ctx: dict, *, subject: str, terms_items: list[dict], jd_intro: str,
                         jd_extra: list[dict] | None, comp_extra_notes: list[str] | None,
                         join_para: str, doc_type: str, title_prefix: str) -> dict:
    name, le = ctx["name"], ctx["legal_entity"]
    blocks: list[dict] = [
        _p("To"),
        _p(name, strong_prefix=name),
        _h(2, f"SUBJECT: {subject}", underline=True),
        _p(f"Dear {name},"),
        _p(f"In furtherance to your application and subsequent discussions held between us, we are glad to offer you "
           f"the position of **{ctx['designation']}** to be initially based at Gurugram, Haryana, at the below stated address:"),
        _p(ctx["company_address"], muted=True),
        _p("We would like to share with you the Terms & Conditions of this Offer:"),
        *terms_items,
        _p(join_para),
        _p("Congratulations on this exciting advancement in your career that comes your way by means of this offer. We welcome you to the EZ team."),
        _p("Best Wishes!"),
        _p(ctx["signatory_name"], strong_prefix=ctx["signatory_name"]),
        _p(ctx["signatory_title"], muted=True),
        _p(le, muted=True),
        _divider(),
        _h(1, "Annexure - 1", underline=True),
        _p(jd_intro, strong_prefix="THE HIGH-LEVEL JOB-DESCRIPTION IS AS BELOW:" if jd_intro.startswith("THE") else None),
        _ol(ctx.get("responsibilities") or ["[Responsibility 1]", "[Responsibility 2]", "[Responsibility 3]"]),
        *(jd_extra or []),
        _h(1, "Annexure - 2", underline=True),
        _p("Compensation would be as follows:"),
        _comp_block(ctx.get("annual_ctc"), extra_notes=comp_extra_notes),
        _divider(),
        _h(2, "Acceptance", underline=True),
        _p("I have read and understood the terms & conditions and also agree that the Remuneration and other details "
           "are Confidential between the Organization and me. I undertake that there would be no breach of this Confidentiality."),
        _p("I undertake that in case of my not joining the Organisation after acceptance of this Offer, I shall be liable "
           "to pay the Organisation a sum equal to one month total remuneration as offered to me in this Offer Letter, as "
           "reimbursement of the expenses incurred for conducting my interview and for the losses caused due to my non-joining."),
        _p("I hereby accept the offer of employment on the said terms & conditions."),
        _signature(("Mr./Ms.", ""), ("Date", "")),
    ]
    return {"title": f"{title_prefix} — {name}", "doc_type": doc_type, "blocks": blocks}


def offer_letter(ctx: dict) -> dict:
    notice = ctx["notice_period"]
    terms_items = [
        _p("This Offer would become Effective and Enforceable on its Acceptance by you in the manner prescribed hereinafter.", strong_prefix="Effectiveness"),
        _p(f"You shall report to {ctx['manager']} and shall perform the functions as detailed under Annexure-1 herein.", strong_prefix="Duties & Responsibilities"),
        _p("Your future growth and Compensation shall entirely depend on your contribution to the business success and overall organisation performance. We follow a Work Oriented Appraisal Policy.", strong_prefix="Performance Evaluation & Compensation Revision"),
        _p("You will be entitled to leaves with company policies and the holiday calendar. Leaves are to be taken at such time as is acceptable to EZ.", strong_prefix="Vacation"),
        _p("You shall be covered under the provisions of Provident Fund Scheme, ESI Scheme and Professional Tax as applicable from time to time. All compensation, incentives & monetary rewards shall be subject to tax deduction.", strong_prefix="Statutory Coverage"),
        _p("The compensation will become payable after completion of one month of the job. Your compensation details are attached in Annexure-2 herein.", strong_prefix="Compensation"),
        _p(f"During the first 3 months of your joining, your employment shall be subject to 15 days' notice or equivalent payment in lieu from either side. After completion of 3 months, either side can terminate the employment after giving a notice of {notice}, or by paying the salary in lieu of the notice period.", strong_prefix="Termination"),
        _p("This Offer, on its acceptance, shall be enforceable by and before the Civil Courts/Authorities at Gurugram only.", strong_prefix="Enforceability"),
        _p("Background verification is a part of onboarding and is still in process. It will take 1-2 weeks to complete; we might reconsider the offer if the results don't turn out to be positive.", strong_prefix="Subject to Confirmation"),
        _p(f"This Offer shall be valid till {ctx['validity_date']}. Please convey your acceptance within this period, failing which the offer shall be considered null & void.", strong_prefix="Validity"),
    ]
    return _offer_letter_common(
        ctx,
        subject=f"OFFER FOR THE POSITION OF {ctx['designation'].upper()}",
        terms_items=terms_items,
        jd_intro="THE HIGH-LEVEL JOB-DESCRIPTION IS AS BELOW:",
        jd_extra=None,
        comp_extra_notes=None,
        join_para=f"You are requested to join us on {ctx['start_date']}. Other formalities shall be completed after your joining.",
        doc_type="offer_letter",
        title_prefix="Offer Letter",
    )


_TRAINEE_CLAUSES = [
    "During your training period, you are expected to devote your time and efforts solely to EZ Lab Private Limited work. You are also required to let your mentor know about forthcoming events (if any) in advance so that your work can be planned accordingly.",
    "All the work that you will produce at or in relation to EZ Lab Private Limited will be the intellectual property of EZ Lab Private Limited. You are not allowed to store, copy, sell, share, or distribute it to a third party under any circumstances.",
    "We take data privacy and security very seriously; maintaining confidentiality of any students, customers, clients, and companies' data that you may access during your training period will be your responsibility. EZ Lab operates on a zero-tolerance principle with regard to any breach of data security guidelines.",
    "During the appointment period you shall not engage yourself directly or indirectly in any other organization (other than your college). In the event of breach of this condition, this appointment is liable to be terminated forthwith.",
    "You are expected to conduct yourself with utmost professionalism in dealing with your mentor, team members, colleagues, clients and customers, and treat everyone with due respect.",
]


def traineeship_offer(ctx: dict) -> dict:
    terms_items = [
        _p("This Offer would become Effective and Enforceable on its Acceptance by you in the manner prescribed hereinafter.", strong_prefix="Effectiveness"),
        _p(f"You shall report to {ctx['manager']} and shall perform the functions as detailed under Annexure-1 herein.", strong_prefix="Duties & Responsibilities"),
        _p("Your future growth and Compensation shall entirely depend on your contribution to the business success and overall organisation performance. We follow a Work Oriented Appraisal Policy.", strong_prefix="Performance Evaluation & Compensation Revision"),
        _p("You will be entitled to leaves with company policies and the holiday calendar. Leaves are to be taken at such time as is acceptable to EZ.", strong_prefix="Vacation"),
        _p("You shall be covered under the provisions of Provident Fund Scheme, ESI Scheme and Professional Tax as applicable from time to time.", strong_prefix="Statutory Coverage"),
        _p("The compensation will become payable after completion of one month of the job. Your compensation details are attached in Annexure-2 herein.", strong_prefix="Compensation"),
        _p("During the training period, your employment shall be subject to 15 days' notice or equivalent payment in lieu of notice from either side.", strong_prefix="Termination"),
        _p("This Offer, on its acceptance, shall be enforceable by and before the Civil Courts/Authorities at Gurugram only.", strong_prefix="Enforceability"),
        _p("Background verification is a part of onboarding and is still in process. It will take 1-2 weeks to complete; we might reconsider the offer if the results don't turn out to be positive.", strong_prefix="Subject to Confirmation"),
        _p(f"This Offer shall be valid till {ctx['validity_date']}. Please convey your acceptance within this period, failing which the offer shall be considered null & void.", strong_prefix="Validity"),
    ]
    return _offer_letter_common(
        ctx,
        subject=f"OFFER FOR THE POSITION OF {ctx['designation'].upper()} TRAINEE",
        terms_items=terms_items,
        jd_intro="THE HIGH-LEVEL JOB-DESCRIPTION IS AS BELOW:",
        jd_extra=[_p(c) for c in _TRAINEE_CLAUSES],
        comp_extra_notes=[
            "A Pre-Placement Offer (PPO) may be extended based on your performance during the training period, with a "
            "potential full-time compensation package, subject to confirmation in writing.",
        ],
        join_para=f"You are requested to join us on {ctx['start_date']}. The training period will span approximately 3 to 6 months. Other formalities shall be completed after your joining.",
        doc_type="traineeship_offer",
        title_prefix="Traineeship Offer Letter",
    )
