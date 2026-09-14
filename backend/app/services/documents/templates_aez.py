"""ArabEasy (AEZ) document templates — the entity's own letters, kept separate from EZ Lab's.

Why a separate module from templates_ez.py: ArabEasy issues its own letterhead, registered
office and clause wording. A letter that is genuinely identical boilerplate can live in either
module registered as ("EZ", "AEZ"); anything ArabEasy words differently belongs here, so a
change to an EZ Lab letter can never silently alter an ArabEasy one.

To add a template: write a builder `def <name>(ctx: dict) -> dict` returning
{"title", "doc_type", "blocks"} composed with the constructors in blocks.py, then call
register(...) beneath it with entity="AEZ" and the rest of the taxonomy axes.

Keys are globally unique across both entities (prefix them `aez_`), because documents.template_key
stores the bare key and existing rows must keep resolving to the template they were drafted from.
"""
from __future__ import annotations

from typing import Any  # noqa: F401

from . import blocks as b
from .registry import register


# ── Coins conversion rate list ──────────────────────────────────────────────────────────────
# Transcribed verbatim from the source contract, including the repeated
# "Presentation_QA ~ Hours ~ English ~ English" row that appears in the original.
_COINS_RATE_LIST = [
    ("Presentation_QA ~ Hours ~ English ~ English", "83", "15.0%"),
    ("Basic Design ~ Slides ~ English ~ English", "100", "15.0%"),
    ("Basic Design ~ Slides ~ Arabic ~ Arabic", "100", "15.0%"),
    ("Basic Design ~ Hours ~ English ~ English", "450", "15.0%"),
    ("Basic Design ~ Hours ~ Arabic ~ Arabic", "500", "15.0%"),
    ("Presentation_QA ~ Slides ~ English ~ English", "33", "15.0%"),
    ("Presentation_QA ~ Hours ~ English ~ English", "83", "15.0%"),
    ("Interactive Presentation ~ Hours ~ English ~ English", "500", "15.0%"),
    ("Interactive Presentation ~ Hours ~ Arabic ~ Arabic", "500", "15.0%"),
    ("Animated Presentation ~ Hours ~ English ~ English", "500", "15.0%"),
    ("Animated Presentation ~ Hours ~ Arabic ~ Arabic", "500", "15.0%"),
    ("Word Formatting ~ Hours ~ Arabic ~ Arabic", "500", "15.0%"),
    ("Word Formatting ~ Hours ~ English ~ English", "500", "15.0%"),
    ("Excel Formatting ~ Hours ~ English ~ English", "500", "15.0%"),
    ("Excel Formatting ~ Hours ~ Arabic ~ Arabic", "500", "15.0%"),
    ("High End Design ~ Slides ~ English ~ English", "240", "15.0%"),
    ("High End Design ~ Slides ~ Arabic ~ Arabic", "250", "15.0%"),
    ("Presentation_QA ~ Slides ~ Arabic ~ Arabic", "33", "15.0%"),
    ("Presentation_QA ~ Hours ~ Arabic ~ Arabic", "83", "15.0%"),
]

_TERMINATION_FOR_CAUSE = [
    "commit any act of gross misconduct;",
    "breach the Company’s Code of Conduct or policies;",
    "commit any serious breach or repeatedly or continually commit a material breach of the terms "
    "of your contract with the Company;",
    "are guilty of conduct tending to bring yourself or the Company into disrepute;",
    "are convicted of a criminal offence,",
    "cease to hold the qualifications necessary for you to carry out your work with the Company;",
    "are found in an act of moral turpitude or to have indulged in violations of any laws, rule or "
    "regulations as applicable generally or in respect of the Company;",
    "are absent for a continuous period of 3+ business days which has not been duly authorized or "
    "approved by the Company (absconding and abandonment policy applicable); or",
    "provide false, inaccurate or incomplete information to the Company regarding your background "
    "(including but not limited to your educational background, professional/ technical skills) "
    "and/or previous work history.",
]

_NOTICE_TIERS = [
    "Where the Professional Service Expert has completed up to one (1) year of continuous service "
    "with the Company, the applicable notice period shall be fifteen (15) days.",
    "Where the Professional Service Expert has completed more than one (1) year but up to two (2) "
    "years of continuous service with the Company, the applicable notice period shall be thirty "
    "(30) days.",
    "Where the Professional Service Expert has completed more than two (2) years of continuous "
    "service with the Company, the applicable notice period shall be forty-five (45) days.",
]


def _psc_responsibilities(responsibilities: list[str] | None = None) -> list[dict]:
    """The duties clause. What the recruiter typed wins; blank keeps the transcribed list."""
    if responsibilities:
        return [b.p("Your key responsibilities would include:"), b.ul(list(responsibilities))]
    return [
        b.p("Your key responsibilities would include:"),
        b.p("**1. Basic Designing:**"),
        b.ul([
            "Alignment Check: Ensuring that the icons, images, and text are aligned perfectly in "
            "the slide layout.",
            "Consistency Check: Ensuring uniformity and avoiding any conflict between backgrounds, "
            "colors, fonts, shapes and the overall theme.",
            "Adherence to Company Check: Following the brand guidelines and maintaining the brands "
            "own PowerPoint theme or template.",
            "Design Elements Revamp: Adapting and improving graphic elements like background and "
            "typography to match latest trends on all PowerPoint slides.",
            "Graphic Designing as and when required.",
        ]),
        b.p("**2. Advance Designing:**"),
        b.ul([
            "Iconography: Using unique and customized icons throughout the PowerPoint presentation "
            "to complement the content and design.",
            "Dynamic Charts and Graphs: Concept creation for any simple charts and graphs to "
            "showcase demographically.",
            "Content Restructuring: Changing the content structure and format to enhance and "
            "simplify the layout, navigation, and information flow of the PPT.",
            "Template Creation: Updating the existing template or creating a brand-new template "
            "that can be used to design all future PowerPoint presentations.",
            "Graphic Designing as and when required.",
        ]),
        b.p(
            "3. Your job description, duties and obligations may change from time to time as per "
            "the Employer’s requirements."
        ),
        b.p(
            "4. You shall always exercise professional skills and duty of care towards the Employer "
            "and its clients in the performance of duties."
        ),
        b.p(
            "5. For the term of your full-time contract, you acknowledge and agree that you shall"
        ),
        b.ul([
            "i. be employed solely by the Employer",
            "ii. not serve any clients or otherwise provide any professional and/or technical "
            "service to anyone either in your private capacity or on behalf of any third party.",
        ]),
        b.p(
            "6. For the term of your full-time contract, you will not conduct any business or hold "
            "an interest in any business for personal or professional gain without the prior "
            "written approval of the Employer."
        ),
        b.p(
            "7. You shall, at all times and in all respects, comply with the Employer’s policies, "
            "disciplinary procedures, house rules, codes of conduct, rules and regulations, "
            "statements of principles adopted by the Employer from time to time."
        ),
        b.p("**Operating Model**"),
        b.p("**1. Shift allocation:**"),
        b.ul([
            "At the start of each month you are provided with a shift calendar. This shift calendar "
            "is aligned with one of the 4 operations teams and includes you, inhouse and "
            "contractual Presentation Designers.",
            "You need to be available within shift hours and respond to the Operations team within "
            "10 -15 mins, no response will be considered as unavailable and hence marked as "
            "\"unpaid leave\" for that day.",
        ]),
        b.p("**2. Work Allocation:**"),
        b.ul([
            "Work gets allocated to you during this shift and you are expected to complete the work "
            "from home after the shift hours are complete. You will not be allocated more work "
            "beyond your shift hours.",
        ]),
        b.p("**3. Leaves:**"),
        b.ul([
            "You can apply for leaves (casual leaves, sick leaves, compensatory leaves or work from "
            "home) through ERP.",
            "Approval on your leaves by your reporting manager is mandatory.",
        ]),
    ]


def _psc_termination() -> list[dict]:
    return [
        b.p(
            "Subject to the terms and conditions set forth herein, the following provisions shall "
            "govern the resignation or termination of Professional Service Agreement by either the "
            "Professional Service Expert or the Company."
        ),
        b.p("**1. Resignation by Professional Service Expert**"),
        b.p(
            "In the event the Professional Service Expert wishes to terminate the Professional "
            "Service Agreement, the Professional Service Expert shall provide written notice to the "
            "Company in accordance with the following notice period requirements:"
        ),
        b.ul(_NOTICE_TIERS),
        b.p(
            "The notice period shall commence from the date the resignation is formally acknowledged "
            "by the Reporting Manager or the People Team."
        ),
        b.p(
            "The Professional Service Expert shall continue to diligently perform their duties "
            "during the notice period and shall complete all assigned work, pending deliverables, "
            "documentation, handover, and knowledge transfer activities as reasonably required by "
            "the Company."
        ),
        b.p(
            "The Company reserves the right, at its sole discretion, to reduce, waive, or modify the "
            "notice period based on business requirements, operational considerations, project "
            "commitments, client obligations, completion of handover requirements, or any other "
            "relevant factors. Any such reduction, waiver, or modification shall be effective only "
            "upon written confirmation from the Company. The Professional Service Expert's Full and "
            "Final Settlement shall be calculated and processed based on the Professional Service "
            "Expert's last working day with the Company and shall be subject to applicable "
            "deductions, recoveries, Company policies, and statutory requirements."
        ),
        b.p(
            "The Professional Service Expert shall not absent themselves from work, discontinue "
            "services, or avail any unauthorized leave during the notice period without prior "
            "written approval from the Company. Any unauthorized absence may be dealt with in "
            "accordance with applicable Company policies."
        ),
        b.p(
            "The Company shall have the right to determine the Professional Service Expert’s working "
            "arrangement during the notice period, including shifts, based on the nature of the "
            "role, business requirements, project/client commitments, and criticality of the "
            "handover process."
        ),
        b.p("**2. Termination by Company**"),
        b.p(
            "The Company may terminate the Professional Service Expert's Professional Service "
            "Agreement by providing written notice or payment of Base Salary together with all "
            "admissible allowances in lieu of notice, in accordance with the following notice period "
            "requirements:"
        ),
        b.ul(_NOTICE_TIERS),
        b.p(
            "The Company reserves the right to determine, at its sole discretion and subject to "
            "applicable laws, whether the Professional Service Expert shall serve the notice period "
            "in whole, or be relieved immediately upon payment of base salary in lieu of the "
            "applicable notice period."
        ),
        b.p(
            "The Professional Service Expert's Full and Final Settlement shall be calculated based "
            "on the Professional Service Expert's last working day, together with any amounts "
            "payable in lieu of notice, if applicable, and shall be subject to applicable "
            "deductions, recoveries, Company policies, and statutory requirements."
        ),
        b.p("**Notice Period Buyout:**"),
        b.ul([
            "1. You may opt to buy out their notice period, subject to approval from both the "
            "Reporting Manager and the People Team.",
            "2. The buyout amount shall be calculated based on the base amount for the unserved "
            "notice period and must be paid in full before the final clearance process is initiated.",
            "3. No leave adjustments shall be allowed against the notice period buyout. Any pending "
            "leave encashment shall be processed separately as per company policy.",
            "4. The buyout request must be submitted in writing and will only be considered valid "
            "upon formal approval from both the Reporting Manager and the People Team.",
            "5. The company reserves the right to reject a notice period buyout request based on "
            "business requirements or other operational considerations.",
        ]),
        b.p(
            "The Company may at its absolute discretion, terminate your contract with the Company "
            "immediately without notice or pay you in lieu thereof, if at any time during the course "
            "of your service with the Company you:"
        ),
        b.ul(_TERMINATION_FOR_CAUSE),
    ]


def _psc_misc() -> list[dict]:
    return [
        b.p(
            "1. You shall be governed by the rules and regulations and policies of the organization, "
            "which are in force and/or are framed from time to time. The terms and conditions of "
            "service can be changed without any reference to you and the same shall be binding upon "
            "you. You will abide by the rules and; regulation of the Company which are in force for "
            "the time being and/or which may be framed from time to time and you shall also ensure "
            "compliance to statues, regulations and requirements laid down by various regulatory and "
            "statutory bodies including the Information Technology Act and its related rules and "
            "regulations."
        ),
        b.p(
            "2. You shall communicate the change, if any, in your permanent/present residential "
            "address/telephone/mobile number hereafter immediately, failing which communication sent "
            "to you at your notified address shall be deemed to have been received by you."
        ),
        b.p(
            "3. You shall throughout your service with the company, conduct yourself in a manner "
            "befitting a responsible individual of the company and maintain absolute integrity. In "
            "case your behaviour or conduct is found wanting or undesirable, the company reserves "
            "the right to terminate your services without any compensation, notice or pay in lieu "
            "thereof."
        ),
        b.p(
            "4. In the event of your termination from the Company or leaving the company due to any "
            "other reason, you will not use / utilize / provide any work / material / information "
            "that may be either produced or acquired by you during your service with the Company. "
            "The Company reserves the right to initiate appropriate legal action and claim "
            "appropriate damages in the event of your failure to comply with this provision, "
            "resulting in any financial / non-financial loss to the Company."
        ),
        b.p(
            "5. You will not accept any present, commission or any sort of gratification in cash or "
            "kind from any person, party, firm or company having dealing with the Company and if you "
            "are offered any, you should immediately report the same to the Management."
        ),
        b.p(
            "6. If any provision of this letter is held to be invalid or unenforceable, then such "
            "provision shall so far as it is invalid or unenforceable, be given no effect and shall "
            "be deemed to be included in this letter but without invalidating any of the remaining "
            "provisions of this letter."
        ),
    ]


_SCHEDULE_B_CLAUSES = [
    "Professional service contract with EZ as service professional or engagement with EZ as an "
    "independent contractor, as the case may be (the “**Engagement**”), will give the Participant "
    "access to proprietary and confidential information belonging to EZ, its clients, its suppliers "
    "and others (the proprietary and confidential information is collectively referred to in this "
    "Agreement as “**Confidential Information**”). Confidential Information includes but is not limited "
    "to client lists, marketing plans, proposals, contracts, technical and/or financial information, "
    "databases, software, and know-how. All Confidential Information remains confidential and "
    "proprietary information of EZ.",

    "By accepting this Offer of professional service contract, you agree and accept that you shall "
    "not, either during your professional service contract (other than in the course of fulfilling "
    "your obligations as service professional) or at any time afterwards, use to the detriment or "
    "prejudice of the company or communicate or divulge to any person, any information that may be "
    "confidential or proprietary information of the company which comes to your knowledge during "
    "your professional service contract including, without limitation, all data, client list "
    "including their details and related information, technical information, commercial and research "
    "strategies, trade secrets and know-how and any other information related to the business and "
    "operations of the company.",

    "You shall not be directly or indirectly engaged or interested in any trade, business or "
    "occupation other than the business of EZ which may prevent you from carrying out your duties "
    "effectively or which may be detrimental to EZ’s interests, during the course of your "
    "professional service contract.",

    "You specifically agree that for a period of two (2) years after you are no longer engaged by "
    "EZ, you shall not engage, directly or indirectly, either as proprietor, stockholder, partner, "
    "officer, employee or otherwise, in the same or similar activities as were performed for EZ in "
    "any business which distributes or sells products or provides services similar to those "
    "distributed, sold, or provided by EZ at any time during your term of professional service "
    "contract.",

    "You specifically agree that for a period of two (2) years after you are no longer engaged by "
    "EZ, you shall not, directly or indirectly, either as proprietor, stockholder, partner, officer, "
    "employee or otherwise, distribute, sell, offer to sell, or solicit any orders for the purchase "
    "or distribution of any products or services which are similar to those distributed, sold or "
    "provided by EZ during your term of professional service contract.",

    "You specifically agrees that for two (2) years after you are no longer engaged by EZ, you shall "
    "not directly or indirectly solicit, agree to perform or perform services of any type that EZ "
    "can render (the \"**Services**\") for any person or entity who paid or engaged EZ for the Services, "
    "or who received the benefit of EZ's Services, or with whom you had any substantial dealing "
    "while engaged by EZ.",

    "The contents of this Offer, and of all related agreements or arrangements, shall be held in "
    "confidence by you and shall not be disclosed to any third party without the prior approval of "
    "the company.",

    "Any breach of confidentiality obligations by you may result in disciplinary measures by the "
    "company, including your dismissal without notice.",

    "You are required to share data and files related to closed assignments completed in a specific "
    "month by the end of the first week of the following month. This sharing must be conducted "
    "through organization-approved and secure channels to ensure data security and confidentiality. "
    "Subsequently, it is your responsibility to promptly delete any project-related data from your "
    "personal electronic devices, including personally owned cellphones, smartphones, tablets, "
    "laptops, or computers, to prevent unauthorized access. Furthermore, you are permitted to use "
    "your personal electronic devices for work purposes, subject to compatibility with "
    "organizational technology standards. However, this usage comes with the explicit expectation "
    "that you will adhere to all security protocols and guidelines provided by the organization. "
    "Exercise caution when sharing access to project files and data, limiting it to only those "
    "individuals who have a legitimate need to know. Any breach, suspicious activities, or concerns "
    "regarding data security should be reported promptly to the designated authority within the "
    "organization.",

    "As referred to herein, the “**Business of EZ**” shall relate to the business of EZ as the same is "
    "determined by the Proprietor of EZ from time to time.",

    "The Participant may in the course of the Engagement conceive, develop or contribute to material "
    "or information related to the Business of EZ, including, without limitation, software, "
    "technical documentation, ideas, inventions (whether or not patentable), hardware, know-how, "
    "marketing plans, designs, techniques, documentation and records, regardless of the form or "
    "media, if any, on which such is stored (referred to in this Agreement as “**Proprietary "
    "Property**”). EZ shall exclusively own all Proprietary Property which the Participant conceives, "
    "develops or contributes to in the course of the Engagement and all intellectual and industrial "
    "property and other rights of any kind in or relating to the Proprietary Property, including but "
    "not limited to all copyright, patent, trade secret and trade-mark rights in or relating to the "
    "Proprietary Property. For greater certainty, the Participant hereby assigns to EZ any and all "
    "rights that the Participant may have or obtain in or to the Proprietary Property. Material or "
    "information conceived, developed or contributed to by the Participant outside work hours on "
    "EZ’s premises or through the use of EZ’s property and/or assets shall also be Proprietary "
    "Property and be governed by this Agreement if such material or information relates to the "
    "Business of EZ. The Participant shall keep full and accurate records accessible at all times to "
    "EZ relating to all Proprietary Property and shall promptly disclose and deliver to EZ all "
    "Proprietary Property.",

    "The Participant shall, both during and after the Engagement, keep all Confidential Information "
    "and Proprietary Property confidential and shall not use any of it except for the purpose of "
    "carrying out authorized activities on behalf of EZ. The Participant may, however, use or "
    "disclose Confidential Information which: (i) is or becomes public other than through a breach "
    "of this Agreement. (ii) is known to the Participant prior to the date of this Agreement and "
    "with respect to which the Participant does not have any obligation of confidentiality; or (iii) "
    "is required to be disclosed by law, whether under an order of a court or government tribunal or "
    "other legal process, provided that Participant informs EZ of such requirement in sufficient "
    "time to allow EZ to avoid such disclosure by the Participant.",

    "The Participant shall return or destroy, as directed by EZ, Confidential Information and "
    "Proprietary Property to EZ upon request by EZ at any time. The Participant shall certify, by "
    "way of affidavit or statutory declaration, that all such Confidential Information and "
    "Proprietary Property has been returned or destroyed, as applicable.",

    "The Participant covenants and agrees not to make any unauthorized use whatsoever of or to bring "
    "onto EZ’s premises for the purpose of making any unauthorized use whatsoever of any trade "
    "secrets, confidential information or proprietary property of any third party, including without "
    "limitation any trademarks or copyrighted materials, during the course of the Engagement. The "
    "Participant agrees and represents that the Engagement and the execution of this Agreement do "
    "not and will not breach any agreement to which the Participant is currently a party, or which "
    "currently applies to the Participant.",

    "At the reasonable request and at the sole expense of EZ, the Participant shall do all "
    "reasonable acts necessary and sign all reasonable documentation necessary in order to ensure "
    "EZ’s ownership of the Proprietary Property and all intellectual and industrial property rights "
    "and other rights in the same, including but not limited to providing to EZ written assignments "
    "of all rights to EZ and any other documents required to enable EZ to document rights to and/or "
    "register patents, copyrights, trade-marks, industrial designs and such other protections as EZ "
    "considers advisable anywhere in the world.",

    "The Participant hereby irrevocably and unconditionally waives all moral rights the Participant "
    "may now or in the future have in any Proprietary Property.",

    "The Participant agrees that the Participant will, if requested from time to time by EZ, execute "
    "such further reasonable agreements as to confidentiality and proprietary rights as EZ’s clients "
    "or suppliers reasonably required to protect Confidential Information or Proprietary Property.",

    "Regardless of any changes in position, payment terms or otherwise, including, without "
    "limitation, termination of the Engagement, unless otherwise stipulated pursuant to the terms "
    "hereof, the Participant will continue to be subject to each of the terms and conditions of this "
    "Agreement and any other(s) executed pursuant to the preceding paragraph.",

    "The Participant agrees that the Participant’s sole and exclusive remedy for any breach of this "
    "Agreement or any other agreement by EZ will be limited to monetary damages and that the "
    "Participant will not make any claim in respect of any rights to or interest in any Confidential "
    "Information or Proprietary Property.",

    "The Participant agrees that, during the term of this Agreement and for one (1) year after "
    "termination for any reason, he or she will not hire or solicit nor attempt to hire or solicit "
    "EZ’s employees (or any person who was employed by EZ within the past one year) without the "
    "prior written consent of EZ.",

    "The Participant acknowledges that, during the term of this Agreement, he or she may become "
    "familiar with Confidential Information concerning such Related Companies, and with investment "
    "opportunities relating to their respective businesses and therefore agree that, during the term "
    "of this Agreement and for a period of two years thereafter (the “**Noncompete Period**”), he or she "
    "will not directly or indirectly own, manage, control, participate in, consult with, render "
    "services for, or in any other manner engage in any business, or invest in or lend money to any "
    "business which constitutes or is competitive with (including, without limitation, by competing "
    "for the same subscriber or client base) any business conducted by any System owned or managed "
    "by any Related Company (as and where such Systems are operated or managed or are proposed to be "
    "operated or managed by EZ during the term of this Agreement, or as of the end of the Noncompete "
    "Period.",

    "Your professional service contract may only be terminated by either Party giving written notice "
    "to the other. Subject to clause 22, the minimum period of notice will be two (2) weeks during "
    "your probation period, if terminated by the company and one (1) month if terminated by you. The "
    "minimum period of notice will be one (1) month after the completion of probation.",

    "The company may terminate this Offer and your professional service contract immediately without "
    "notice for any of the reasons stated in Articles 88 or 120 of the UAE Labour Law being Federal "
    "Law No. 8 of 1980 (as amended) (the “**Labour Law**”).",

    "If you are absent from work without prior approval or any valid reason, the company may "
    "terminate the professional service contract immediately, without notice or payment in lieu of "
    "notice.",

    "If your professional service contract is terminated (i) by you; or (ii) by the company due to "
    "any reasons stated in Articles 88 and 120 of the Labour Law, during the first year of your "
    "professional service contract, you shall be liable to reimburse the company the entire costs "
    "incurred by the company for your relocation to UAE at the commencement of your professional "
    "service contract, if applicable.",

    "Upon the termination of your professional service contract (except of termination for reasons "
    "stated in Articles 88 and 120 of the Labour Law), you will be eligible to receive an end of "
    "service gratuity in the form a payment in proportion to the base amount component of your pay "
    "package based on the number of years of your service, in accordance with the provisions of the "
    "Labour Law.",

    "The Participant acknowledges that the services provided by the Participant to EZ are unique. "
    "The Participant further agrees that irreparable harm will be suffered by EZ in the event of the "
    "Participant’s breach or threatened breach of any of his or her obligations under this "
    "Agreement, and that EZ will be entitled to seek, in addition to any other rights and remedies "
    "that it may have at law or equity, a temporary or permanent injunction restraining the "
    "Participant from engaging in or continuing any such breach hereof. Any claims asserted by the "
    "Participant against EZ shall not constitute a defence in any injunction action, application or "
    "motion brought against the Participant by EZ.",

    "This Agreement is governed by the laws of the UAE and the Participant agrees to the "
    "non-exclusive jurisdiction of the courts of Sharjah in relation to this Agreement.",

    "If any provision of this Agreement is held by a court of competent jurisdiction to be invalid or "
    "unenforceable, that provision shall be deleted, and the other provisions shall remain in effect.",
]


def professional_service_contract(ctx: dict) -> dict:
    """Professional Service Contract (AEZ, individual, professional_services, contract).

    Faithful to 'Date_Professional Service Contract_ArabEasy_Full Name.docx.pdf': cover letter with
    acknowledgement, Schedule A (the terms-and-conditions grid, including the coins conversion rate
    list) and Schedule B (29 covenant clauses), each with its own execution block.

    HR fills: joining date, full name, permanent address / personal email, role, and the reporting
    and approving managers with their positions. Everything else is fixed contract text.
    """
    who = ctx["name"]
    role = ctx["designation"]
    start = ctx["start_date"]
    witness = ctx["signatory_name"]

    return {
        "title": f"Professional Service Contract - {who}",
        "doc_type": "contract",
        "blocks": [
            # ── Cover letter ──────────────────────────────────────────────────────────────
            b.p(f"Ref # {ctx['reference']}", align="right"),
            # The source puts the addressee's name on the left with the date level with it.
            b.row([b.p(f"**{who}**")], [b.p(f"Date: {ctx['letter_date']}", align="right")]),
            b.p(ctx["address"]),
            b.p(f"Dear {who},"),
            b.p(
                f"We are pleased to confirm this offer of a **Professional Service Expert** position "
                f"with ArabEasy LLC (hereinafter referred to as \"**EZ**\") as **{role}**, effective "
                f"**{start}**. As discussed, this offer is conditional upon completion of satisfactory "
                f"reference check with the references provided by you that could include, but is not "
                f"necessarily limited to successful completion of satisfactory verification checks of "
                f"your background and qualifications."
            ),
            b.p(
                "The details of our offer, including the terms and conditions of your professional "
                "service contract, are attached as Schedule “A”. Please take the time to carefully "
                "review our offer. This letter, along with the enclosed schedules, outlines the "
                "obligations of both EZ and yourself with respect to your professional service "
                "contract conditions. It details the terms and conditions of your professional "
                "service contract with EZ and will form our agreed upon professional service contract "
                "with you once signed."
            ),
            b.p(
                "Accepting professional service contract will be conditional upon agreeing to and "
                "signing the attached copy of this letter and the attached Schedule(s), initialling "
                "each page in the right-hand corner, and returning it to me upon your earliest "
                "convenience, but prior to your first day of professional service contract."
            ),
            b.p(
                f"**{who}**, we look forward to welcoming you to the EZ team and wish you a successful "
                f"and rewarding career with us."
            ),
            b.p("Sincerely,"),
            b.space(43),   # room to sign, measured off the source letter
            b.p(f"{witness}"),
            b.p(ctx["signatory_title"]),
            b.p(
                f"I, **{who}**, acknowledge that I have read, understood and accept this offer and the "
                f"terms and conditions contained in the attached Schedule(s), and agree to be bound by "
                f"the terms and conditions of professional service contract as outlined therein."
            ),
            b.p("Signature ________________________________    Date ___________________"),
            b.divider(),

            # ── Schedule A ────────────────────────────────────────────────────────────────
            b.h(1, "Schedule A", underline=True),
            b.h(3, "ArabEasy LLC"),
            b.h(3, "Terms and Conditions of Professional Service Contract"),
            b.p(
                "The following outlines the terms and conditions of professional service contract "
                "with EZ. EZ reserves the right to change these terms and conditions as necessary, "
                "with due notice."
            ),
            b.terms([
                ("Title", [b.p(role)]),
                ("Reporting Relationship", [
                    b.p(f"**{ctx['manager']}**, {ctx['manager_role']}"),
                    b.p(f"**{ctx['approving_manager']}**, {ctx['approving_manager_role']}"),
                ]),
                ("Responsibilities", _psc_responsibilities(ctx["responsibilities"])),
                ("Base Pay", [b.p("Fixed INR 000 per month. We expect you to do **00 coins per month**.")]),
                ("Performance Bonus", [b.p("INR 00 (applicable after 3 months and paid quarterly as per PPR)")]),
                ("Incentive", [b.p(
                    "If you process above the defined coins volume, you will be incentivized as per "
                    "the rate list. (applicable after 3 months and paid quarterly along with PPR Bonus)"
                )]),
                # The source sets these as TWO rows of the terms table, not one: "Coins Conversion"
                # carrying the rate, then "Rate List" carrying the skill table. Merging them lost a
                # row label a reader looks for.
                ("Coins Conversion", [b.p("Cost per coin = INR 1")]),
                ("Rate List", [
                    b.table(
                        ["Skill Name", "Rate List (coins/unit)", "Incentive/Unit"],
                        [list(r) for r in _COINS_RATE_LIST],
                        align=["left", "right", "right"],
                    ),
                    b.p(
                        "**Note:** Apart from the updates related to the new coin-based incentive "
                        "structure, all other terms, conditions, and clauses of the existing signed "
                        "contract will remain fully valid and in effect without any modification."
                    ),
                ]),
                ("Bond", [b.p("N/A")]),
                ("Start Date", [b.p(start)]),
                ("Working Hours", [
                    b.p(ctx["hours_of_work"]),
                    b.p(
                        "Note: By virtue of the way we serve clients, work volume varies significantly "
                        "across days. Your availability commitment defines the number of hours you will "
                        "be active to respond to the EZ delivery team and get work assignments. The EZ "
                        "team will not assign new work to you outside these hours. The delivery time of "
                        "work assigned to you however, will be based on the client requirements and you "
                        "will be expected to deliver on time, even if that time falls outside the "
                        "working hours defined above. Given the nature of your duties, it might be "
                        "necessary for you to make yourself available beyond the working hours without "
                        "any further additional payment by the company."
                    ),
                ]),
                ("Payroll Schedule", [
                    b.p(
                        "Your payment will be paid to you on a monthly basis and will be processed "
                        "within the first 7 days of the next month."
                    ),
                    b.p(
                        "Your incentives and performance bonus will be calculated on a quarterly basis "
                        "and will be paid with the 1st month payment of the following quarter."
                    ),
                ]),
                ("Probationary Period", [b.p("NA")]),
                ("Vacation", [b.p(
                    "You shall be entitled to leaves and annual holidays as per the rules of the company."
                )]),
                ("Policies and Standards", [b.p(
                    "EZ has established a variety of policies and standards that ensure a safe, "
                    "enjoyable working environment. During the period of your professional service "
                    "contract with us, you agree to be bound by these policies and standards, and any "
                    "future policies and standards that are reasonably introduced by EZ. It is agreed "
                    "that the introduction and administration of these policies is within the sole "
                    "discretion of EZ and that these policies do not form a part of this Agreement. It "
                    "is agreed that if EZ introduces, amends, or deletes professional service "
                    "contract-related policies as conditions warrant that such introduction, deletion "
                    "or amendment does not constitute a breach of this Agreement."
                )]),
                ("Confidentiality, Non-Solicitation, Non-competition, Termination & Intellectual Property", [b.p(
                    "Our offer of professional service contract is conditional upon you agreeing to "
                    "and abiding by the “Confidentiality, Non-Solicitation, Non-Competition, "
                    "Termination and Proprietary Information Agreement.” Attached Schedule “B.”"
                )]),
                ("Changes to Duties and/or Pay Package", [b.p(
                    "If your duties or pay package should change during the course of your professional "
                    "service contract with EZ, the validity of our agreement will not be affected. In "
                    "addition, if one or more of the provisions in our agreement are deemed void by "
                    "law, then the remaining provisions will continue in full force and effect."
                )]),
                ("Termination", _psc_termination()),
                ("Company's Honor Code and; Workplace Guidelines", [b.p(
                    "During the course of your contract, you will be required to adhere to the Code of "
                    "Conduct of the Company and follow the Workplace Guidelines and Policies as "
                    "compiled in the HR Handbook of the Company."
                )]),
                ("Miscellaneous Provisions", _psc_misc()),
                ("Legal Advice", [b.p(
                    "If you are uncertain about the contents of this offer, we suggest that it may be "
                    "advisable to seek independent legal advice prior to signing."
                )]),
                ("Applicable Law and Jurisdiction", [b.p(
                    "This Agreement is governed by the laws of UAE and the Receiving Party agrees to "
                    "the non- exclusive jurisdiction of the courts of Sharjah in relation to this "
                    "Agreement. If any provision of this Agreement is held by a court of competent "
                    "jurisdiction to be invalid or unenforceable, that provision shall be deleted and "
                    "the other provisions shall remain in effect."
                )]),
            ]),
            b.p(
                f"**IN WITNESS WHEREOF** EZ has caused this Agreement to be executed as of the **{start}**."
            ),
            b.signature(
                ("PARTICIPANT - NAME", "" if who.startswith("[") else who.upper()),
                ("WITNESS to PARTICIPANT - NAME", witness.upper(), witness),
                heading="Signed in the presence of:",
                heading_align="right",
            ),
            b.divider(),

            # ── Schedule B ────────────────────────────────────────────────────────────────
            b.h(1, "Schedule B", underline=True),
            b.h(3, "Covenants"),
            b.h(3, "Confidentiality, Non-Solicitation, Non- Competition and Proprietary Information Agreement", underline=True),
            b.p(
                "In consideration of professional service contract as a service professional or expert "
                "with ArabEasy LLC, the undersigned (the “**Participant**”) agrees, and covenants as "
                "follows:"
            ),
            b.ol(_SCHEDULE_B_CLAUSES),
            b.p(
                f"**IN WITNESS WHEREOF** EZ has caused this Agreement to be executed as of the **{start}**."
            ),
            b.signature(
                ("PARTICIPANT - NAME", "" if who.startswith("[") else who.upper()),
                ("WITNESS to PARTICIPANT - NAME", witness.upper(), witness),
                heading="Signed in the presence of:",
                heading_align="right",
            ),
        ],
    }


register(
    "aez_professional_service_contract",
    professional_service_contract,
    label="Professional Service Contract",
    preferred=True,
    description=(
        "ArabEasy LLC professional-service engagement: cover letter with acknowledgement, "
        "Schedule A terms (including the coins conversion rate list) and Schedule B covenants."
    ),
    entity="AEZ",
    doc_type="contract",
    party_type="individual",
    contract_type="professional_services",
)


_FREELANCE_RESPONSIBILITIES = [
    "Creating original design concepts for logos, branding materials, marketing collateral, "
    "website graphics, packaging, illustrations, infographics, and other visual assets based on "
    "project requirements.",
    "Understand the brand identity, target audience, and project goals to ensure the design aligns "
    "with their vision.",
    "Using design elements to effectively communicate complex information and narratives through "
    "visuals.",
    "Arranging visual elements on a design canvas to create visually balanced and aesthetically "
    "pleasing layouts.",
    "Choosing appropriate fonts to enhance readability and convey the desired tone of voice.",
    "Selecting and coordinating colors to create impactful and brand-consistent visuals.",
    "Retouching and adjusting photographs to improve visual quality.",
    "Using design software like Adobe Photoshop, Illustrator, InDesign, and other relevant tools to "
    "create digital graphics.",
    "Your job description, duties and obligations may change from time to time as per the "
    "Employer’s requirements.",
    "You shall always exercise professional skills and duty of care towards the Employer and its "
    "clients in the performance of duties.",
    "For the term of your freelance contract, you will not conduct any business or hold an interest "
    "in any business for personal or professional gain without the prior written approval of the "
    "Employer.",
    "You shall, at all times and in all respects, comply with the Employer’s policies, disciplinary "
    "procedures, house rules, codes of conduct, rules and regulations, statements of principles "
    "adopted by the Employer from time to time.",
]


def _freelance_schedule_b() -> list[dict]:
    """Schedule B's 21 covenants. Numbered explicitly rather than with an ordered list because
    clauses 8 and 9 carry (i)-(iv) sub-limbs that would restart the outer numbering."""
    return [
        b.p(
            "1. Freelance contract with EZ as a freelancer or engagement with EZ as an independent "
            "contractor, as the case may be (the “**Engagement**”), will give the Participant access to "
            "proprietary and confidential information belonging to EZ, its clients, its suppliers "
            "and others (the proprietary and confidential information is collectively referred to "
            "in this Agreement as “**Confidential Information**”). Confidential Information includes "
            "but is not limited to client lists, marketing plans, proposals, contracts, technical "
            "and/or financial information, databases, software, and know-how. All Confidential "
            "Information remains confidential and proprietary information of EZ."
        ),
        b.p(
            "2. By accepting this Offer of freelance contract, you agree and accept that you shall "
            "not, either during your freelance contract (other than in the course of fulfilling "
            "your obligations as a freelancer) or at any time afterwards, use to the detriment or "
            "prejudice of the Employer or communicate or divulge to any person, any information "
            "that may be confidential or proprietary information of the Employer which comes to "
            "your knowledge during your freelance contract including, without limitation, all data, "
            "client list including their details and related information, technical information, "
            "commercial and research strategies, trade secrets and know-how and any other "
            "information related to the business and operations of the Employer."
        ),
        b.p(
            "3. The contents of this Offer, and of all related agreements or arrangements, shall be "
            "held in confidence by you and shall not be disclosed to any third party without the "
            "prior approval of the Employer."
        ),
        b.p(
            "4. Any breach of confidentiality obligations by you may result in disciplinary measures "
            "by the Employer, including your dismissal without notice."
        ),
        b.p(
            "5. You are required to share data and files related to closed assignments completed in "
            "a specific month by the end of the first week of the following month. This sharing "
            "must be conducted through organization-approved and secure channels to ensure data "
            "security and confidentiality. Subsequently, it is your responsibility to promptly "
            "delete any project-related data from your personal electronic devices, including "
            "personally owned cellphones, smartphones, tablets, laptops, or computers, to prevent "
            "unauthorized access."
        ),
        b.p(
            "Furthermore, you are permitted to use your personal electronic devices for work "
            "purposes, subject to compatibility with organizational technology standards. However, "
            "this usage comes with the explicit expectation that you will adhere to all security "
            "protocols and guidelines provided by the organization. Exercise caution when sharing "
            "access to project files and data, limiting it to only those individuals who have a "
            "legitimate need to know. Any breach, suspicious activities, or concerns regarding data "
            "security should be reported promptly to the designated authority within the "
            "organization."
        ),
        b.p(
            "6. As referred to herein, the “**Business of EZ**” shall relate to the business of EZ as "
            "the same is determined by the Proprietor of EZ from time to time."
        ),
        b.p(
            "7. The Participant may in the course of the Engagement conceive, develop or contribute "
            "to material or information related to the Business of EZ, including, without "
            "limitation, software, technical documentation, ideas, inventions (whether or not "
            "patentable), hardware, know-how, marketing plans, designs, techniques, documentation "
            "and records, regardless of the form or media, if any, on which such is stored "
            "(referred to in this Agreement as “**Proprietary Property**”). EZ shall exclusively own "
            "all Proprietary Property which the Participant conceives, develops or contributes to "
            "in the course of the Engagement and all intellectual and industrial property and other "
            "rights of any kind in or relating to the Proprietary Property, including but not "
            "limited to all copyright, patent, trade secret and trade-mark rights in or relating to "
            "the Proprietary Property. For greater certainty, the Participant hereby assigns to EZ "
            "any and all rights that the Participant may have or obtain in or to the Proprietary "
            "Property. Material or information conceived, developed or contributed to by the "
            "Participant outside work hours on EZ’s premises or through the use of EZ’s property "
            "and/or assets shall also be Proprietary Property and be governed by this Agreement if "
            "such material or information relates to the Business of EZ. The Participant shall keep "
            "full and accurate records accessible at all times to EZ relating to all Proprietary "
            "Property and shall promptly disclose and deliver to EZ all Proprietary Property."
        ),
        b.p("8. Non-Solicitation and Non-Competition"),
        b.ul([
            "(i) The Freelancer (or its Affiliate) shall not be directly or indirectly engaged or "
            "interested in any trade, business or occupation other than the business of EZ which "
            "may prevent it from carrying out its duties effectively or which may be detrimental to "
            "the EZ’s interests, during the course of the Agreement.",
            "(ii) The Freelancer specifically agree that for a period of two (2) years after expiry "
            "or termination of the Agreement, Freelancer (or its Affiliate) shall not engage, "
            "directly or indirectly, either as proprietor, stockholder, partner, officer, employee "
            "or otherwise, in the same or similar activities as were performed for EZ in any "
            "business which distributes or sells products or provides services similar to those "
            "distributed, sold, or provided by EZ during the term of Agreement.",
            "(iii) The Freelancer specifically agree that for a period of two (2) years after expiry "
            "or termination of the Agreement, Freelancer (or its Affiliate) shall not, directly or "
            "indirectly, either as proprietor, stockholder, partner, officer, employee or otherwise, "
            "distribute, sell, offer to sell, or solicit any orders for the purchase or distribution "
            "of any products or services which are similar to those distributed, sold or provided by "
            "EZ during the term of Agreement.",
            "(iv) The Freelancer specifically agrees that for two (2) years after expiry or "
            "termination of the Agreement, Freelancer (or its Affiliate) shall not directly or "
            "indirectly solicit, agree to perform or perform services of any type that the EZ can "
            "render (the \"**Services**\") for any person or entity who paid or engaged the EZ for the "
            "Services, or who received the benefit of EZ's Services, or with whom Freelancer (or its "
            "Affiliate) had any substantial dealing during the term of Agreement.",
        ]),
        b.p(
            "For the purposes of this clause, “**Affiliate**” shall mean an entity that controls, or is "
            "controlled by, or is under common control of the Freelancer or any entity that controls "
            "the Freelancer."
        ),
        b.p(
            "9. The Participant shall, both during and after the Engagement, keep all Confidential "
            "Information and Proprietary Property confidential and shall not use any of it except "
            "for the purpose of carrying out authorized activities on behalf of EZ. The Participant "
            "may, however, use or disclose Confidential Information which:"
        ),
        b.ul([
            "(i) is or becomes public other than through a breach of this Agreement.",
            "(ii) is known to the Participant prior to the date of this Agreement and with respect "
            "to which the Participant does not have any obligation of confidentiality; or",
            "(iii) is required to be disclosed by law, whether under an order of a court or "
            "government tribunal or other legal process, provided that Participant informs EZ of "
            "such requirement in sufficient time to allow EZ to avoid such disclosure by the "
            "Participant.",
        ]),
        b.p(
            "10. The Participant shall return or destroy, as directed by EZ, Confidential "
            "Information and Proprietary Property to EZ upon request by EZ at any time. The "
            "Participant shall certify, by way of affidavit or statutory declaration, that all such "
            "Confidential Information and Proprietary Property has been returned or destroyed, as "
            "applicable."
        ),
        b.p(
            "11. The Participant covenants and agrees not to make any unauthorized use whatsoever of "
            "or to bring onto EZ’s premises for the purpose of making any unauthorized use "
            "whatsoever of any trade secrets, confidential information or proprietary property of "
            "any third party, including without limitation any trade-marks or copyrighted "
            "materials, during the course of the Engagement. The Participant agrees and represents "
            "that the Engagement and the execution of this Agreement do not and will not breach any "
            "agreement to which the Participant is currently a party, or which currently applies to "
            "the Participant."
        ),
        b.p(
            "12. At the reasonable request and at the sole expense of EZ, the Participant shall do "
            "all reasonable acts necessary and sign all reasonable documentation necessary in order "
            "to ensure EZ’s ownership of the Proprietary Property and all intellectual and "
            "industrial property rights and other rights in the same, including but not limited to "
            "providing to EZ written assignments of all rights to EZ and any other documents "
            "required to enable EZ to document rights to and/or register patents, copyrights, "
            "trade-marks, industrial designs and such other protections as EZ considers advisable "
            "anywhere in the world."
        ),
        b.p(
            "13. The Participant hereby irrevocably and unconditionally waives all moral rights the "
            "Participant may now or in the future have in any Proprietary Property."
        ),
        b.p(
            "14. The Participant agrees that the Participant will, if requested from time to time by "
            "EZ, execute such further reasonable agreements as to confidentiality and proprietary "
            "rights as EZ’s clients or suppliers reasonably required to protect Confidential "
            "Information or Proprietary Property."
        ),
        b.p(
            "15. Regardless of any changes in position, salary or otherwise, including, without "
            "limitation, termination of the Engagement, unless otherwise stipulated pursuant to the "
            "terms hereof, the Participant will continue to be subject to each of the terms and "
            "conditions of this Agreement and any other(s) executed pursuant to the preceding "
            "paragraph."
        ),
        b.p(
            "16. The Participant agrees that the Participant’s sole and exclusive remedy for any "
            "breach of this Agreement or any other agreement by EZ will be limited to monetary "
            "damages and that the Participant will not make any claim in respect of any rights to "
            "or interest in any Confidential Information or Proprietary Property."
        ),
        b.p(
            "17. The Participant agrees that, during the term of this Agreement and for one (1) year "
            "after termination for any reason, he or she will not hire or solicit nor attempt to "
            "hire or solicit EZ’s employees (or any person who was employed by EZ within the past "
            "one year) without the prior written consent of EZ."
        ),
        b.p(
            "18. The Participant acknowledges that, during the term of this Agreement, he or she may "
            "become familiar with Confidential Information concerning such Related Companies, and "
            "with investment opportunities relating to their respective businesses and therefore "
            "agree that, during the term of this Agreement and for a period of two years thereafter "
            "(the “**Noncompete Period**”), he or she will not directly or indirectly own, manage, "
            "control, participate in, consult with, render services for, or in any other manner "
            "engage in any business, or invest in or lend money to any business which constitutes or "
            "is competitive with (including, without limitation, by competing for the same "
            "subscriber or client base) any business conducted by any System owned or managed by any "
            "Related Company (as and where such Systems are operated or managed or are proposed to "
            "be operated or managed by EZ during the term of this Agreement, or as of the end of the "
            "Noncompete Period."
        ),
        b.p(
            "19. The Participant acknowledges that the services provided by the Participant to EZ "
            "are unique. The Participant further agrees that irreparable harm will be suffered by EZ "
            "in the event of the Participant’s breach or threatened breach of any of his or her "
            "obligations under this Agreement, and that EZ will be entitled to seek, in addition to "
            "any other rights and remedies that it may have at law or equity, a temporary or "
            "permanent injunction restraining the Participant from engaging in or continuing any "
            "such breach hereof. Any claims asserted by the Participant against EZ shall not "
            "constitute a defence in any injunction action, application or motion brought against "
            "the Participant by EZ."
        ),
        b.p(
            "20. This Agreement is governed by the laws of the UAE and the Participant agrees to the "
            "non-exclusive jurisdiction of the courts of Sharjah in relation to this Agreement."
        ),
        b.p(
            "21. If any provision of this Agreement is held by a court of competent jurisdiction to "
            "be invalid or unenforceable, that provision shall be deleted, and the other provisions "
            "shall remain in effect."
        ),
    ]


def freelance_contract(ctx: dict) -> dict:
    """Freelance Contract (AEZ, individual, freelance, contract).

    Faithful to 'Date_Freelance Contract_ArabEasy_Full Name.docx.pdf': cover letter with
    acknowledgement, Schedule A (17-row terms grid) and Schedule B (21 covenants), each schedule
    closing with its own execution block.

    HR fills: joining date, full name, permanent address / personal email, role, and the reporting
    and approving managers with their positions.
    """
    who = ctx["name"]
    title = f"Freelance {ctx['designation']} Expert"
    start = ctx["start_date"]
    witness = ctx["signatory_name"]
    execution = [
        b.p(f"**IN WITNESS WHEREOF** EZ has caused this Agreement to be executed as of the **{start}**."),
        b.signature(
            ("PARTICIPANT - NAME", "" if who.startswith("[") else who.upper()),
            ("WITNESS to PARTICIPANT - NAME", witness.upper(), witness),
            heading="Signed in the presence of:",
            heading_align="right",
        ),
    ]

    return {
        "title": f"Freelance Contract - {who}",
        "doc_type": "contract",
        "blocks": [
            # ── Cover letter ──────────────────────────────────────────────────────────────
            b.p(f"Ref # {ctx['reference']}", align="right"),
            # The source puts the addressee's name on the left with the date level with it.
            b.row([b.p(f"**{who}**")], [b.p(f"Date: {ctx['letter_date']}", align="right")]),
            b.p(ctx["address"]),
            b.p(f"Dear {who},"),
            b.p(
                f"We are pleased to confirm this offer of freelance contract to you for a freelance "
                f"position with ArabEasy LLC (hereinafter referred to as \"**EZ**\") as "
                f"“**{title}**”, effective **{start}**. As discussed, this offer is conditional upon "
                f"completion of satisfactory reference check by the Employer with the references "
                f"provided by you that could include, but is not necessarily limited to successful "
                f"completion of satisfactory verification checks of your background and "
                f"qualifications."
            ),
            b.p(
                "The details of our offer, including the terms and conditions of your freelance "
                "contract, are attached as Schedule “A”. Please take the time to carefully review "
                "our offer. This letter, along with the enclosed schedules, outlines the obligations "
                "of both EZ and yourself with respect to your freelance contract conditions. It "
                "details the terms and conditions of your freelance contract with EZ, and will form "
                "our agreed upon freelance contract contract with you once signed."
            ),
            b.p(
                "Accepting freelance contract will be conditional upon agreeing to and signing the "
                "attached copy of this letter and the attached Schedule(s), initialing each page in "
                "the right-hand corner, and returning it to me upon your earliest convenience, but "
                "prior to your first day of freelance contract."
            ),
            b.p(
                f"{who}, we look forward to welcoming you to the EZ team and wish you a successful "
                f"and rewarding career with us."
            ),
            b.p("Sincerely,"),
            b.space(56),   # room to sign, measured off the source letter
            b.p(witness),
            b.p(ctx["signatory_title"]),
            b.p(
                f"I, **{who}**, acknowledge that I have read, understood and accept this offer and "
                f"the terms and conditions contained in the attached Schedule(s), and agree to be "
                f"bound by the terms and conditions of freelance contract as outlined therein."
            ),
            b.p("Signature ________________________________    Date ___________________"),
            b.divider(),

            # ── Schedule A ────────────────────────────────────────────────────────────────
            b.h(1, "Schedule A", underline=True),
            b.h(3, "ArabEasy LLC"),
            b.h(3, "Terms and Conditions of Freelance Contract"),
            b.p(
                "The following outlines the terms and conditions of freelance contract with EZ. EZ "
                "reserves the right to change these terms and conditions as necessary, with due "
                "notice."
            ),
            b.terms([
                ("Title", [b.p(title)]),
                ("Point of Contact", [
                    b.p(f"**{ctx['manager']}**, {ctx['manager_role']}"),
                    b.p(f"**{ctx['approving_manager']}**, {ctx['approving_manager_role']}"),
                ]),
                ("Responsibilities", [b.ol(_FREELANCE_RESPONSIBILITIES)]),
                ("Base Salary", [
                    b.p("USD  per basic slide"),
                    b.p("USD  per Advance slide"),
                    b.p("USD  per hour basic/Advance slide"),
                ]),
                ("Bond", [b.p("N/A")]),
                ("Status", [b.p("Freelancer")]),
                ("Start Date", [b.p(start)]),
                ("Payroll Schedule", [
                    b.p(
                        "Your salary will be paid to you on a monthly basis, and will be processed "
                        "within the last week of the following month."
                    ),
                    b.p(
                        "For example: For the work done by you during the month of November, payment "
                        "will be processed within the last week of December."
                    ),
                    b.p("Please note:"),
                    b.p(
                        "A 5% payment processing charge will be levied on the amount due. Any "
                        "additional charges levied by your bank on inbound foreign remittance will "
                        "be your responsibility. Any delays due to your bank or an intermediary bank "
                        "are beyond our control.",
                        muted=True,
                    ),
                    b.p(
                        "Our bank does not allow transactions less than USD 30, if your payment "
                        "amount is below USD 30, then the payment can be made via PayPal or will be "
                        "carried forward to the next payment cycle until the amount exceeds the "
                        "threshold limit.",
                        muted=True,
                    ),
                    b.p(
                        "The amount will not be payable by EZ, if the EZ’s QA team or its client has "
                        "noted numerous errors or serious quality issues, and EZ can request you for "
                        "changes in the document in order to correct such errors or inaccuracies.",
                        muted=True,
                    ),
                ]),
                ("Probationary Period", [b.p("N/A")]),
                ("Policies and Standards", [b.p(
                    "EZ has established a variety of policies and standards that ensure a safe, "
                    "enjoyable working environment. During the period of your freelance contract "
                    "with us, you agree to be bound by these policies and standards, and any future "
                    "policies and standards that are reasonably introduced by the EZ. It is agreed "
                    "that the introduction and administration of these policies is within the sole "
                    "discretion of EZ and that these policies do not form a part of this Agreement. "
                    "It is agreed that if EZ introduces, amends, or deletes freelance "
                    "contract-related policies as conditions warrant that such introduction, "
                    "deletion or amendment does not constitute a breach of this Agreement."
                )]),
                ("Confidentiality & Intellectual Property", [b.p(
                    "Our offer of freelance contract is conditional upon you agreeing to and abiding "
                    "by the “Confidentiality and Proprietary Information Agreement.” Attached "
                    "Schedule “B.”"
                )]),
                ("Changes to Duties and/or Compensation", [b.p(
                    "If your duties or compensation should change during the course of your "
                    "freelance contract with EZ, the validity of our agreement will not be affected. "
                    "In addition, if one or more of the provisions in our agreement are deemed void "
                    "by law, then the remaining provisions will continue in full force and effect."
                )]),
                ("Non-Solicitation", [b.p(
                    "You hereby agree that, while you are employed by EZ and for one (1) year "
                    "following the termination of your freelance contract with EZ, you will not (i) "
                    "recruit, attempt to recruit or directly or indirectly participate in the "
                    "recruitment of, any EZ employee or (ii) directly or indirectly solicit, attempt "
                    "to solicit, canvass or interfere with any client or supplier of EZ in a manner "
                    "that conflicts with or interferes in the business of EZ as conducted with such "
                    "client or supplier."
                )]),
                ("Representation", [b.p(
                    "You hereby represent and warrant to EZ that you are not party to any written or "
                    "oral agreement with any third party that would restrict your ability to enter "
                    "into this Agreement or the Confidentiality and Proprietary Information "
                    "Agreement or to perform your obligations hereunder and that you will not, by "
                    "joining EZ, breach any non-disclosure, proprietary rights, non-competition, "
                    "non-solicitation or other covenant in favor of any third party."
                )]),
                ("Termination", [
                    b.p("Freelance contract is executed without any termination or end date."),
                    b.p(
                        "Should you wish to terminate your freelance contract with EZ, you will be "
                        "required to provide written notice to enable us initiate the termination."
                    ),
                    b.p(
                        "EZ may terminate your freelance contract at any time without cause at any "
                        "time by providing you with the minimum notice, and settlement of dues, and "
                        "no more."
                    ),
                ]),
                ("Legal Advice", [b.p(
                    "If you are uncertain about the contents of this offer, we suggest that it may "
                    "be advisable to seek independent legal advice prior to signing."
                )]),
                ("Applicable Law and Jurisdiction", [b.p(
                    "This Agreement is governed by the laws of UAE and the Receiving Party agrees to "
                    "the non- exclusive jurisdiction of the courts of Sharjah in relation to this "
                    "Agreement. If any provision of this Agreement is held by a court of competent "
                    "jurisdiction to be invalid or unenforceable, that provision shall be deleted "
                    "and the other provisions shall remain in effect."
                )]),
            ]),
            *execution,
            b.divider(),

            # ── Schedule B ────────────────────────────────────────────────────────────────
            b.h(1, "Schedule B", underline=True),
            b.h(3, "Covenants"),
            b.h(3, "Confidentiality and Proprietary Information Agreement"),
            b.p(
                "In consideration of freelance contract as a freelancer or engagement as an "
                "independent contractor with ArabEasy LLC, the undersigned (the “**Participant**”) "
                "agrees, and covenants as follows:"
            ),
            *_freelance_schedule_b(),
            *execution,
        ],
    }


register(
    "aez_freelance_contract",
    freelance_contract,
    label="Freelance Contract",
    description=(
        "ArabEasy LLC freelance engagement: cover letter with acknowledgement, Schedule A terms "
        "grid and Schedule B confidentiality & non-solicitation covenants."
    ),
    entity="AEZ",
    doc_type="contract",
    party_type="individual",
    contract_type="freelance",
)


def agency_nda(ctx: dict) -> dict:
    """Agency NDA (AEZ, agency, agency, nda).

    Faithful to 'Date_NDA_ArabEasy Agency.docx.pdf': the standalone Schedule B Confidentiality and
    Proprietary Information Agreement between ArabEasy LLC and a service-provider agency, 11
    clauses, executed by both parties.

    Clause 4 is numbered explicitly rather than via an ordered list because it carries the i-iii
    sub-limbs plus a trailing return-or-destroy paragraph that belongs inside the same clause.
    """
    agency = ctx["agency_name"]
    signatory = ctx["agency_signatory_name"]
    ez_name = ctx["contract_signatory_name"]
    ez_title = ctx["contract_signatory_title"]

    return {
        "title": f"NDA - {ctx['agency_name_raw']}",
        "doc_type": "nda",
        "blocks": [
            b.p(f"Ref # {ctx['reference']}", align="right"),
            b.p(f"Date: {ctx['letter_date']}", align="right"),
            b.h(1, "Schedule B", underline=True),
            b.h(3, "Confidentiality and Proprietary Information Agreement"),
            b.p(f"This Agreement is made on this {b.dots(ctx['effective_date'])} (Date) by and between:"),
            b.p(
                # The AEZ agency-NDA source names the disclosing party "EZ Lab Private Limited" in
                # its recital, even though the letterhead is ArabEasy LLC (the customer's own PDF
                # crosses the two — the EZ version of this NDA names "ArabEasy LLC" instead). We
                # reproduce the source exactly, as asked; flagged to the owner as a likely
                # copy-paste in the original template worth confirming.
                f"EZ Lab Private Limited (\"**EZ**\"), having its business address at "
                f"{ctx['contracting_office']}, hereinafter duly represented by **{ez_name}** in his "
                f"capacity as {ez_title} (hereinafter referred to as \"**EZ**\" or \"**Disclosing "
                f"Party**\")"
            ),
            b.p("And"),
            b.p(
                f"**{b.dots(agency)}** (Name of the Agency/ service provider), a {b.dots(ctx['service_type'])} "
                f"(type of service) service provider with its principal office at {b.dots(ctx['agency_address'])}, hereinafter "
                f"duly represented by {b.dots(signatory)} (Name of the authorized signatory) in his capacity as {b.dots(ctx['agency_signatory_title'])} "
                f"(Position/Designation) (hereinafter referred to as \"**Service Provider**\" or \"**Receiving Party**\");"
            ),
            b.p("(Collectively hereinafter referred to as Parties and individually as Party)"),
            b.p("**WHEREAS**:"),
            b.p(
                f"EZ (**Disclosing Party**) wishes to employ the services of Service Provider "
                f"(**Receiving Party**) to provide {ctx['service_type']}."
            ),
            b.p(
                "For the purpose of the provision of the translation services by the Receiving "
                "Party, EZ will disclose Confidential Information to the Receiving Party."
            ),
            b.p(
                "NOW, THEREFORE, in consideration of the promises herein contained and the "
                "disclosures by EZ to Receiving Party of the Confidential Information to which this "
                "Agreement refers, it is mutually agreed as follows:"
            ),

            b.p(
                "1. Disclosing Party will give the Receiving Party access to proprietary and "
                "confidential information belonging to EZ, its clients, its suppliers and others "
                "(the proprietary and confidential information are collectively referred to in this "
                "Agreement as “**Confidential Information**”). Confidential Information includes but is "
                "not limited to client lists, marketing plans, proposals, contracts, technical "
                "and/or financial information, databases, software and know-how. All Confidential "
                "Information remains confidential and proprietary information of EZ."
            ),
            b.p(
                "2. As referred to herein, the “**Business of EZ**” shall relate to the business of EZ as "
                "the same is determined by the Proprietor of EZ from time to time."
            ),
            b.p(
                "3. The Receiving Party may in the course of the working process conceive, develop or "
                "contribute to material or information related to the Business of EZ, including, "
                "without limitation, software, technical documentation, ideas, inventions (whether or "
                "not patentable), hardware, know-how, marketing plans, designs, techniques, "
                "documentation, and records, regardless of the form or media, if any, on which such "
                "is stored (referred to in this Agreement as “**Proprietary Property**”). EZ shall "
                "exclusively own all Proprietary Property which the Participant conceives, develops "
                "or contributes to in the course of the working process and all intellectual and "
                "industrial property and other rights of any kind in or relating to the Proprietary "
                "Property, including but not limited to all copyright, patent, trade secret and "
                "trade-mark rights in or relating to the Proprietary Property. For greater certainty, "
                "the Receiving party hereby assigns to EZ any and all rights that the Participant may "
                "have or obtain in or to the Proprietary Property. Material or information conceived, "
                "developed or contributed to by the Receiving Party outside work hours on EZ’s "
                "premises or through the use of EZ’s property and/or assets shall also be Proprietary "
                "Property and be governed by this Agreement if such material or information relates "
                "to the Business of EZ. The Receiving Party shall keep full and accurate records "
                "accessible at all times to EZ relating to all Proprietary Property and shall "
                "promptly disclose and deliver to EZ all Proprietary Property."
            ),
            b.p(
                "4. The Receiving Party shall, both during and after the working process, keep all "
                "Confidential Information and Proprietary Property confidential and shall not use "
                "any of it except for the purpose of carrying out authorized activities on behalf of "
                "EZ. The Receiving Party may, however, use or disclose Confidential Information "
                "which:"
            ),
            b.ul([
                "i. is or becomes public other than through a breach of this Agreement;",
                "ii. is known to the Receiving Party prior to the date of this Agreement and with "
                "respect to which the Receiving Party does not have any obligation of "
                "confidentiality; or",
                "iii. is required to be disclosed by law, whether under an order of a court or "
                "government tribunal or other legal processes, provided that Receiving Party informs "
                "EZ of such requirement in sufficient time to allow EZ to avoid such disclosure by "
                "the Receiving Party.",
            ]),
            b.p(
                "The Receiving Party shall return or destroy, as directed by EZ, Confidential "
                "Information, and Proprietary Property to EZ upon request by EZ at any time. The "
                "Receiving Party shall certify, by way of affidavit or statutory declaration, that "
                "all such Confidential Information and Proprietary Property has been returned or "
                "destroyed, as applicable."
            ),
            b.p(
                "5. The Receiving Party covenants and agrees not to make any unauthorized use "
                "whatsoever of or to bring onto EZ’s premises for the purpose of making any "
                "unauthorized use whatsoever of any trade secrets, confidential information or "
                "proprietary property of any third party, including without limitation any "
                "trademarks or copyrighted materials, during the course of the working process. The "
                "Receiving Party agrees and represents that the working process and the execution of "
                "this Agreement do not and will not breach any agreement to which the Receiving Party "
                "is currently a Party or which currently applies to the Receiving Party."
            ),
            b.p(
                "6. The Receiving Party hereby irrevocably and unconditionally waives all moral "
                "rights the Receiving Party may now or in the future have in any Proprietary Property."
            ),
            b.p(
                "7. The Receiving Party agrees that the Receiving Party will if requested from time "
                "to time by EZ, execute such further reasonable agreements as to confidentiality and "
                "proprietary rights as EZ’s clients or suppliers reasonably required to protect "
                "Confidential Information or Proprietary Property."
            ),
            b.p(
                "8. The Receiving Party agrees that the Receiving Party’s sole and exclusive remedy "
                "for any breach of this Agreement or any other agreement by EZ will be limited to "
                "monetary damages and that the Receiving Party will not make any claim in respect of "
                "any rights to or interest in any Confidential Information or Proprietary Property."
            ),
            b.p(
                "9. The Receiving Party acknowledges that the Services provided by the Receiving "
                "Party to EZ are unique. The Receiving Party further agrees that irreparable harm "
                "will be suffered by EZ in the event of the Participant’s breach or threatened breach "
                "of any of his or her obligations under this Agreement and that EZ will be entitled "
                "to seek, in addition to any other rights and remedies that it may have at law or "
                "equity, a temporary or permanent injunction restraining the Receiving Party from "
                "engaging in or continuing any such breach hereof. Any claims asserted by the "
                "Participant against EZ shall not constitute a defence in any injunction action, "
                "application, or motion brought against the Receiving Party by EZ."
            ),
            b.p(
                f"10. This Agreement is governed by the laws of {ctx['governing_law']} and the "
                f"Receiving Party agrees to the non- exclusive jurisdiction of the courts of "
                f"{ctx['jurisdiction']} in relation to this Agreement."
            ),
            b.p(
                "11. If any provision of this Agreement is held by a court of competent jurisdiction "
                "to be invalid or unenforceable, that provision shall be deleted and the other "
                "provisions shall remain in effect."
            ),

            b.p(
                f"**IN WITNESS WHEREOF** EZ has caused this Agreement to be executed as of the "
                f"{ctx['effective_date']}."
            ),
            b.signature(
                ("SIGNED for and on behalf of Service Provider", ""),
                ("SIGNED for and on behalf of EZ", ez_name.upper(), None, ez_title),
            ),
        ],
    }


register(
    "aez_agency_nda",
    agency_nda,
    label="Agency NDA",
    description=(
        "Standalone Confidentiality and Proprietary Information Agreement between ArabEasy LLC and "
        "a service-provider agency. 11 clauses, signed by both parties."
    ),
    entity="AEZ",
    doc_type="nda",
    party_type="agency",
    contract_type="agency",
)


# Clause 1 / clause 3 defaults as printed in the ArabEasy agency contract. HR can override either
# through the `services` / `fees` context keys; these are what the blank template ships with.
_AEZ_AGENCY_SERVICES = [
    "Basic Level Design",
    "Intermediate Level Design",
    "High Level Designs",
    "Customized Design Projects",
    "Coordinating with the subject matter experts i.e. in-house team, to insure on-time delivery "
    "and high-quality delivery.",
    "Ensuring brand identity and message consistency across channels.",
    "Developing concepts, strategies and client ready projects.",
]

_AEZ_AGENCY_FEES = [
    "Basic Slide: $ per slide",
    "High-end Slide: $ per slide",
    "Basic/High-end Slide hourly basis: $ per hour",
]

_AEZ_NDA_CLAUSES = [
    "Disclosing Party will give the Receiving Party access to proprietary and confidential "
    "information belonging to EZ, its clients, its suppliers and others (the proprietary and "
    "confidential information are collectively referred to in this Agreement as “**Confidential "
    "Information**”). Confidential Information includes but is not limited to client lists, marketing "
    "plans, proposals, contracts, technical and/or financial information, databases, software and "
    "know-how. All Confidential Information remains confidential and proprietary information of EZ.",

    "As referred to herein, the “**Business of EZ**” shall relate to the business of EZ as the same is "
    "determined by the Proprietor of EZ from time to time.",

    "The Receiving Party may in the course of the working process conceive, develop or contribute "
    "to material or information related to the Business of EZ, including, without limitation, "
    "software, technical documentation, ideas, inventions (whether or not patentable), hardware, "
    "know-how, marketing plans, designs, techniques, documentation, and records, regardless of the "
    "form or media, if any, on which such is stored (referred to in this Agreement as “**Proprietary "
    "Property**”). EZ shall exclusively own all Proprietary Property which the Participant conceives, "
    "develops or contributes to in the course of the working process and all intellectual and "
    "industrial property and other rights of any kind in or relating to the Proprietary Property, "
    "including but not limited to all copyright, patent, trade secret and trade-mark rights in or "
    "relating to the Proprietary Property. For greater certainty, the Receiving party hereby assigns "
    "to EZ any and all rights that the Participant may have or obtain in or to the Proprietary "
    "Property. Material or information conceived, developed or contributed to by the Receiving Party "
    "outside work hours on EZ’s premises or through the use of EZ’s property and/or assets shall "
    "also be Proprietary Property and be governed by this Agreement if such material or information "
    "relates to the Business of EZ. The Receiving Party shall keep full and accurate records "
    "accessible at all times to EZ relating to all Proprietary Property and shall promptly disclose "
    "and deliver to EZ all Proprietary Property.",

    None,  # clause 4 carries the i-iii sub-limbs; inserted separately

    "The Receiving Party covenants and agrees not to make any unauthorized use whatsoever of or to "
    "bring onto EZ’s premises for the purpose of making any unauthorized use whatsoever of any trade "
    "secrets, confidential information or proprietary property of any third party, including without "
    "limitation any trademarks or copyrighted materials, during the course of the working process. "
    "The Receiving Party agrees and represents that the working process and the execution of this "
    "Agreement do not and will not breach any agreement to which the Receiving Party is currently a "
    "Party or which currently applies to the Receiving Party.",

    "The Receiving Party hereby irrevocably and unconditionally waives all moral rights the Receiving "
    "Party may now or in the future have in any Proprietary Property.",

    "The Receiving Party agrees that the Receiving Party will if requested from time to time by EZ, "
    "execute such further reasonable agreements as to confidentiality and proprietary rights as EZ’s "
    "clients or suppliers reasonably required to protect Confidential Information or Proprietary "
    "Property.",

    "The Receiving Party agrees that the Receiving Party’s sole and exclusive remedy for any breach "
    "of this Agreement or any other agreement by EZ will be limited to monetary damages and that the "
    "Receiving Party will not make any claim in respect of any rights to or interest in any "
    "Confidential Information or Proprietary Property.",

    "The Receiving Party acknowledges that the Services provided by the Receiving Party to EZ are "
    "unique. The Receiving Party further agrees that irreparable harm will be suffered by EZ in the "
    "event of the Participant’s breach or threatened breach of any of his or her obligations under "
    "this Agreement and that EZ will be entitled to seek, in addition to any other rights and "
    "remedies that it may have at law or equity, a temporary or permanent injunction restraining the "
    "Receiving Party from engaging in or continuing any such breach hereof. Any claims asserted by "
    "the Participant against EZ shall not constitute a defence in any injunction action, application, "
    "or motion brought against the Receiving Party by EZ.",

    "This Agreement is governed by the laws of UAE and the Receiving Party agrees to the "
    "non-exclusive jurisdiction of the courts of Sharjah in relation to this Agreement.",

    "If any provision of this Agreement is held by a court of competent jurisdiction to be invalid or "
    "unenforceable, that provision shall be deleted and the other provisions shall remain in effect.",
]


def _aez_nda_blocks() -> list[dict]:
    """Schedule B's 11 clauses, numbered explicitly so clause 4 keeps its i-iii sub-limbs and its
    trailing return-or-destroy paragraph inside the same clause."""
    out: list[dict] = []
    for i, text in enumerate(_AEZ_NDA_CLAUSES, 1):
        if text is None:
            out.append(b.p(
                "4. The Receiving Party shall, both during and after the working process, keep all "
                "Confidential Information and Proprietary Property confidential and shall not use "
                "any of it except for the purpose of carrying out authorized activities on behalf of "
                "EZ. The Receiving Party may, however, use or disclose Confidential Information "
                "which:"
            ))
            out.append(b.ul([
                "i. is or becomes public other than through a breach of this Agreement;",
                "ii. is known to the Receiving Party prior to the date of this Agreement and with "
                "respect to which the Receiving Party does not have any obligation of "
                "confidentiality; or",
                "iii. is required to be disclosed by law, whether under an order of a court or "
                "government tribunal or other legal processes, provided that Receiving Party informs "
                "EZ of such requirement in sufficient time to allow EZ to avoid such disclosure by "
                "the Receiving Party.",
            ]))
            out.append(b.p(
                "The Receiving Party shall return or destroy, as directed by EZ, Confidential "
                "Information, and Proprietary Property to EZ upon request by EZ at any time. The "
                "Receiving Party shall certify, by way of affidavit or statutory declaration, that "
                "all such Confidential Information and Proprietary Property has been returned or "
                "destroyed, as applicable."
            ))
            continue
        out.append(b.p(f"{i}. {text}"))
    return out


def agency_contract(ctx: dict) -> dict:
    """Agency Contract (AEZ, agency, agency, contract).

    Faithful to 'Date_Agency Contract_ArabEasy_Name of the Agency.docx.pdf': cover letter,
    Schedule A (14 clauses of terms and conditions), Schedule B (Confidentiality and Proprietary
    Information Agreement, 11 clauses) and Annexure A (bank details form).
    """
    agency = ctx["agency_name"]
    signatory = ctx["agency_signatory_name"]
    office = ctx["contracting_office"]
    ez_name = ctx["contract_signatory_name"]
    ez_title = ctx["contract_signatory_title"]
    services = [str(s).strip() for s in (ctx.get("services") or []) if str(s).strip()] or _AEZ_AGENCY_SERVICES
    fees = [str(f).strip() for f in (ctx.get("fees") or []) if str(f).strip()] or _AEZ_AGENCY_FEES
    # The heading rides inside the block: kept as a loose paragraph it gets orphaned, ending one
    # page while the rules it introduces start the next, jammed under the letterhead.
    #
    # Two variants because this document signs twice — once at the end of Schedule A and once at
    # the end of Schedule B — and the source only announces it the first time. Baking the heading
    # into one shared block printed "Signed in the presence of:" twice.
    _cols = (
        ("For Service Provider", ""),
        ("For EZ Services", ez_name.upper(), None, ez_title),
    )
    sign_off_headed = b.signature(*_cols, heading="Signed in the presence of:", heading_align="right")
    sign_off = b.signature(*_cols)

    return {
        "title": f"Agency Contract - {ctx['agency_name_raw']}",
        "doc_type": "contract",
        "blocks": [
            # ── Cover letter ──────────────────────────────────────────────────────────────
            b.p(f"Ref # {ctx['reference']}", align="right"),
            # The source sets the salutation and the date on one band, not stacked.
            b.row([b.p(f"Dear {b.dots(ctx['agency_poc_name'])} (Name of the POC or authorized signatory),")],
                  [b.p(f"Date: {ctx['letter_date']}", align="right")]),
            b.p(
                f"We are pleased to confirm our verbal discussion to bring you on as a Service "
                f"Provider for {b.dots(ctx['service_type'])} (type of Services) at ARABEASY LLC (hereinafter referred to as "
                f"\"**EZ**\"), effective {b.dots(ctx['commencement_date'])} (Start Date). You are to keep all our "
                f"client and EZ’s information confidential. Additional details regarding the work "
                f"process and a non-disclosure agreement is attached for your review and "
                f"confirmation."
            ),
            b.p(
                "Additional details of our offer, including the terms and conditions, are attached "
                "as Schedule “A”."
            ),
            b.p(
                f"Please take the time to carefully review our offer. This letter, along with the "
                f"enclosed schedules, outlines the obligations of both EZ and {b.dots(agency)} (Name of the Agency), represented "
                f"for the purpose of this Agreement through its authorized signatory, {b.dots(signatory)} (Name of the authorized signatory)."
            ),
            b.p(
                "Accepting the offer will be conditional upon agreeing to and signing the attached "
                "copy of this offer letter, and the attached schedule(s), initialling each page in "
                "the right-hand corner, and returning it to me upon your earliest convenience, but "
                "prior to the first day of our business cooperation."
            ),
            b.p(
                f"{b.dots(signatory)} (Name of the authorized signatory), we look forward to welcoming you to the EZ team and wish you all the "
                f"success."
            ),
            b.p("Sincerely,"),
            b.space(43),   # room to sign, measured off the source letter
            b.p(f"**{ez_name}**"),
            b.p(ez_title),
            b.divider(),

            # ── Schedule A ────────────────────────────────────────────────────────────────
            b.h(1, "Schedule A", underline=True),
            b.h(3, f"Terms and Conditions of Contract between {agency} and EZ"),
            b.p("The following outlines the terms and conditions of a contract by and between:"),
            b.p(
                f"{b.dots(agency)} (Name of the Agency), represented for the purpose of this Agreement by "
                f"**{b.dots(signatory)}**, having its registered office at {b.dots(ctx['agency_address'])} (the "
                f"\"**Service Provider**\")."
            ),
            b.p("And"),
            b.p(
                f"**EZ**, represented by **{ez_name}**, having its registered office at {office} "
                f"(\"**Disclosing Party**\")"
            ),
            b.p(
                "(Collectively hereinafter referred to as the \"**Parties**\" and individually as a "
                "\"**Party**\")"
            ),
            b.p(
                f"**WHEREAS**: Service Provider has a reputable {ctx['service_type']} (Type of "
                f"Service or service name);"
            ),
            b.p(
                f"**WHEREAS**: **EZ** desires to engage the Service Provider to provide "
                f"{ctx['service_name']} (Name of the service) (the \"**Services**\")"
            ),
            b.p("**Now, Therefore**, Parties mutually agreed as follows:"),

            b.h(2, "1. Description of services.", underline=True),
            b.p("Service Provider shall provide the following service(s):"),
            b.ul(services + [
                "The Service Provider shall, at all times during the term of this Agreement, fully "
                "co-operate with the EZ and maintain high professional standard.",
                "The Service Provider shall at all times be in a position to meet the EZ’s requests "
                "in accordance with the terms of this Agreement.",
            ]),

            b.h(2, "2. Work process:", underline=True),
            b.p(
                "EZ provides Services to its client’s round the clock, every day of the year. Client "
                "requests shall be sent to the Service Provider as and when received by EZ. The "
                "Service Provider may express interest and the Delivery team at EZ shall assign the "
                "assignment to the Service Provider based on its response, turnaround time, expertise "
                "on topic, prior performance, and other such factors."
            ),

            b.h(2, "3. Fees for service.", underline=True),
            b.p("EZ agrees to pay the below charges - as Service Provider fee for the above services."),
            b.ul(fees + [
                "The Service Provider shall be responsible for paying all taxes, levies, duties, fees "
                "and social and medical insurance charges required to be paid by the Service Provider "
                "or its employees, subcontractors, representatives or agents under this Agreement or "
                "otherwise payable in respect to the performance of the obligations under the "
                "Agreement as per the prevalent laws of the respective laws of the land.",
                "EZ shall not be obligated to reimburse the Service Provider for any travel or other "
                "out-of-pocket expenses incurred in the performance of obligations pursuant to this "
                "Agreement unless expressly agreed by EZ in advance.",
            ]),

            b.h(2, "4. Method & Format of delivery:", underline=True),
            b.p(
                "Both Parties agree that the Services shall be delivered to the EZ by email or on EZ "
                "Workspace and in the format as instructed by the EZ."
            ),

            b.h(2, "5. Payment schedule:", underline=True),
            b.p(
                "5.1 Service Provider shall send a detailed invoice with all the assignments "
                "completed and delivered EZ for a month by the 15th of the following month. All items "
                "of this invoice will be eligible for payment in that month’s cycle."
            ),
            b.p(
                "5.2 All payments will be processed by EZ within 30 days from the date of raising the "
                "invoice. Any additional charges levied by Service Provider’s bank on inbound foreign "
                "remittance will be its responsibility."
            ),
            b.p(
                "5.3 Please note that EZ bank will process remittances within 30 days from the date "
                "of raising the invoice. Any delays due to Service Provider’s bank or an intermediary "
                "bank beyond EZ’s control shall not incur any liability."
            ),

            b.h(2, "6. Method of Payment:", underline=True),
            b.p(
                f"Payment shall be made via bank transfer to the representative of Service Provider’s "
                f"bank account: {ctx['bank_name']} (Name of the Bank). The details of which are to be "
                f"communicated by Service Provider to EZ by filling the form in the Annxure A as well "
                f"as at the time that the invoices referred to above are sent to EZ."
            ),

            b.h(2, "7. Cancellation or withdrawal by EZ.", underline=True),
            b.p(
                "In case EZ cancels or withdraws any portion of the item(s) described in clause No. 1 "
                "above prior to Service Provider completion of the Service(s), then, in consideration "
                "of Service Provider scheduling and/or performing said Service(s), EZ shall pay "
                "Service Provider the portion of the above fee represented by the percentage of total "
                "Service(s) performed."
            ),

            b.h(2, "8. Changes by others.", underline=True),
            b.p(
                "Service Provider shall have no responsibility whatever as to any changes in the "
                "delivered output made by persons other than Service Provider."
            ),

            b.h(2, "9. Additional fees", underline=True),
            b.p(
                "9.1 Additional fees will be payable, to be calculated as provided below, in the "
                "event the following additional Services are required: (a) investigation, inquiry, or "
                "research beyond that normal to a routine service is required because of ambiguities "
                "in the delivered item(s); (b) additional Services are required because changes are "
                "made in the item(s) after the signing of this Agreement; and (c) **Service "
                "Provider** is requested to make changes in the document after delivery of the "
                "document, as per preferences, and such changes are not required for accuracy. Such "
                "additional fees will be calculated according to the pre-defined fees of various "
                "services."
            ),
            b.p(
                "9.2 The additional fees will not be payable by EZ, if the EZ’s QA team or its client "
                "has noted numerous errors or serious quality issues, and EZ can request **Service "
                "Provider** for changes in the document in order to correct such errors or "
                "inaccuracies."
            ),

            b.h(2, "10. Confidentiality and intellectual property", underline=True),
            b.p(
                "10.1 This contract is conditional upon the **Service Provider** agreeing to and "
                "abiding by the “Confidentiality and Proprietary Information Agreement.” Attached "
                "Schedule “B.”"
            ),

            b.h(2, "11. Non-Solicitation and Non-Competition", underline=True),
            b.p(
                "11.1 The Service Provider (or its Affiliate) shall not be directly or indirectly "
                "engaged or interested in any trade, business or occupation other than the business "
                "of EZ which may prevent it from carrying out its duties effectively or which may be "
                "detrimental to the EZ’s interests, during the course of the Agreement."
            ),
            b.p(
                "11.2 Both parties specifically agree that for a period of two (2) years after the "
                "expiry or termination of the Agreement, the parties (or their Affiliate/s) shall "
                "not, directly or indirectly, either as proprietor, stockholder, partner, officer, "
                "employee, consultant or otherwise:"
            ),
            b.ul([
                "a) Solicit, induce, or attempt to solicit or induce any employee, contractor, or "
                "consultant of the other party (or any person who was employed by the other party "
                "within the past one year) to terminate their relationship with the other party or to "
                "accept employment or engagement with the other party or any third party associated "
                "with the Service Provider/EZ, without the prior written consent of affected party;",
                "b) Solicit, interfere with, or endeavour to entice away from each other, any client, "
                "customer, or prospective client or customer with whom the Service Provider/EZ had "
                "direct dealings or material contact during the term of the Agreement, for the "
                "purpose of offering or providing services or products that are similar to those "
                "offered by EZ/Service Proivder.",
            ]),
            b.p(
                "For the purposes of this clause, “**Affiliate**” shall mean an entity that controls, "
                "or is controlled by, or is under common control of the Service Provider/EZ or any "
                "entity that controls the Service Provider/EZ."
            ),

            b.h(2, "12. Termination", underline=True),
            b.p(
                f"12.1 This Agreement shall commence on {ctx['commencement_date']} (date) and remain "
                f"in effect for a term of one (1) year. This Agreement shall be automatically renewed "
                f"for another one-year period by mutual agreement of the Parties to this Agreement."
            ),
            b.p("Any party may terminate this Agreement:"),
            b.ul([
                "a) Without reason or cause, upon 15 (Fifteen) days’ notice to the other Party; or",
                "b) Immediately upon notice, in the event of a breach by the other Party of the "
                "provisions of this Agreement.",
            ]),
            b.p(
                "12.2 Notwithstanding anything contained herein, if either Party commits any breach "
                "of the terms and conditions contained herein, the other Party shall give 7 (seven) "
                "days’ notice to remedy the breach and on the failure of the Party who has committed "
                "the breach to do so, the other Party to this Agreement shall be entitled to "
                "cancel/terminate this Agreement by giving a 7 (seven) days’ written notice."
            ),

            b.h(2, "13. Complete agreement", underline=True),
            b.p(
                "This is the complete agreement of the parties as to the subject matter hereof. Any "
                "changes in this Agreement must be in writing signed by both parties. This Agreement "
                "becomes a binding contract only upon signature by both parties and the delivery of "
                "fully signed copies to each party."
            ),

            b.h(2, "14. Applicable Law and Jurisdiction", underline=True),
            b.ul([
                f"1. This Agreement is governed by the laws of {ctx['governing_law']} and the "
                f"Receiving Party agrees to the non-exclusive jurisdiction of the courts of "
                f"{ctx['jurisdiction']} in relation to this Agreement.",
                "2. If any provision of this Agreement is held by a court of competent jurisdiction "
                "to be invalid or unenforceable, that provision shall be deleted and the other "
                "provisions shall remain in effect.",
            ]),
            sign_off_headed,
            b.divider(),

            # ── Schedule B ────────────────────────────────────────────────────────────────
            b.h(1, "Schedule B", underline=True),
            b.h(3, "Confidentiality and Proprietary Information Agreement"),
            b.p(f"This Agreement is made on this **{b.dots(ctx['effective_date'])}** (Date) by and between:"),
            b.p(
                f"ArabEasy LLC (“**EZ**”), having its business address at {office}, hereinafter duly "
                f"represented by **{ez_name}** in his capacity as Founder and CEO (hereinafter "
                f"referred to as “**EZ**” or “**Disclosing Party**”)"
            ),
            b.p("And"),
            b.p(
                f"**{b.dots(agency)}** (Name of the Agency), a {b.dots(ctx['service_type'])} (type of service) with "
                f"its principal office at {b.dots(ctx['agency_address'])}, hereinafter duly represented by "
                f"{b.dots(signatory)} (Name of the Authorized Signatory) in his capacity as "
                f"{b.dots(ctx['agency_signatory_title'])} (Position/Designation) (hereinafter referred to as "
                f"“**Service Provider**” or “**Receiving Party**”);"
            ),
            b.p("(Collectively hereinafter referred to as Parties and individually as Party)"),
            b.p("**WHEREAS**:"),
            b.p(
                f"EZ (**Disclosing Party**) wishes to employ the services of Service Provider "
                f"(**Receiving Party**) to provide {ctx['service_type']} (type of Services)."
            ),
            b.p(
                "For the purpose of the provision of the translation services by the Receiving Party, "
                "EZ will disclose Confidential Information to the Receiving Party."
            ),
            b.p(
                "NOW, THEREFORE, in consideration of the promises herein contained and the "
                "disclosures by EZ to Receiving Party of the Confidential Information to which this "
                "Agreement refers, it is mutually agreed as follows:"
            ),
            *_aez_nda_blocks(),
            b.p(
                f"**IN WITNESS WHEREOF** EZ has caused this Agreement to be executed as of the "
                f"{ctx['commencement_date']} (Start Date)."
            ),
            sign_off,
            b.divider(),

            # ── Annexure A ────────────────────────────────────────────────────────────────
            b.h(1, "Annexure A"),
            b.h(3, "Bank Details Form"),
            b.terms([(label, []) for label in (
                "Email Address",
                "PayPal ID (If available)",
                "Beneficiary Name",
                "Bank Name",
                "Bank Branch Address",
                "IFSC/SWIFT Code",
                "Bank Account number",
                "IBAN Number",
                "Type of Account",
                "Currency you would like to receive payment in",
                "Preferred mode of payment (PayPal or Bank Transfer)",
            )]),
        ],
    }


register(
    "aez_agency_contract",
    agency_contract,
    label="Agency Contract",
    description=(
        "ArabEasy LLC service-provider contract with an agency: cover letter, Schedule A terms & "
        "conditions, Schedule B confidentiality agreement and the Annexure A bank details form."
    ),
    entity="AEZ",
    doc_type="contract",
    party_type="agency",
    contract_type="agency",
)


# Clause 8's sub-limbs in the standalone freelance NDA. This list runs to five: it carries an
# employee non-solicit limb (iii) that the Schedule B bound into the freelance contract does not,
# which is why this NDA is its own template rather than a reference to that one.
_FREELANCE_NDA_NONSOLICIT = [
    "i. The Freelancer (or its Affiliate) shall not be directly or indirectly engaged or interested "
    "in any trade, business or occupation other than the business of EZ which may prevent it from "
    "carrying out its duties effectively or which may be detrimental to the EZ’s interests, during "
    "the course of the Agreement.",

    "ii. The Freelancer specifically agree that for a period of two (2) years after expiry or "
    "termination of the Agreement, Freelancer (or its Affiliate) shall not engage, directly or "
    "indirectly, either as proprietor, stockholder, partner, officer, employee or otherwise, in the "
    "same or similar activities as were performed for EZ in any business which distributes or sells "
    "products or provides services similar to those distributed, sold, or provided by EZ during the "
    "term of Agreement.",

    "iii. The Freelancer specifically agree that for a period of two (2) years after expiry or "
    "termination of the Agreement, Freelancer (or its Affiliate) shall not solicit, induce, or "
    "attempt to solicit or induce any employee, contractor, or consultant of EZ (or any person who "
    "was employed by EZ within the past one year) to terminate their relationship with EZ or to "
    "accept employment or engagement with the Service Provider (or its Affiliate) or any third party "
    "associated with the Service Provider, without the prior written consent of EZ;",

    "iv. The Freelancer specifically agree that for a period of two (2) years after expiry or "
    "termination of the Agreement, Freelancer (or its Affiliate) shall not, directly or indirectly, "
    "either as proprietor, stockholder, partner, officer, employee or otherwise, distribute, sell, "
    "offer to sell, or solicit any orders for the purchase or distribution of any products or "
    "services which are similar to those distributed, sold or provided by EZ during the term of "
    "Agreement.",

    "v. The Freelancer specifically agrees that for two (2) years after expiry or termination of the "
    "Agreement, Freelancer (or its Affiliate) shall not directly or indirectly solicit, agree to "
    "perform or perform services of any type that the EZ can render (the \"**Services**\") for any person "
    "or entity who paid or engaged the EZ for the Services, or who received the benefit of EZ's "
    "Services, or with whom Freelancer (or its Affiliate) had any substantial dealing during the "
    "term of Agreement.",
]


def freelance_nda(ctx: dict) -> dict:
    """Freelance NDA (AEZ, individual, freelance, nda).

    Faithful to 'Date_NDA_ArabEasy Freelance.docx.pdf': the standalone Schedule B Covenants /
    Confidentiality and Proprietary Information Agreement for a freelancer, 21 clauses, witnessed.
    """
    who = ctx["name"]
    witness = ctx["signatory_name"]

    return {
        "title": f"Freelance NDA - {who}",
        "doc_type": "nda",
        "blocks": [
            b.p(f"Ref # {ctx['reference']}", align="right"),
            b.p(f"Date: {ctx['letter_date']}", align="right"),
            b.h(1, "Schedule B", underline=True),
            b.h(3, "Covenants"),
            b.h(3, "Confidentiality and Proprietary Information Agreement"),
            b.p(
                "In consideration of freelance contract as a freelancer or engagement as an "
                "independent contractor with ArabEasy LLC, the undersigned (the “**Participant**”) "
                "agrees, and covenants as follows:"
            ),

            b.p(
                "1. Freelance contract with EZ as a freelancer or engagement with EZ as an "
                "independent contractor, as the case may be (the “**Engagement**”), will give the "
                "Participant access to proprietary and confidential information belonging to EZ, its "
                "clients, its suppliers and others (the proprietary and confidential information is "
                "collectively referred to in this Agreement as “**Confidential Information**”). "
                "Confidential Information includes but is not limited to client lists, marketing "
                "plans, proposals, contracts, technical and/or financial information, databases, "
                "software, and know-how. All Confidential Information remains confidential and "
                "proprietary information of EZ."
            ),
            b.p(
                "2. By accepting this Offer of freelance contract, you agree and accept that you "
                "shall not, either during your freelance contract (other than in the course of "
                "fulfilling your obligations as a freelancer) or at any time afterwards, use to the "
                "detriment or prejudice of the Employer or communicate or divulge to any person, any "
                "information that may be confidential or proprietary information of the Employer "
                "which comes to your knowledge during your freelance contract including, without "
                "limitation, all data, client list including their details and related information, "
                "technical information, commercial and research strategies, trade secrets and "
                "know-how and any other information related to the business and operations of the "
                "Employer."
            ),
            b.p(
                "3. The contents of this Offer, and of all related agreements or arrangements, shall "
                "be held in confidence by you and shall not be disclosed to any third party without "
                "the prior approval of the Employer."
            ),
            b.p(
                "4. Any breach of confidentiality obligations by you may result in disciplinary "
                "measures by the Employer, including your dismissal without notice."
            ),
            b.p(
                "5. You are required to share data and files related to closed assignments completed "
                "in a specific month by the end of the first week of the following month. This "
                "sharing must be conducted through organization-approved and secure channels to "
                "ensure data security and confidentiality. Subsequently, it is your responsibility to "
                "promptly delete any project-related data from your personal electronic devices, "
                "including personally owned cellphones, smartphones, tablets, laptops, or computers, "
                "to prevent unauthorized access."
            ),
            b.p(
                "Furthermore, you are permitted to use your personal electronic devices for work "
                "purposes, subject to compatibility with organizational technology standards. "
                "However, this usage comes with the explicit expectation that you will adhere to all "
                "security protocols and guidelines provided by the organization. Exercise caution "
                "when sharing access to project files and data, limiting it to only those individuals "
                "who have a legitimate need to know. Any breach, suspicious activities, or concerns "
                "regarding data security should be reported promptly to the designated authority "
                "within the organization."
            ),
            b.p(
                "6. As referred to herein, the “**Business of EZ**” shall relate to the business of EZ as "
                "the same is determined by the Proprietor of EZ from time to time."
            ),
            b.p(
                "7. The Participant may in the course of the Engagement conceive, develop or "
                "contribute to material or information related to the Business of EZ, including, "
                "without limitation, software, technical documentation, ideas, inventions (whether or "
                "not patentable), hardware, know-how, marketing plans, designs, techniques, "
                "documentation and records, regardless of the form or media, if any, on which such is "
                "stored (referred to in this Agreement as “**Proprietary Property**”). EZ shall "
                "exclusively own all Proprietary Property which the Participant conceives, develops "
                "or contributes to in the course of the Engagement and all intellectual and "
                "industrial property and other rights of any kind in or relating to the Proprietary "
                "Property, including but not limited to all copyright, patent, trade secret and "
                "trade-mark rights in or relating to the Proprietary Property. For greater certainty, "
                "the Participant hereby assigns to EZ any and all rights that the Participant may "
                "have or obtain in or to the Proprietary Property. Material or information conceived, "
                "developed or contributed to by the Participant outside work hours on EZ’s premises "
                "or through the use of EZ’s property and/or assets shall also be Proprietary Property "
                "and be governed by this Agreement if such material or information relates to the "
                "Business of EZ. The Participant shall keep full and accurate records accessible at "
                "all times to EZ relating to all Proprietary Property and shall promptly disclose and "
                "deliver to EZ all Proprietary Property."
            ),
            b.p("8. Non-Solicitation and Non-Competition"),
            b.ul(_FREELANCE_NDA_NONSOLICIT),
            b.p(
                "For the purposes of this clause, “**Affiliate**” shall mean an entity that controls, or "
                "is controlled by, or is under common control of the Freelancer or any entity that "
                "controls the Freelancer."
            ),
            b.p(
                "9. The Participant shall, both during and after the Engagement, keep all "
                "Confidential Information and Proprietary Property confidential and shall not use "
                "any of it except for the purpose of carrying out authorized activities on behalf of "
                "EZ. The Participant may, however, use or disclose Confidential Information which:"
            ),
            b.ul([
                "(i) is or becomes public other than through a breach of this Agreement.",
                "(ii) is known to the Participant prior to the date of this Agreement and with "
                "respect to which the Participant does not have any obligation of confidentiality; or",
                "(iii) is required to be disclosed by law, whether under an order of a court or "
                "government tribunal or other legal process, provided that Participant informs EZ of "
                "such requirement in sufficient time to allow EZ to avoid such disclosure by the "
                "Participant.",
            ]),
            b.p(
                "10. The Participant shall return or destroy, as directed by EZ, Confidential "
                "Information and Proprietary Property to EZ upon request by EZ at any time. The "
                "Participant shall certify, by way of affidavit or statutory declaration, that all "
                "such Confidential Information and Proprietary Property has been returned or "
                "destroyed, as applicable."
            ),
            b.p(
                "11. The Participant covenants and agrees not to make any unauthorized use whatsoever "
                "of or to bring onto EZ’s premises for the purpose of making any unauthorized use "
                "whatsoever of any trade secrets, confidential information or proprietary property of "
                "any third party, including without limitation any trade-marks or copyrighted "
                "materials, during the course of the Engagement. The Participant agrees and "
                "represents that the Engagement and the execution of this Agreement do not and will "
                "not breach any agreement to which the Participant is currently a party, or which "
                "currently applies to the Participant."
            ),
            b.p(
                "12. At the reasonable request and at the sole expense of EZ, the Participant shall "
                "do all reasonable acts necessary and sign all reasonable documentation necessary in "
                "order to ensure EZ’s ownership of the Proprietary Property and all intellectual and "
                "industrial property rights and other rights in the same, including but not limited "
                "to providing to EZ written assignments of all rights to EZ and any other documents "
                "required to enable EZ to document rights to and/or register patents, copyrights, "
                "trade-marks, industrial designs and such other protections as EZ considers advisable "
                "anywhere in the world."
            ),
            b.p(
                "13. The Participant hereby irrevocably and unconditionally waives all moral rights "
                "the Participant may now or in the future have in any Proprietary Property."
            ),
            b.p(
                "14. The Participant agrees that the Participant will, if requested from time to time "
                "by EZ, execute such further reasonable agreements as to confidentiality and "
                "proprietary rights as EZ’s clients or suppliers reasonably required to protect "
                "Confidential Information or Proprietary Property."
            ),
            b.p(
                "15. Regardless of any changes in position, salary or otherwise, including, without "
                "limitation, termination of the Engagement, unless otherwise stipulated pursuant to "
                "the terms hereof, the Participant will continue to be subject to each of the terms "
                "and conditions of this Agreement and any other(s) executed pursuant to the preceding "
                "paragraph."
            ),
            b.p(
                "16. The Participant agrees that the Participant’s sole and exclusive remedy for any "
                "breach of this Agreement or any other agreement by EZ will be limited to monetary "
                "damages and that the Participant will not make any claim in respect of any rights to "
                "or interest in any Confidential Information or Proprietary Property."
            ),
            b.p(
                "17. The Participant agrees that, during the term of this Agreement and for one (1) "
                "year after termination for any reason, he or she will not hire or solicit nor "
                "attempt to hire or solicit EZ’s employees (or any person who was employed by EZ "
                "within the past one year) without the prior written consent of EZ."
            ),
            b.p(
                "18. The Participant acknowledges that, during the term of this Agreement, he or she "
                "may become familiar with Confidential Information concerning such Related Companies, "
                "and with investment opportunities relating to their respective businesses and "
                "therefore agree that, during the term of this Agreement and for a period of two "
                "years thereafter (the “**Noncompete Period**”), he or she will not directly or "
                "indirectly own, manage, control, participate in, consult with, render services for, "
                "or in any other manner engage in any business, or invest in or lend money to any "
                "business which constitutes or is competitive with (including, without limitation, by "
                "competing for the same subscriber or client base) any business conducted by any "
                "System owned or managed by any Related Company (as and where such Systems are "
                "operated or managed or are proposed to be operated or managed by EZ during the term "
                "of this Agreement, or as of the end of the Noncompete Period."
            ),
            b.p(
                "19. The Participant acknowledges that the services provided by the Participant to EZ "
                "are unique. The Participant further agrees that irreparable harm will be suffered by "
                "EZ in the event of the Participant’s breach or threatened breach of any of his or "
                "her obligations under this Agreement, and that EZ will be entitled to seek, in "
                "addition to any other rights and remedies that it may have at law or equity, a "
                "temporary or permanent injunction restraining the Participant from engaging in or "
                "continuing any such breach hereof. Any claims asserted by the Participant against EZ "
                "shall not constitute a defence in any injunction action, application or motion "
                "brought against the Participant by EZ."
            ),
            b.p(
                "20. This Agreement is governed by the laws of the UAE and the Participant agrees to "
                "the non-exclusive jurisdiction of the courts of Sharjah in relation to this "
                "Agreement."
            ),
            b.p(
                "21. If any provision of this Agreement is held by a court of competent jurisdiction "
                "to be invalid or unenforceable, that provision shall be deleted, and the other "
                "provisions shall remain in effect."
            ),

            b.p(
                f"**IN WITNESS WHEREOF** EZ has caused this Agreement to be executed as of the "
                f"{ctx['execution_date']}."
            ),
            b.signature(
                ("PARTICIPANT - NAME", "" if who.startswith("[") else who.upper()),
                ("WITNESS to PARTICIPANT - NAME", witness.upper(), witness, ctx["signatory_title"]),
                heading="Signed in the presence of:",
                heading_align="right",
            ),
        ],
    }


register(
    "aez_freelance_nda",
    freelance_nda,
    label="Freelance NDA",
    description=(
        "Standalone Covenants / Confidentiality and Proprietary Information Agreement signed by an "
        "ArabEasy freelancer. 21 clauses including the five-limb non-solicitation covenant."
    ),
    entity="AEZ",
    doc_type="nda",
    party_type="individual",
    contract_type="freelance",
)


# The standalone professional-service NDA's 29 covenants. Held separately from the Schedule B
# bound into the professional service contract: they are issued as different documents and each
# was supplied as final, so an amendment to one must never silently rewrite the other.
_PS_NDA_CLAUSES = [
    "Professional service contract with EZ as service professional or engagement with EZ as an "
    "independent contractor, as the case may be (the “**Engagement**”), will give the Participant "
    "access to proprietary and confidential information belonging to EZ, its clients, its suppliers "
    "and others (the proprietary and confidential information is collectively referred to in this "
    "Agreement as “**Confidential Information**”). Confidential Information includes but is not limited "
    "to client lists, marketing plans, proposals, contracts, technical and/or financial information, "
    "databases, software, and know-how. All Confidential Information remains confidential and "
    "proprietary information of EZ.",

    "By accepting this Offer of professional service contract, you agree and accept that you shall "
    "not, either during your professional service contract (other than in the course of fulfilling "
    "your obligations as service professional) or at any time afterwards, use to the detriment or "
    "prejudice of the company or communicate or divulge to any person, any information that may be "
    "confidential or proprietary information of the company which comes to your knowledge during "
    "your professional service contract including, without limitation, all data, client list "
    "including their details and related information, technical information, commercial and research "
    "strategies, trade secrets and know-how and any other information related to the business and "
    "operations of the company.",

    "You shall not be directly or indirectly engaged or interested in any trade, business or "
    "occupation other than the business of EZ which may prevent you from carrying out your duties "
    "effectively or which may be detrimental to EZ’s interests, during the course of your "
    "professional service contract.",

    "You specifically agree that for a period of two (2) years after you are no longer engaged by "
    "EZ, you shall not engage, directly or indirectly, either as proprietor, stockholder, partner, "
    "officer, employee or otherwise, in the same or similar activities as were performed for EZ in "
    "any business which distributes or sells products or provides services similar to those "
    "distributed, sold, or provided by EZ at any time during your term of professional service "
    "contract.",

    "You specifically agree that for a period of two (2) years after you are no longer engaged by "
    "EZ, you shall not, directly or indirectly, either as proprietor, stockholder, partner, officer, "
    "employee or otherwise, distribute, sell, offer to sell, or solicit any orders for the purchase "
    "or distribution of any products or services which are similar to those distributed, sold or "
    "provided by EZ during your term of professional service contract.",

    "You specifically agrees that for two (2) years after you are no longer engaged by EZ, you shall "
    "not directly or indirectly solicit, agree to perform or perform services of any type that EZ "
    "can render (the \"**Services**\") for any person or entity who paid or engaged EZ for the Services, "
    "or who received the benefit of EZ's Services, or with whom you had any substantial dealing "
    "while engaged by EZ.",

    "The contents of this Offer, and of all related agreements or arrangements, shall be held in "
    "confidence by you and shall not be disclosed to any third party without the prior approval of "
    "the company.",

    "Any breach of confidentiality obligations by you may result in disciplinary measures by the "
    "company, including your dismissal without notice.",

    "You are required to share data and files related to closed assignments completed in a specific "
    "month by the end of the first week of the following month. This sharing must be conducted "
    "through organization-approved and secure channels to ensure data security and confidentiality. "
    "Subsequently, it is your responsibility to promptly delete any project-related data from your "
    "personal electronic devices, including personally owned cellphones, smartphones, tablets, "
    "laptops, or computers, to prevent unauthorized access. Furthermore, you are permitted to use "
    "your personal electronic devices for work purposes, subject to compatibility with "
    "organizational technology standards. However, this usage comes with the explicit expectation "
    "that you will adhere to all security protocols and guidelines provided by the organization. "
    "Exercise caution when sharing access to project files and data, limiting it to only those "
    "individuals who have a legitimate need to know. Any breach, suspicious activities, or concerns "
    "regarding data security should be reported promptly to the designated authority within the "
    "organization.",

    "As referred to herein, the “**Business of EZ**” shall relate to the business of EZ as the same is "
    "determined by the Proprietor of EZ from time to time.",

    "The Participant may in the course of the Engagement conceive, develop or contribute to material "
    "or information related to the Business of EZ, including, without limitation, software, "
    "technical documentation, ideas, inventions (whether or not patentable), hardware, know-how, "
    "marketing plans, designs, techniques, documentation and records, regardless of the form or "
    "media, if any, on which such is stored (referred to in this Agreement as “**Proprietary "
    "Property**”). EZ shall exclusively own all Proprietary Property which the Participant conceives, "
    "develops or contributes to in the course of the Engagement and all intellectual and industrial "
    "property and other rights of any kind in or relating to the Proprietary Property, including but "
    "not limited to all copyright, patent, trade secret and trade-mark rights in or relating to the "
    "Proprietary Property. For greater certainty, the Participant hereby assigns to EZ any and all "
    "rights that the Participant may have or obtain in or to the Proprietary Property. Material or "
    "information conceived, developed or contributed to by the Participant outside work hours on "
    "EZ’s premises or through the use of EZ’s property and/or assets shall also be Proprietary "
    "Property and be governed by this Agreement if such material or information relates to the "
    "Business of EZ. The Participant shall keep full and accurate records accessible at all times to "
    "EZ relating to all Proprietary Property and shall promptly disclose and deliver to EZ all "
    "Proprietary Property.",

    None,  # clause 12 carries the (i)-(iii) sub-limbs; inserted separately

    "The Participant shall return or destroy, as directed by EZ, Confidential Information and "
    "Proprietary Property to EZ upon request by EZ at any time. The Participant shall certify, by "
    "way of affidavit or statutory declaration, that all such Confidential Information and "
    "Proprietary Property has been returned or destroyed, as applicable.",

    "The Participant covenants and agrees not to make any unauthorized use whatsoever of or to bring "
    "onto EZ’s premises for the purpose of making any unauthorized use whatsoever of any trade "
    "secrets, confidential information or proprietary property of any third party, including without "
    "limitation any trademarks or copyrighted materials, during the course of the Engagement. The "
    "Participant agrees and represents that the Engagement and the execution of this Agreement do "
    "not and will not breach any agreement to which the Participant is currently a party, or which "
    "currently applies to the Participant.",

    "At the reasonable request and at the sole expense of EZ, the Participant shall do all "
    "reasonable acts necessary and sign all reasonable documentation necessary in order to ensure "
    "EZ’s ownership of the Proprietary Property and all intellectual and industrial property rights "
    "and other rights in the same, including but not limited to providing to EZ written assignments "
    "of all rights to EZ and any other documents required to enable EZ to document rights to and/or "
    "register patents, copyrights, trade-marks, industrial designs and such other protections as EZ "
    "considers advisable anywhere in the world.",

    "The Participant hereby irrevocably and unconditionally waives all moral rights the Participant "
    "may now or in the future have in any Proprietary Property.",

    "The Participant agrees that the Participant will, if requested from time to time by EZ, execute "
    "such further reasonable agreements as to confidentiality and proprietary rights as EZ’s clients "
    "or suppliers reasonably required to protect Confidential Information or Proprietary Property.",

    "Regardless of any changes in position, payment terms or otherwise, including, without "
    "limitation, termination of the Engagement, unless otherwise stipulated pursuant to the terms "
    "hereof, the Participant will continue to be subject to each of the terms and conditions of this "
    "Agreement and any other(s) executed pursuant to the preceding paragraph.",

    "The Participant agrees that the Participant’s sole and exclusive remedy for any breach of this "
    "Agreement or any other agreement by EZ will be limited to monetary damages and that the "
    "Participant will not make any claim in respect of any rights to or interest in any Confidential "
    "Information or Proprietary Property.",

    "The Participant agrees that, during the term of this Agreement and for one (1) year after "
    "termination for any reason, he or she will not hire or solicit nor attempt to hire or solicit "
    "EZ’s employees (or any person who was employed by EZ within the past one year) without the "
    "prior written consent of EZ.",

    "The Participant acknowledges that, during the term of this Agreement, he or she may become "
    "familiar with Confidential Information concerning such Related Companies, and with investment "
    "opportunities relating to their respective businesses and therefore agree that, during the term "
    "of this Agreement and for a period of two years thereafter (the “**Noncompete Period**”), he or she "
    "will not directly or indirectly own, manage, control, participate in, consult with, render "
    "services for, or in any other manner engage in any business, or invest in or lend money to any "
    "business which constitutes or is competitive with (including, without limitation, by competing "
    "for the same subscriber or client base) any business conducted by any System owned or managed "
    "by any Related Company (as and where such Systems are operated or managed or are proposed to be "
    "operated or managed by EZ during the term of this Agreement, or as of the end of the Noncompete "
    "Period.",

    "Your professional service contract may only be terminated by either Party giving written notice "
    "to the other. Subject to clause 22, the minimum period of notice will be two (2) weeks during "
    "your probation period, if terminated by the company and one (1) month if terminated by you. The "
    "minimum period of notice will be one (1) month after the completion of probation.",

    "The company may terminate this Offer and your professional service contract immediately without "
    "notice for any of the reasons stated in Articles 88 or 120 of the UAE Labour Law being Federal "
    "Law No. 8 of 1980 (as amended) (the “**Labour Law**”).",

    "If you are absent from work without prior approval or any valid reason, the company may "
    "terminate the professional service contract immediately, without notice or payment in lieu of "
    "notice.",

    "If your professional service contract is terminated (i) by you; or (ii) by the company due to "
    "any reasons stated in Articles 88 and 120 of the Labour Law, during the first year of your "
    "professional service contract, you shall be liable to reimburse the company the entire costs "
    "incurred by the company for your relocation to UAE at the commencement of your professional "
    "service contract, if applicable.",

    "Upon the termination of your professional service contract (except of termination for reasons "
    "stated in Articles 88 and 120 of the Labour Law), you will be eligible to receive an end of "
    "service gratuity in the form a payment in proportion to the base amount component of your pay "
    "package based on the number of years of your service, in accordance with the provisions of the "
    "Labour Law.",

    "The Participant acknowledges that the services provided by the Participant to EZ are unique. "
    "The Participant further agrees that irreparable harm will be suffered by EZ in the event of the "
    "Participant’s breach or threatened breach of any of his or her obligations under this "
    "Agreement, and that EZ will be entitled to seek, in addition to any other rights and remedies "
    "that it may have at law or equity, a temporary or permanent injunction restraining the "
    "Participant from engaging in or continuing any such breach hereof. Any claims asserted by the "
    "Participant against EZ shall not constitute a defence in any injunction action, application or "
    "motion brought against the Participant by EZ.",

    "This Agreement is governed by the laws of the UAE and the Participant agrees to the "
    "non-exclusive jurisdiction of the courts of Sharjah in relation to this Agreement.",

    "If any provision of this Agreement is held by a court of competent jurisdiction to be invalid or "
    "unenforceable, that provision shall be deleted, and the other provisions shall remain in effect.",
]


def _ps_nda_blocks() -> list[dict]:
    """The 29 covenants, numbered explicitly so clause 12 keeps its (i)-(iii) sub-limbs."""
    out: list[dict] = []
    for i, text in enumerate(_PS_NDA_CLAUSES, 1):
        if text is None:
            out.append(b.p(
                "12. The Participant shall, both during and after the Engagement, keep all "
                "Confidential Information and Proprietary Property confidential and shall not use "
                "any of it except for the purpose of carrying out authorized activities on behalf of "
                "EZ. The Participant may, however, use or disclose Confidential Information which:"
            ))
            out.append(b.ul([
                "(i) is or becomes public other than through a breach of this Agreement.",
                "(ii) is known to the Participant prior to the date of this Agreement and with "
                "respect to which the Participant does not have any obligation of confidentiality; or",
                "(iii) is required to be disclosed by law, whether under an order of a court or "
                "government tribunal or other legal process, provided that Participant informs EZ of "
                "such requirement in sufficient time to allow EZ to avoid such disclosure by the "
                "Participant.",
            ]))
            continue
        out.append(b.p(f"{i}. {text}"))
    return out


def professional_service_nda(ctx: dict) -> dict:
    """Professional Service NDA (AEZ, individual, professional_services, nda).

    Faithful to 'Date_Professional Service NDA_ArabEasy_Full Name.docx.pdf': the standalone
    Schedule B Covenants / Confidentiality, Non-Solicitation, Non-Competition and Proprietary
    Information Agreement, 29 clauses, executed as of the start date and witnessed.
    """
    who = ctx["name"]
    witness = ctx["signatory_name"]

    return {
        "title": f"Professional Service NDA - {who}",
        "doc_type": "nda",
        "blocks": [
            b.p(f"Ref # {ctx['reference']}", align="right"),
            b.p(f"Date: {ctx['letter_date']}", align="right"),
            b.h(1, "Schedule B", underline=True),
            b.h(3, "Covenants"),
            b.h(3, "Confidentiality, Non-Solicitation, Non- Competition and Proprietary Information Agreement", underline=True),
            b.p(
                "In consideration of professional service contract as a service professional or "
                "expert with ArabEasy LLC, the undersigned (the “**Participant**”) agrees, and covenants "
                "as follows:"
            ),
            *_ps_nda_blocks(),
            b.p(
                f"**IN WITNESS WHEREOF** EZ has caused this Agreement to be executed as of the "
                f"**{ctx['start_date']}**."
            ),
            b.signature(
                ("PARTICIPANT - NAME", "" if who.startswith("[") else who.upper()),
                ("WITNESS to PARTICIPANT - NAME", witness.upper(), witness),
                heading="Signed in the presence of:",
                heading_align="right",
            ),
        ],
    }


register(
    "aez_professional_service_nda",
    professional_service_nda,
    label="Professional Service NDA",
    description=(
        "Standalone Covenants / Confidentiality, Non-Solicitation, Non-Competition and Proprietary "
        "Information Agreement signed by an ArabEasy professional service expert. 29 clauses."
    ),
    entity="AEZ",
    doc_type="nda",
    party_type="individual",
    contract_type="professional_services",
)
