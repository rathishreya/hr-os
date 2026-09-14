"""EZ (EZ Lab / ArabEasy) document templates — offer letters, contracts, NDAs and agreements.

Each builder takes the resolved context (see render._resolve_context for every placeholder and
its default) and returns {"title", "doc_type", "blocks"}, composed from blocks.py. Register each
one at the bottom of the file against the four taxonomy axes in registry.py.
"""
from __future__ import annotations

from . import blocks as b
from . import comp
from .registry import register


def _bullets_or_placeholder(values, placeholder: list[str]) -> list[str]:
    """A supplied list wins; otherwise the source template's own blank markers, so an unfilled
    contract prints visible gaps rather than silently omitting a clause."""
    items = [str(v).strip() for v in (values or []) if str(v).strip()]
    return items or placeholder


def agency_contract(ctx: dict) -> dict:
    """Agency Contract (EZ, agency, agency, contract).

    Faithful to 'Date_Agency Contract_EZ Lab_.pdf': cover letter, Schedule A (14 clauses of terms
    and conditions), Schedule B (Confidentiality and Proprietary Information Agreement, 11
    clauses) and Annexure A (bank details form).

    Note the source document is on EZ Lab Private Limited letterhead but names ARABEASY LLC as
    the contracting party throughout, governed by UAE law. Both are driven by context keys
    (contracting_entity / contracting_office / governing_law / jurisdiction) so whichever way
    that is resolved, it changes in one place.
    """
    agency = ctx["agency_name"]
    signatory = ctx["agency_signatory_name"]
    contracting = ctx["contracting_entity"]
    office = ctx["contracting_office"]
    ez_name = ctx["contract_signatory_name"]
    ez_title = ctx["contract_signatory_title"]

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
                f"We are pleased to confirm our verbal discussion to bring you on as a Service Provider "
                f"for {b.dots(ctx['service_type'])} (type of Services) at {contracting} (hereinafter referred to as \"**EZ**\"), effective "
                f"{b.dots(ctx['commencement_date'])} (Start Date). You are to keep all our client and EZ's information "
                f"confidential. Additional details regarding the work process and a non-disclosure "
                f"agreement is attached for your review and confirmation."
            ),
            b.p("Additional details of our offer, including the terms and conditions, are attached as Schedule \"A\"."),
            b.p(
                f"Please take the time to carefully review our offer. This letter, along with the enclosed "
                f"schedules, outlines the obligations of both EZ and {b.dots(agency)} (Name of the Agency), represented for the purpose "
                f"of this Agreement through its authorized signatory, {b.dots(signatory)} (Name of the authorized signatory)."
            ),
            b.p(
                "Accepting the offer will be conditional upon agreeing to and signing the attached copy of "
                "this offer letter, and the attached schedule(s), initialling each page in the right-hand "
                "corner, and returning it to me upon your earliest convenience, but prior to the first day "
                "of our business cooperation."
            ),
            b.p(f"{b.dots(signatory)} (Name of the authorized signatory), we look forward to welcoming you to the EZ team and wish you all the success."),
            b.p("Sincerely,"),
            b.space(44),   # room to sign, measured off the source letter
            b.p(f"**{ez_name}**"),
            b.p(ez_title),
            b.divider(),

            # ── Schedule A ────────────────────────────────────────────────────────────────
            b.h(1, "Schedule A"),
            b.h(3, f"Terms and Conditions of Contract between {agency} and EZ"),
            b.p("The following outlines the terms and conditions of a contract by and between:"),
            b.p(
                f"{agency}, represented for the purpose of this Agreement by {signatory}, having its "
                f"registered office at {ctx['agency_address']} (the \"**Service Provider**\")."
            ),
            b.p("And"),
            b.p(f"**EZ**, represented by {ez_name}, having its registered office at {office} (\"**Disclosing Party**\")"),
            b.p("(Collectively hereinafter referred to as the \"**Parties**\" and individually as a \"**Party**\")"),
            b.p(f"**WHEREAS**: Service Provider has a reputable {ctx['service_type']};"),
            b.p(
                f"**WHEREAS**: EZ desires to engage the Service Provider to provide {ctx['service_name']} "
                f"(the \"**Services**\")"
            ),
            b.p("**Now, Therefore**, Parties mutually agreed as follows:"),

            b.h(2, "1. Description of services.", underline=True),
            b.p("Service Provider shall provide the following service(s):"),
            b.ul(
                _bullets_or_placeholder(ctx.get("services"), ["[Service 1]", "[Service 2]", "[Service 3]"])
                + [
                    "The Service Provider shall, at all times during the term of this Agreement, fully "
                    "co-operate with the EZ and maintain high professional standard.",
                    "The Service Provider shall at all times be in a position to meet the EZ's requests in "
                    "accordance with the terms of this Agreement.",
                ]
            ),

            b.h(2, "2. Work process:", underline=True),
            b.p(
                "EZ provides Services to its client's round the clock, every day of the year. Client requests "
                "shall be sent to the Service Provider as and when received by EZ. The Service Provider may "
                "express interest and the Delivery team at EZ shall assign the assignment to the Service "
                "Provider based on its response, turnaround time, expertise on topic, prior performance, and "
                "other such factors."
            ),

            b.h(2, "3. Fees for service.", underline=True),
            b.p("EZ agrees to pay the below charges - as Service Provider fee for the above services."),
            b.ul(
                _bullets_or_placeholder(ctx.get("fees"), ["[Cost]"])
                + [
                    "The Service Provider shall be responsible for paying all taxes, levies, duties, fees and "
                    "social and medical insurance charges required to be paid by the Service Provider or its "
                    "employees, subcontractors, representatives or agents under this Agreement or otherwise "
                    "payable in respect to the performance of the obligations under the Agreement as per the "
                    "prevalent laws of the respective laws of the land.",
                    "EZ shall not be obligated to reimburse the Service Provider for any travel or other "
                    "out-of-pocket expenses incurred in the performance of obligations pursuant to this "
                    "Agreement unless expressly agreed by EZ in advance.",
                ]
            ),

            b.h(2, "4. Method & Format of delivery:", underline=True),
            b.p(
                "Both Parties agree that the Services shall be delivered to the EZ by email or on EZ Workspace "
                "and in the format as instructed by the EZ."
            ),

            b.h(2, "5. Payment schedule:", underline=True),
            b.p(
                "5.1 Service Provider shall send a detailed invoice with all the assignments completed and "
                "delivered EZ for a month by the 15th of the following month. All items of this invoice will "
                "be eligible for payment in that month's cycle."
            ),
            b.p(
                "5.2 All payments will be processed by EZ within 30 days from the date of raising the invoice. "
                "Any additional charges levied by Service Provider's bank on inbound foreign remittance will "
                "be its responsibility."
            ),
            b.p(
                "5.3 Please note that EZ bank will process remittances within 30 days from the date of raising "
                "the invoice. Any delays due to Service Provider's bank or an intermediary bank beyond EZ's "
                "control shall not incur any liability."
            ),

            b.h(2, "6. Method of Payment:", underline=True),
            b.p(
                f"Payment shall be made via bank transfer to the representative of Service Provider's bank "
                f"account: {ctx['bank_name']}. The details of which are to be communicated by Service Provider "
                f"to EZ by filling the form in the Annexure A as well as at the time that the invoices referred "
                f"to above are sent to EZ."
            ),

            b.h(2, "7. Cancellation or withdrawal by EZ.", underline=True),
            b.p(
                "In case EZ cancels or withdraws any portion of the item(s) described in clause No. 1 above "
                "prior to Service Provider completion of the Service(s), then, in consideration of Service "
                "Provider scheduling and/or performing said Service(s), EZ shall pay Service Provider the "
                "portion of the above fee represented by the percentage of total Service(s) performed."
            ),

            b.h(2, "8. Changes by others.", underline=True),
            b.p(
                "Service Provider shall have no responsibility whatever as to any changes in the delivered "
                "output made by persons other than Service Provider."
            ),

            b.h(2, "9. Additional fees", underline=True),
            b.p(
                "9.1 Additional fees will be payable, to be calculated as provided below, in the event the "
                "following additional Services are required: (a) investigation, inquiry, or research beyond "
                "that normal to a routine service is required because of ambiguities in the delivered item(s); "
                "(b) additional Services are required because changes are made in the item(s) after the signing "
                "of this Agreement; and (c) **Service Provider** is requested to make changes in the document "
                "after delivery of the document, as per preferences, and such changes are not required for "
                "accuracy. Such additional fees will be calculated according to the pre-defined fees of various "
                "services."
            ),
            b.p(
                "9.2 The additional fees will not be payable by EZ, if the EZ's QA team or its client has noted "
                "numerous errors or serious quality issues, and EZ can request **Service Provider** for changes "
                "in the document in order to correct such errors or inaccuracies."
            ),

            b.h(2, "10. Confidentiality and intellectual property", underline=True),
            b.p(
                "10.1 This contract is conditional upon the **Service Provider** agreeing to and abiding by the "
                "\"Confidentiality and Proprietary Information Agreement.\" Attached Schedule \"B.\""
            ),

            b.h(2, "11. Non-Solicitation and Non-Competition", underline=True),
            b.p(
                "11.1 The Service Provider (or its Affiliate) shall not be directly or indirectly engaged or "
                "interested in any trade, business or occupation other than the business of EZ which may prevent "
                "it from carrying out its duties effectively or which may be detrimental to the EZ's interests, "
                "during the course of the Agreement."
            ),
            b.p(
                "11.2 Both parties specifically agree that for a period of two (2) years after the expiry or "
                "termination of the Agreement, the parties (or their Affiliate/s) shall not, directly or "
                "indirectly, either as proprietor, stockholder, partner, officer, employee, consultant or "
                "otherwise:"
            ),
            b.ul([
                "a) Solicit, induce, or attempt to solicit or induce any employee, contractor, or consultant of "
                "the other party (or any person who was employed by the other party within the past one year) "
                "to terminate their relationship with the other party or to accept employment or engagement "
                "with the other party or any third party associated with the Service Provider/EZ, without the "
                "prior written consent of affected party;",
                "b) Solicit, interfere with, or endeavour to entice away from each other, any client, customer, "
                "or prospective client or customer with whom the Service Provider/EZ had direct dealings or "
                "material contact during the term of the Agreement, for the purpose of offering or providing "
                "services or products that are similar to those offered by EZ/Service Provider.",
            ]),
            b.p(
                "For the purposes of this clause, \"**Affiliate**\" shall mean an entity that controls, or is "
                "controlled by, or is under common control of the Service Provider or any entity that controls "
                "the Service Provider."
            ),

            b.h(2, "12. Termination", underline=True),
            b.p(
                f"12.1 This Agreement shall commence on {ctx['commencement_date']} and remain in effect for a "
                f"term of one (1) year. This Agreement shall be automatically renewed for another one-year "
                f"period by mutual agreement of the Parties to this Agreement."
            ),
            b.p("Any party may terminate this Agreement:"),
            b.ul([
                "a) Without reason or cause, upon 15 (Fifteen) days' notice to the other Party; or",
                "b) Immediately upon notice, in the event of a breach by the other Party of the provisions of "
                "this Agreement.",
            ]),
            b.p(
                "12.2 Notwithstanding anything contained herein, if either Party commits any breach of the terms "
                "and conditions contained herein, the other Party shall give 7 (seven) days' notice to remedy "
                "the breach and on the failure of the Party who has committed the breach to do so, the other "
                "Party to this Agreement shall be entitled to cancel/terminate this Agreement by giving a 7 "
                "(seven) days' written notice."
            ),

            b.h(2, "13. Complete agreement", underline=True),
            b.p(
                "This is the complete agreement of the parties as to the subject matter hereof. Any changes in "
                "this Agreement must be in writing signed by both parties. This Agreement becomes a binding "
                "contract only upon signature by both parties and the delivery of fully signed copies to each "
                "party."
            ),

            b.h(2, "14. Applicable Law and Jurisdiction", underline=True),
            b.ul([
                f"1. This Agreement is governed by the laws of {ctx['governing_law']} and the Receiving Party "
                f"agrees to the non-exclusive jurisdiction of the courts of {ctx['jurisdiction']} in relation to "
                f"this Agreement.",
                "2. If any provision of this Agreement is held by a court of competent jurisdiction to be invalid "
                "or unenforceable, that provision shall be deleted and the other provisions shall remain in "
                "effect.",
            ]),
            b.signature(
                ("For Service Provider", ""),
                ("For EZ Services", ez_name.upper(), None, ez_title),
                heading="Signed in the presence of:",
                heading_align="right",
            ),
            b.divider(),

            # ── Schedule B ────────────────────────────────────────────────────────────────
            b.h(1, "Schedule B"),
            b.h(3, "Confidentiality and Proprietary Information Agreement"),
            b.p(f"This Agreement is made on this **{b.dots(ctx['effective_date'])}** (Date) by and between:"),
            b.p(
                f"{contracting} (\"**EZ**\"), having its business address at {office}, hereinafter duly "
                f"represented by **{ez_name}** in his capacity as {ez_title} (hereinafter referred to as "
                f"\"**EZ**\" or \"**Disclosing Party**\")"
            ),
            b.p("And"),
            b.p(
                f"**{b.dots(agency)}** (Name of the Agency), a {b.dots(ctx['service_type'])} (type of service) with its principal office at {b.dots(ctx['agency_address'])}, "
                f"hereinafter duly represented by {b.dots(signatory)} (Name of the Authorized Signatory) in his capacity as "
                f"{b.dots(ctx['agency_signatory_title'])} (Position/Designation) (hereinafter referred to as \"**Service Provider**\" or "
                f"\"**Receiving Party**\");"
            ),
            b.p("(Collectively hereinafter referred to as Parties and individually as Party)"),
            b.p("**WHEREAS**:"),
            b.p(
                f"EZ (**Disclosing Party**) wishes to employ the services of Service Provider (**Receiving "
                f"Party**) to provide {b.dots(ctx['service_type'])} (type of Services)."
            ),
            b.p(
                "For the purpose of the provision of the translation services by the Receiving Party, EZ will "
                "disclose Confidential Information to the Receiving Party."
            ),
            b.p(
                "NOW, THEREFORE, in consideration of the promises herein contained and the disclosures by EZ to "
                "Receiving Party of the Confidential Information to which this Agreement refers, it is mutually "
                "agreed as follows:"
            ),
            b.ol([
                "Disclosing Party will give the Receiving Party access to proprietary and confidential "
                "information belonging to EZ, its clients, its suppliers and others (the proprietary and "
                "confidential information are collectively referred to in this Agreement as \"**Confidential "
                "Information**\"). Confidential Information includes but is not limited to client lists, marketing "
                "plans, proposals, contracts, technical and/or financial information, databases, software and "
                "know-how. All Confidential Information remains confidential and proprietary information of EZ.",

                "As referred to herein, the \"**Business of EZ**\" shall relate to the business of EZ as the same is "
                "determined by the Proprietor of EZ from time to time.",

                "The Receiving Party may in the course of the working process conceive, develop or contribute to "
                "material or information related to the Business of EZ, including, without limitation, software, "
                "technical documentation, ideas, inventions (whether or not patentable), hardware, know-how, "
                "marketing plans, designs, techniques, documentation, and records, regardless of the form or "
                "media, if any, on which such is stored (referred to in this Agreement as \"**Proprietary "
                "Property**\"). EZ shall exclusively own all Proprietary Property which the Participant conceives, "
                "develops or contributes to in the course of the working process and all intellectual and "
                "industrial property and other rights of any kind in or relating to the Proprietary Property, "
                "including but not limited to all copyright, patent, trade secret and trade-mark rights in or "
                "relating to the Proprietary Property. For greater certainty, the Receiving party hereby assigns "
                "to EZ any and all rights that the Participant may have or obtain in or to the Proprietary "
                "Property. Material or information conceived, developed or contributed to by the Receiving Party "
                "outside work hours on EZ's premises or through the use of EZ's property and/or assets shall "
                "also be Proprietary Property and be governed by this Agreement if such material or information "
                "relates to the Business of EZ. The Receiving Party shall keep full and accurate records "
                "accessible at all times to EZ relating to all Proprietary Property and shall promptly disclose "
                "and deliver to EZ all Proprietary Property.",

                "The Receiving Party shall, both during and after the working process, keep all Confidential "
                "Information and Proprietary Property confidential and shall not use any of it except for the "
                "purpose of carrying out authorized activities on behalf of EZ. The Receiving Party may, however, "
                "use or disclose Confidential Information which: (i) is or becomes public other than through a "
                "breach of this Agreement; (ii) is known to the Receiving Party prior to the date of this "
                "Agreement and with respect to which the Receiving Party does not have any obligation of "
                "confidentiality; or (iii) is required to be disclosed by law, whether under an order of a court "
                "or government tribunal or other legal processes, provided that Receiving Party informs EZ of "
                "such requirement in sufficient time to allow EZ to avoid such disclosure by the Receiving Party. "
                "The Receiving Party shall return or destroy, as directed by EZ, Confidential Information, and "
                "Proprietary Property to EZ upon request by EZ at any time. The Receiving Party shall certify, by "
                "way of affidavit or statutory declaration, that all such Confidential Information and "
                "Proprietary Property has been returned or destroyed, as applicable.",

                "The Receiving Party covenants and agrees not to make any unauthorized use whatsoever of or to "
                "bring onto EZ's premises for the purpose of making any unauthorized use whatsoever of any trade "
                "secrets, confidential information or proprietary property of any third party, including without "
                "limitation any trademarks or copyrighted materials, during the course of the working process. "
                "The Receiving Party agrees and represents that the working process and the execution of this "
                "Agreement do not and will not breach any agreement to which the Receiving Party is currently a "
                "Party or which currently applies to the Receiving Party.",

                "The Receiving Party hereby irrevocably and unconditionally waives all moral rights the Receiving "
                "Party may now or in the future have in any Proprietary Property.",

                "The Receiving Party agrees that the Receiving Party will if requested from time to time by EZ, "
                "execute such further reasonable agreements as to confidentiality and proprietary rights as EZ's "
                "clients or suppliers reasonably required to protect Confidential Information or Proprietary "
                "Property.",

                "The Receiving Party agrees that the Receiving Party's sole and exclusive remedy for any breach "
                "of this Agreement or any other agreement by EZ will be limited to monetary damages and that the "
                "Receiving Party will not make any claim in respect of any rights to or interest in any "
                "Confidential Information or Proprietary Property.",

                "The Receiving Party acknowledges that the Services provided by the Receiving Party to EZ are "
                "unique. The Receiving Party further agrees that irreparable harm will be suffered by EZ in the "
                "event of the Participant's breach or threatened breach of any of his or her obligations under "
                "this Agreement and that EZ will be entitled to seek, in addition to any other rights and "
                "remedies that it may have at law or equity, a temporary or permanent injunction restraining the "
                "Receiving Party from engaging in or continuing any such breach hereof. Any claims asserted by "
                "the Participant against EZ shall not constitute a defence in any injunction action, application, "
                "or motion brought against the Receiving Party by EZ.",

                f"This Agreement is governed by the laws of {ctx['governing_law']} and the Receiving Party agrees "
                f"to the non-exclusive jurisdiction of the courts of {ctx['jurisdiction']} in relation to this "
                f"Agreement.",

                "If any provision of this Agreement is held by a court of competent jurisdiction to be invalid or "
                "unenforceable, that provision shall be deleted and the other provisions shall remain in effect.",
            ]),
            b.p(
                f"**IN WITNESS WHEREOF** EZ has caused this Agreement to be executed as of the "
                f"{ctx['effective_date']}."
            ),
            b.signature(
                ("SIGNED for and on behalf of Service Provider", ""),
                ("SIGNED for and on behalf of EZ", ez_name.upper(), None, ez_title),
            ),
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
    "ez_agency_contract",
    agency_contract,
    label="Agency Contract",
    description=(
        "Service-provider contract with an agency: cover letter, Schedule A terms & conditions, "
        "Schedule B confidentiality agreement and the Annexure A bank details form."
    ),
    entity="EZ",
    party_type="agency",
    contract_type="agency",
    doc_type="contract",
)


def nda_tech(ctx: dict) -> dict:
    """NDA - Tech (EZ, individual, nda-tech).

    Faithful to 'Date_NDA_EZ Lab (Tech).docx.pdf': Employee Covenants / Confidentiality and
    Proprietary Information Agreement, 16 clauses, executed by the Participant and witnessed.

    Clauses are numbered explicitly rather than via an ordered list because clause 4 carries the
    (i)-(iii) sub-limbs, and a nested list would restart the outer numbering at 5.
    """
    who = ctx["name"]

    return {
        "title": f"NDA (Tech) - {who}",
        "doc_type": "nda-tech",
        "blocks": [
            b.p(f"Reference: {ctx['reference']}", align="right"),
            b.p(f"Date: {ctx['letter_date']}", align="right"),
            b.h(1, "Employee Covenants"),
            b.h(3, "Confidentiality and Proprietary Information Agreement"),
            b.p(
                'In consideration of employment as an employee or engagement as an independent '
                'contractor with EZ Lab Private Limited ("**EZ Lab**"), the undersigned (the '
                '"**Participant**") agrees and covenants as follows:'
            ),

            b.p(
                '1. Employment with EZ Lab as an employee or engagement with EZ Lab as an independent '
                'contractor, as the case may be (the "**Engagement**"), will give the Participant access to '
                'proprietary and confidential information belonging to EZ Lab, its customers, its '
                'suppliers and others (the proprietary and confidential information is collectively '
                'referred to in this Agreement as "**Confidential Information**"). Confidential Information '
                'includes but is not limited to customer lists, marketing plans, proposals, contracts, '
                'technical and/or financial information, databases, software, know-how (including, but '
                'not limited to, research, product plans or other information regarding EZ Lab’s '
                'products or services), business plans, Intellectual Property, trade secrets, '
                'copyrightable material, ideas (patentable or otherwise), inventions, processes, '
                'research & development, technical data, technology, designs, drawings, marketing, '
                'finances, employee data, or other business information of EZ Lab, whether conveyed in '
                'written, oral or in any other form. All Confidential Information remains the '
                'confidential and proprietary information of EZ Lab.'
            ),
            b.p(
                '2. As referred to herein, the "**Business of EZ Lab**" shall relate to the business of EZ '
                'Lab as the same is determined by the Proprietor of EZ Lab from time to time.'
            ),
            b.p(
                '3. The Participant may in the course of the Engagement conceive, develop or contribute '
                'to material or information related to the Business of EZ Lab, including, without '
                'limitation, any and all original works of authorship, data, improvements, discoveries, '
                'trademarks or trade secrets, software, technical documentation, ideas, inventions '
                '(whether or not patentable), hardware, know-how, marketing plans, designs, techniques, '
                'any other intellectual property (Intellectual Property), documentation and records, '
                'regardless of the form or media, if any, on which such is stored (referred to in this '
                'Agreement as "**Proprietary Property**"). EZ Lab shall exclusively own all rights, title '
                'and interest in and to the Proprietary Property which the Participant conceives, '
                'develops or contributes to in the course of the Employment or Engagement as the case '
                'may be and all Intellectual Property and industrial property and other rights of any '
                'kind in or relating to the Proprietary Property. For greater certainty, the Participant '
                'hereby assigns to EZ Lab any and all rights that the Participant may have or obtain in '
                'or to the Proprietary Property. Material or information conceived, developed or '
                'contributed to by the Participant outside work hours on EZ Lab’s premises or '
                'through the use of EZ Lab’s property and/or assets shall also be Proprietary '
                'Property and be governed by this Agreement if such material or information relates to '
                'the Business of EZ Lab. The Participant shall keep full and accurate records accessible '
                'at all times to the EZ Lab relating to all Proprietary Property and shall promptly '
                'disclose and deliver to the EZ Lab all Proprietary Property.'
            ),
            b.p(
                '4. The Participant shall, both during and after the Engagement, keep all Confidential '
                'Information and Proprietary Property confidential and shall not use any of it except '
                'for the purpose of carrying out authorized activities on behalf of EZ Lab. The '
                'Participant may, however, use or disclose Confidential Information which:'
            ),
            b.ul([
                '(i) is or becomes public other than through a breach of this Agreement;',
                '(ii) is known to the Participant prior to the date of this Agreement and with respect '
                'to which the Participant does not have any obligation of confidentiality; or',
                '(iii) is required to be disclosed by law, whether under an order of a court or '
                'government tribunal or other legal process, provided that Participant informs EZ Lab '
                'of such requirement in sufficient time to allow EZ Lab to avoid such disclosure by the '
                'Participant.',
            ]),
            b.p(
                '5. The Participant shall return or destroy, as directed by EZ Lab, Confidential '
                'Information and Proprietary Property to EZ Lab upon request by EZ Lab at any time. The '
                'Participant shall certify, by way of affidavit or statutory declaration, that all such '
                'Confidential Information and Proprietary Property has been returned or destroyed, as '
                'applicable.'
            ),
            b.p(
                '6. The Participant covenants and agrees not to make any unauthorized use whatsoever of '
                'or to bring onto EZ Lab’s premises for the purpose of making any unauthorized use '
                'whatsoever of any trade secrets, Confidential Information or Proprietary Property of '
                'any third party, including without limitation any trade-marks or copyrighted materials, '
                'during the course of the Engagement. The Participant agrees and represents that the '
                'Engagement and the execution of this Agreement do not and will not breach any agreement '
                'to which the Participant is currently a party, or which currently applies to the '
                'Participant.'
            ),
            b.p(
                '7. At the reasonable request and at the sole expense of EZ Lab, the Participant shall '
                'do all reasonable acts necessary and sign all reasonable documentation necessary in '
                'order to ensure EZ Lab’s ownership of the Proprietary Property and all Intellectual '
                'Property and industrial property rights and other rights in the same, including but not '
                'limited to providing to the EZ Lab written assignments of all rights to EZ Lab and any '
                'other documents required to enable EZ Lab to document rights to and/or register '
                'patents, copyrights, trade-marks, industrial designs and such other protections as EZ '
                'Lab considers advisable anywhere in the world.'
            ),
            b.p(
                '8. The Participant agrees and confirms that if in any country the above assignment of '
                'rights is not recognized as per applicable laws then the Participant hereby irrevocably '
                'and unconditionally assigns to EZ Lab, without further compensation, all of its right, '
                'title and interest in and to the Proprietary Property including Intellectual Property. '
                'Upon request, the Participant further undertakes to sign all applications, assignments, '
                'instruments and papers and perform all acts necessary or desired by EZ Lab to assign '
                'the Proprietary Property fully and completely to EZ Lab and to enable EZ Lab, its '
                'successors, assigns and nominees, to secure and enjoy the full and exclusive benefits '
                'and advantages thereof at no charge to EZ Lab.'
            ),
            b.p(
                '9. The Participant agrees that the Participant will, if requested from time to time by '
                'EZ Lab, execute such further reasonable agreements as to confidentiality and '
                'proprietary rights as EZ Lab’s customers or suppliers reasonably require to '
                'protect Confidential Information or Proprietary Property.'
            ),
            b.p(
                '10. Regardless of any changes in position, salary or otherwise, including, without '
                'limitation, termination of the Engagement, unless otherwise stipulated pursuant to the '
                'terms hereof, the Participant will continue to be subject to each of the terms and '
                'conditions of this Agreement and any other(s) executed pursuant to the preceding '
                'paragraph.'
            ),
            b.p(
                '11. The Participant hereby acknowledges that using, disclosing, or publishing any '
                'Confidential Information in any unauthorized or improper manner could cause EZ Lab to '
                'incur substantial loss and damages and irreparable harm that cannot be readily '
                'calculated and for which damages would not be an adequate remedy. Accordingly, the '
                'Participant agrees that they will not at any time, except in performing their '
                'employment duties or during the course of their engagement and obligations to EZ Lab '
                'under this Agreement (or with their Supervisor’s prior written consent), directly '
                'or indirectly, use, disclose, or publish any Confidential Information that they may '
                'learn or become aware of due to their prior or continuing employment or engagement with '
                'EZ Lab. The Participant confirms that all Confidential Information is and must remain '
                'the exclusive property of EZ Lab at all points in time and shall solely and absolutely '
                'vest in EZ Lab, and that the Participant shall not have or claim any right, title or '
                'interest therein.'
            ),
            b.p(
                '12. The Participant acknowledges that the services provided by the Participant to EZ '
                'Lab are unique. The Participant further agrees that irreparable harm will be suffered '
                'by EZ Lab in the event of the Participant’s breach or threatened breach of any of '
                'his or her obligations under this Agreement, and that EZ Lab will be entitled to seek, '
                'in addition to any other rights and remedies that it may have at law or equity, a '
                'temporary or permanent injunction restraining the Participant from engaging in or '
                'continuing any such breach hereof. Any claims asserted by the Participant against EZ '
                'Lab shall not constitute a defense in any injunction action, application or motion '
                'brought against the Participant by EZ Lab.'
            ),
            b.p(
                '13. The Participant agrees that, during the term of this Agreement and for one (1) year '
                'after termination for any reason, he or she will not hire or solicit nor attempt to '
                'hire or solicit EZ Lab’s employees (or any person who was employed by EZ Lab '
                'within the past one year) without the prior written consent of EZ Lab.'
            ),
            b.p(
                '14. The Participant acknowledges that, during the term of this Agreement, he or she may '
                'become familiar with Confidential Information concerning such Related Companies, and '
                'with investment opportunities relating to their respective businesses and therefore '
                'agree that, during the term of this Agreement and for a period of two years thereafter '
                '(the "**Noncompete Period**"), he or she will not directly or indirectly own, manage, '
                'control, participate in, consult with, render services for, or in any other manner '
                'engage in any business, or invest in or lend money to any business which constitutes or '
                'is competitive with (including, without limitation, by competing for the same '
                'subscriber or customer base) any business conducted by any System owned or managed by '
                'any Related Company (as and where such Systems are operated or managed or are proposed '
                'to be operated or managed by EZ Lab during the term of this Agreement, or as of the end '
                'of the Noncompete Period.'
            ),
            b.p(
                '15. This Agreement is governed by the laws of the India and the Participant agrees to '
                'the non- exclusive jurisdiction of the courts of New Delhi in relation to this '
                'Agreement.'
            ),
            b.p(
                '16. If any provision of this Agreement is held by a court of competent jurisdiction to '
                'be invalid or unenforceable, that provision shall be deleted, and the other provisions '
                'shall remain in effect.'
            ),

            b.p(
                f"**IN WITNESS WHEREOF** EZ Lab has caused this Agreement to be executed as of the "
                f"{ctx['execution_date']}."
            ),
            b.signature(
                ("PARTICIPANT - NAME", "" if who.startswith("[") else who),
                (
                    "WITNESS to PARTICIPANT - NAME",
                    ctx["signatory_name"].upper(),
                    ctx["signatory_name"],
                    ctx["signatory_title"],
                ),
                heading="Signed in the presence of:",
            ),
        ],
    }


register(
    "ez_nda_tech",
    nda_tech,
    label="NDA - Tech",
    description=(
        "Employee Covenants: Confidentiality and Proprietary Information Agreement signed by an "
        "employee or independent contractor of EZ Lab. 16 clauses, witnessed."
    ),
    entity="EZ",
    doc_type="nda-tech",
    party_type="individual",
    contract_type=None,  # binds an employee OR an independent contractor
)


# Annexure-1: the high-level job description, transcribed verbatim from the source letter.
# Section title -> bullets; a bullet may carry its own sub-bullets as a nested tuple.
_JD_SECTIONS = [
    ("1. Brand & Growth Strategy", [
        ("Lead and execute the digital marketing and growth strategy for the following brands:",
         ["EZ", "Varnan Films", "Ghost Research", "Caspr"]),
        "Drive brand positioning, visibility, and lead generation initiatives across all digital "
        "channels.",
        "Develop and implement growth plans for existing brands and any new brands launched in the "
        "future, including marketing support for client engagements.",
    ]),
    ("2. Digital Marketing Strategy & Execution", [
        "Plan and manage integrated digital marketing campaigns across SEO, social media, content, "
        "email marketing, and paid marketing channels.",
        "Identify growth opportunities through data-driven marketing strategies.",
        "Monitor campaign performance and continuously optimize for traffic, conversions, and ROI.",
        "Develop and execute performance marketing strategies to support business growth.",
    ]),
    ("3. Team Leadership & Management", [
        "Lead and manage the digital marketing team, including: SEO specialists, Social media "
        "associates/managers & Content writers.",
        "Assign tasks, set goals, review outputs, and ensure high-quality deliverables across all "
        "marketing activities.",
        "Build structured workflows and ensure timely execution of campaigns and marketing "
        "initiatives.",
    ]),
    ("4. Content & Brand Communication", [
        "Oversee the development of high-quality content strategies aligned with brand positioning.",
        "Ensure consistency in brand messaging, tone, and visual identity across all platforms.",
        "Guide the creation of website content, blogs, social media posts, newsletters, and "
        "marketing assets.",
    ]),
    ("5. Performance Monitoring & Reporting", [
        "Track and analyze key marketing metrics including traffic, engagement, lead generation, "
        "and conversions.",
        "Prepare regular performance reports and insights for leadership.",
        "Use analytics to refine marketing strategies and improve growth outcomes.",
    ]),
    ("6. Collaboration & Client Engagement", [
        "Work closely with internal teams (sales, product, and leadership) to align marketing "
        "initiatives with business objectives.",
        "Support client-facing marketing initiatives and engagements where required.",
        "Represent the digital marketing team in strategic discussions related to brand growth and "
        "market expansion.",
    ]),
    ("7. Innovation & Market Awareness", [
        "Stay updated with latest digital marketing trends, tools, and technologies.",
        "Identify new channels and innovative strategies to enhance brand visibility and accelerate "
        "growth.",
    ]),
]


def _jd_blocks(responsibilities: list[str] | None = None) -> list[dict]:
    """Annexure-1's job description.

    `responsibilities` is what the recruiter typed on the generate form. Left blank, the letter
    keeps the transcribed job description below — which is what the form always claimed it did
    while actually discarding whatever was entered.
    """
    if responsibilities:
        return [b.ul(list(responsibilities))]
    out: list[dict] = []
    for title, bullets in _JD_SECTIONS:
        out.append(b.p(f"**{title}**"))
        # A bullet's sub-bullets stay a level of their own, as the source sets them. Joining them
        # onto the parent with middots ("...for the following brands: EZ · Varnan Films · Ghost
        # Research · Caspr") read as one run-on sentence rather than a list of four brands.
        items: list = []
        for item in bullets:
            if isinstance(item, tuple):
                lead, subs = item
                items.append({"text": lead, "subs": list(subs)})
            else:
                items.append(item)
        out.append(b.ul(items))
    return out


def offer_letter(ctx: dict) -> dict:
    """Offer Letter (EZ, individual, full_time, offer).

    Faithful to 'Date_Offer Letter_Full Name.docx.pdf': the offer letter with its 11 terms,
    Annexure-1 (job description), Annexure-2 (compensation, computed from the CTC by
    comp.offer_annexure) and the Acceptance page.

    HR fills: full name, role, and the reporting manager with their position. Compensation flows
    from the role's CTC; joining and validity dates come from the standard term fields.
    """
    who = ctx["name"]
    role = ctx["designation"]
    annexure = comp.offer_annexure(ctx.get("annual_ctc"), ctx.get("comp_overrides"))

    return {
        "title": f"Offer Letter - {who}",
        "doc_type": "offer",
        "blocks": [
            b.p("To"),
            b.p(who),
            b.h(2, f"SUBJECT: OFFER FOR THE POSITION OF {role.upper()}", underline=True),
            b.p(f"Dear {who},"),
            b.p(
                f"In furtherance to your Application and subsequent discussions held between Us, we "
                f"are glad to Offer you the Position of **{role.upper()}** to be initially based at "
                f"Gurugram, Haryana, at the below stated Address;"
            ),
            b.p("EZ Lab Private Limited, Near HBR Chowk, Sector 62, Gurgaon, Haryana, 22413."),
            b.p("We would like to share with you the Terms & Conditions of this Offer;"),

            b.p(
                "This Offer would become Effective and Enforceable on its Acceptance by You in the "
                "manner prescribed hereinafter",
                strong_prefix="1. Effectiveness",
            ),
            b.p(
                f"You shall report to **{ctx['manager']}, {ctx['manager_role']}** and shall perform "
                f"the functions as detailed under Annexure-1 herein.",
                strong_prefix="2. Duties & Responsibilities",
            ),
            b.p(
                "Your future growth and Compensation in the Organisation shall entirely depend on "
                "your contribution to the business success and overall Organisation performance. We "
                "follow a Work Oriented Appraisal Policy, and the Compensation Revision may be "
                "subject to a Separate Agreement/Personal Bond.",
                strong_prefix="3. Performance Evaluation & Compensation Revision",
            ),
            b.p(
                "A 6-day working schedule with 4 days in the office and 2 days working from home "
                "each week is followed. You are expected to complete 9 working hours per day.",
                strong_prefix="4. Work Schedule",
            ),
            b.p(
                "You will be entitled for leaves with company policies and the holiday calendar. "
                "Leaves are to be taken at such time as is determined by or acceptable to EZ.",
                strong_prefix="5. Vacation",
            ),
            b.p(
                "You shall be covered under the provisions of Provident Fund Scheme, ESI Scheme and "
                "Professional Tax as applicable from time to time. All compensation, Incentives & "
                "Monetary Rewards shall be subject to Tax deduction.",
                strong_prefix="6. Statutory Coverage",
            ),
            b.p(
                "The Compensation will become Payable after completion of One Month of the Job. In "
                "Case you leave the Organisation within One Month from the Date of your Joining, you "
                "shall not be entitled to any Compensation/Remuneration for any Services whatsoever "
                "rendered to the Organisation. Your compensation details are attached in Annexure 2 "
                "herein.",
                strong_prefix="7. Compensation",
            ),
            b.p(
                "During first 3 months of your joining, your employment shall be subject to 15 days' "
                "notice or equivalent payment in lieu of notice from either side. After completion of "
                "3 months, either side can terminate the employment after giving a Notice for a "
                "Period of 2 months to the other, or by paying the Salary in lieu of the Notice "
                "Period.",
                strong_prefix="8. Termination",
            ),
            b.p(
                "This Offer, on its Acceptance, shall be enforceable by and before the Civil "
                "Courts/Authorities at Gurugram only.",
                strong_prefix="9. Enforceability",
            ),
            b.p(
                "Background verification is a part of onboarding and is still in process. It will "
                "take 1-2 weeks to get completed, we might reconsider the offer if the results don't "
                "turn out to be positive.",
                strong_prefix="10. Subject to Confirmation",
            ),
            b.p(
                f"This Offer shall be Valid till **{ctx['validity_date']}**. In case you do accept "
                f"our offer, please convey your Acceptance within Such Period; failing which the "
                f"offer shall be considered null & void. We shall receive the following documents "
                f"within this period to constitute this Offer into a Contract;",
                strong_prefix="11. Validity",
            ),
            b.ul([
                "A. Acceptance of the Offer, as Annexed with this Offer Letter",
                "B. Proof of Resignation (Submitted or Accepted) from Current Employer, if Applicable",
            ]),
            b.p(
                f"You are requested to join us on or before **{ctx['start_date']}**. Other "
                f"formalities shall be completed after your joining."
            ),
            b.p(
                "Congratulations! On this exciting advancement in your career that comes your way by "
                "means of this offer."
            ),
            b.p("We welcome you to EZ team."),
            b.p("Best Wishes!"),
            b.script(ctx['signatory_name']),
            b.p(f"**{ctx['signatory_name']}**"),
            b.p(ctx["signatory_title"]),
            b.p("EZ Lab Private Limited"),
            b.divider(),

            # ── Annexure-1 ────────────────────────────────────────────────────────────────
            b.h(1, "ANNEXURE - 1", underline=True),
            b.p("**THE HIGH-LEVEL JOB-DESCRIPTION IS AS BELOW:**"),
            *_jd_blocks(ctx["responsibilities"]),
            b.divider(),

            # ── Annexure-2 ────────────────────────────────────────────────────────────────
            b.h(1, "ANNEXURE - 2", underline=True),
            b.p("**COMPENSATION WOULD BE AS FOLLOWS:**"),
            b.comp_custom(annexure["rows"], annexure["notes"], known=annexure["known"]),
            b.p("**NOTES:**"),
            b.p("*EFFECTIVENESS: Payable only after completion of One Month of the Job."),
            b.divider(),

            # ── Acceptance ────────────────────────────────────────────────────────────────
            b.h(1, "ACCEPTANCE", underline=True),
            b.p(
                "I have read and understood the terms & conditions and also agree that the "
                "Remuneration and other details are Confidential between the Organization and me. I "
                "undertake that there would be no breach of this Confidentiality."
            ),
            b.p(
                "I undertake that in Case of my not Joining the Organisation after Acceptance of this "
                "Offer, I shall be liable to Pay the Organisation a Sum equal to One month Total "
                "Remuneration as offered to me in this Offer Letter, as a Reimbursement of the "
                "Expenses incurred by the Organisation for Conducting My Interview as well as for the "
                "Losses caused due to my Non-Joining after Confirmation, and I would return the "
                "Original of this Letter (along with all its Annexure) without use/making any copies "
                "of the same."
            ),
            b.p("I hereby accept the offer of employment on the said terms & conditions."),
            b.p("Date: ……………………………………"),
            b.p("Place: ………………………………….."),
            b.p("Mr./Ms. ……………………………….."),
            b.p("S/D/o ………………………………….."),
            b.p("R/o …………………………………….."),
            b.p("(Signature)"),
        ],
    }


register(
    "ez_offer_letter",
    offer_letter,
    label="Offer Letter",
    description=(
        "EZ Lab full-time offer letter: 11 terms & conditions, Annexure-1 job description, "
        "Annexure-2 compensation table computed from the CTC, and the Acceptance page."
    ),
    # The offer letter is the first document sent, so it is the picker's default; the fuller FTE
    # Contract is the second document, issued once the offer is accepted.
    preferred=True,
    entity="EZ",
    doc_type="offer",
    party_type="individual",
    contract_type="full_time",
)


_FC_RESPONSIBILITIES = [
    "Collaborate with a team of developers and data scientists to architect, build, maintain and "
    "design more functional, cohesive features to enhance our existing software solutions.",
    "Write efficient, high-quality performant code that follows best programming practices "
    "(Test-driven development of code that ensures compliance, data protection and meets security "
    "standards).",
    "Compile and analyze data, processes, and codes to troubleshoot problems and identify areas for "
    "improvement.",
    "Carry out implementation of data storage solutions.",
    "Design scalable microservices architecture.",
    "Keep job knowledge up-to-date to better assist other team members as needed by: studying best "
    "practices, new development tools, programming techniques, software approaches & structures; "
    "learning new programming languages.",
    "Work with different cross functional teams to ideate innovative solutions to develop ideas for "
    "new programs, products, or features by monitoring industry developments and trends.",
]

_FC_NOTICE_TIERS = [
    "Where the Employee has completed up to one (1) year of continuous service with the Company, "
    "the applicable notice period shall be fifteen (15) days.",
    "Where the Employee has completed more than one (1) year but up to two (2) years of continuous "
    "service with the Company, the applicable notice period shall be thirty (30) days.",
    "Where the Employee has completed more than two (2) years of continuous service with the "
    "Company, the applicable notice period shall be forty-five (45) days.",
]

_FC_FOR_CAUSE = [
    "commit any act of gross misconduct;",
    "breach the Company’s Code of Conduct or policies;",
    "commit any serious breach or repeatedly or continually commit a material breach of the terms "
    "of your employment with the Company;",
    "are guilty of conduct tending to bring yourself or the Company into disrepute;",
    "are convicted of a criminal offence,",
    "cease to hold the qualifications necessary for you to carry out your work with the Company;",
    "are found in an act of moral turpitude or to have indulged in violations of any laws, rule or "
    "regulations as applicable generally or in respect of the Company;",
    "are absent for a continuous period of 3+ business days which has not been duly authorized or "
    "approved by the Company (absconding and abandonment policy applicable); or",
    "provide false, inaccurate or incomplete information to the Company regarding your background "
    "(including but not limited to your educational background, professional/ technical skills) "
    "and/or previous employment history.",
]


def _fc_termination() -> list[dict]:
    return [
        b.p(
            "Subject to the terms and conditions set forth herein, the following provisions shall "
            "govern the resignation or termination of employment by either the Employee or the "
            "Company."
        ),
        b.p("**1. Resignation by Employee**"),
        b.p(
            "In the event the Employee wishes to resign from employment, the Employee shall provide "
            "written notice to the Company in accordance with the following notice period "
            "requirements:"
        ),
        b.ul(_FC_NOTICE_TIERS),
        b.p(
            "The notice period shall commence from the date the resignation is formally acknowledged "
            "by the Reporting Manager or the People Team."
        ),
        b.p(
            "The Employee shall continue to diligently perform their duties during the notice period "
            "and shall complete all assigned work, pending deliverables, documentation, handover, "
            "and knowledge transfer activities as reasonably required by the Company."
        ),
        b.p(
            "The Company reserves the right, at its sole discretion, to reduce, waive, or modify the "
            "notice period based on business requirements, operational considerations, project "
            "commitments, client obligations, completion of handover requirements, or any other "
            "relevant factors. Any such reduction, waiver, or modification shall be effective only "
            "upon written confirmation from the Company. The Employee's Full and Final Settlement "
            "shall be calculated and processed based on the Employee's last working day with the "
            "Company and shall be subject to applicable deductions, recoveries, Company policies, "
            "and statutory requirements."
        ),
        b.p(
            "The Employee shall not absent themselves from work, discontinue services, or avail any "
            "unauthorized leave during the notice period without prior written approval from the "
            "Company. Any unauthorized absence may be dealt with in accordance with applicable "
            "Company policies."
        ),
        b.p(
            "The Company shall have the right to determine the Employee’s working arrangement during "
            "the notice period, including work-from-office requirements, based on the nature of the "
            "role, business requirements, project/client commitments, and criticality of the "
            "handover process."
        ),
        b.p("**2. Termination by Company**"),
        b.p(
            "The Company may terminate the Employee's employment by providing written notice or "
            "payment of Base Salary together with all admissible allowances in lieu of notice, in "
            "accordance with the following notice period requirements:"
        ),
        b.ul(_FC_NOTICE_TIERS),
        b.p(
            "The Company reserves the right to determine, at its sole discretion and subject to "
            "applicable laws, whether the Employee shall serve the notice period in whole, or be "
            "relieved immediately upon payment of base salary in lieu of the applicable notice "
            "period."
        ),
        b.p(
            "The Employee's Full and Final Settlement shall be calculated based on the Employee's "
            "last working day, together with any amounts payable in lieu of notice, if applicable, "
            "and shall be subject to applicable deductions, recoveries, Company policies, and "
            "statutory requirements."
        ),
        b.p("**Notice Period Buyout:**"),
        b.ul([
            "1. You may opt to buy out their notice period, subject to approval from both the "
            "Reporting Manager and the People Team.",
            "2. The buyout amount shall be calculated based on the employee's base salary for the "
            "unserved notice period and must be paid in full before the final clearance process is "
            "initiated.",
            "3. No leave adjustments shall be allowed against the notice period buyout. Any pending "
            "leave encashment shall be processed separately as per company policy.",
            "4. The buyout request must be submitted in writing and will only be considered valid "
            "upon formal approval from both the Reporting Manager and the People Team.",
            "5. The company reserves the right to reject a notice period buyout request based on "
            "business requirements or other operational considerations.",
        ]),
        b.p(
            "The Company may at its absolute discretion, terminate your employment with the Company "
            "immediately without notice or pay you in lieu thereof, if at any time during the course "
            "of your employment with the Company you:"
        ),
        b.ol(_FC_FOR_CAUSE),
    ]


_FC_SCHEDULE_B = [
    "Employment with EZ Lab as an employee or engagement with EZ Lab as an independent contractor, "
    "as the case may be (the “**Engagement**”), will give the Participant access to proprietary and "
    "confidential information belonging to EZ Lab, its customers, its suppliers and others (the "
    "proprietary and confidential information is collectively referred to in this Agreement as "
    "“**Confidential Information**”). Confidential Information includes but is not limited to customer "
    "lists, marketing plans, proposals, contracts, technical and/or financial information, "
    "databases, software and know-how. All Confidential Information remains the confidential and "
    "proprietary information of EZ Lab.",

    "As referred to herein, the “**Business of EZ Lab**” shall relate to the business of EZ Lab as the "
    "same is determined by the Proprietor of EZ Lab from time to time.",

    "The Participant may in the course of the Engagement conceive, develop or contribute to material "
    "or information related to the Business of EZ Lab, including, without limitation, software, "
    "technical documentation, ideas, inventions (whether or not patentable), hardware, know-how, "
    "marketing plans, designs, techniques, documentation and records, regardless of the form or "
    "media, if any, on which such is stored (referred to in this Agreement as “**Proprietary "
    "Property**”). EZ Lab shall exclusively own all Proprietary Property which the Participant "
    "conceives, develops or contributes to in the course of the Engagement and all intellectual and "
    "industrial property and other rights of any kind in or relating to the Proprietary Property, "
    "including but not limited to all copyright, patent, trade secret and trade-mark rights in or "
    "relating to the Proprietary Property. For greater certainty, the Participant hereby assigns to "
    "EZ Lab any and all rights that the Participant may have or obtain in or to the Proprietary "
    "Property. Material or information conceived, developed or contributed to by the Participant "
    "outside work hours on EZ Lab’s premises or through the use of EZ Lab’s property and/or assets "
    "shall also be Proprietary Property and be governed by this Agreement if such material or "
    "information relates to the Business of EZ Lab. The Participant shall keep full and accurate "
    "records accessible at all times to the EZ Lab relating to all Proprietary Property and shall "
    "promptly disclose and deliver to the EZ Lab all Proprietary Property.",

    None,  # clause 4 carries sub-limbs; inserted separately below

    "The Participant shall return or destroy, as directed by EZ Lab, Confidential Information and "
    "Proprietary Property to EZ Lab upon request by EZ Lab at any time. The Participant shall "
    "certify, by way of affidavit or statutory declaration, that all such Confidential Information "
    "and Proprietary Property has been returned or destroyed, as applicable.",

    "The Participant covenants and agrees not to make any unauthorized use whatsoever of or to bring "
    "onto EZ Lab’s premises for the purpose of making any unauthorized use whatsoever of any trade "
    "secrets, confidential information or proprietary property of any third party, including without "
    "limitation any trade-marks or copyrighted materials, during the course of the Engagement. The "
    "Participant agrees and represents that the Engagement and the execution of this Agreement do "
    "not and will not breach any agreement to which the Participant is currently a party, or which "
    "currently applies to the Participant.",

    "At the reasonable request and at the sole expense of EZ Lab, the Participant shall do all "
    "reasonable acts necessary and sign all reasonable documentation necessary in order to ensure EZ "
    "Lab’s ownership of the Proprietary Property and all intellectual and industrial property rights "
    "and other rights in the same, including but not limited to providing to the EZ Lab written "
    "assignments of all rights to EZ Lab and any other documents required to enable EZ Lab to "
    "document rights to and/or register patents, copyrights, trade-marks, industrial designs and "
    "such other protections as EZ Lab considers advisable anywhere in the world.",

    "The Participant hereby irrevocably and unconditionally waives all moral rights the Participant "
    "may now or in the future have in any Proprietary Property.",

    "The Participant agrees that the Participant will, if requested from time to time by EZ Lab, "
    "execute such further reasonable agreements as to confidentiality and proprietary rights as EZ "
    "Lab’s customers or suppliers reasonably required to protect Confidential Information or "
    "Proprietary Property.",

    "Regardless of any changes in position, salary or otherwise, including, without limitation, "
    "termination of the Engagement, unless otherwise stipulated pursuant to the terms hereof, the "
    "Participant will continue to be subject to each of the terms and conditions of this Agreement "
    "and any other(s) executed pursuant to the preceding paragraph.",

    "The Participant agrees that the Participant’s sole and exclusive remedy for any breach of this "
    "Agreement or any other agreement by EZ Lab will be limited to monetary damages and that the "
    "Participant will not make any claim in respect of any rights to or interest in any Confidential "
    "Information or Proprietary Property.",

    "The Participant agrees that, during the term of this Agreement and for one (1) year after "
    "termination for any reason, he or she will not hire or solicit nor attempt to hire or solicit "
    "EZ Lab’s employees (or any person who was employed by EZ Lab within the past one year) without "
    "the prior written consent of EZ Lab.",

    "The Participant acknowledges that, during the term of this Agreement, he or she may become "
    "familiar with Confidential Information concerning such Related Companies, and with investment "
    "opportunities relating to their respective businesses and therefore agree that, during the term "
    "of this Agreement and for a period of two years thereafter (the “**Noncompete Period**”), he or she "
    "will not directly or indirectly own, manage, control, participate in, consult with, render "
    "services for, or in any other manner engage in any business, or invest in or lend money to any "
    "business which constitutes or is competitive with (including, without limitation, by competing "
    "for the same subscriber or customer base) any business conducted by any System owned or managed "
    "by any Related Company (as and where such Systems are operated or managed or are proposed to be "
    "operated or managed by EZ Lab during the term of this Agreement, or as of the end of the "
    "Noncompete Period.",

    "The Participant acknowledges that the services provided by the Participant to EZ Lab are "
    "unique. The Participant further agrees that irreparable harm will be suffered by EZ Lab in the "
    "event of the Participant’s breach or threatened breach of any of his or her obligations under "
    "this Agreement, and that EZ Lab will be entitled to seek, in addition to any other rights and "
    "remedies that it may have at law or equity, a temporary or permanent injunction restraining the "
    "Participant from engaging in or continuing any such breach hereof. Any claims asserted by the "
    "Participant against EZ Lab shall not constitute a defense in any injunction action, application "
    "or motion brought against the Participant by EZ Lab.",

    "This Agreement is governed by the laws of the India and the Participant agrees to the "
    "non-exclusive jurisdiction of the courts of New Delhi in relation to this Agreement",

    "If any provision of this Agreement is held by a court of competent jurisdiction to be invalid or "
    "unenforceable, that provision shall be deleted, and the other provisions shall remain in effect.",
]


def _fc_schedule_b_blocks() -> list[dict]:
    """Schedule B's 16 covenants, numbered explicitly so clause 4 can carry its (i)-(iii) sub-limbs."""
    out: list[dict] = []
    for i, text in enumerate(_FC_SCHEDULE_B, 1):
        if text is None:  # clause 4
            out.append(b.p(
                "4. The Participant shall, both during and after the Engagement, keep all "
                "Confidential Information and Proprietary Property confidential and shall not use "
                "any of it except for the purpose of carrying out authorized activities on behalf of "
                "EZ Lab. The Participant may, however, use or disclose Confidential Information "
                "which:"
            ))
            out.append(b.ul([
                "(i) is or becomes public other than through a breach of this Agreement;",
                "(ii) is known to the Participant prior to the date of this Agreement and with "
                "respect to which the Participant does not have any obligation of confidentiality; or",
                "(iii) is required to be disclosed by law, whether under an order of a court or "
                "government tribunal or other legal process, provided that Participant informs EZ Lab "
                "of such requirement in sufficient time to allow EZ Lab to avoid such disclosure by "
                "the Participant.",
            ]))
            continue
        out.append(b.p(f"{i}. {text}"))
    return out


def full_contract(ctx: dict) -> dict:
    """Full Contract (EZ, individual, full_time, contract).

    Faithful to 'Start Date_Full Contract_EZ Lab_Name.docx.pdf': cover letter with acknowledgement,
    Schedule A (the 27-row terms grid, including the Compensation table computed by
    comp.contract_annexure) and Schedule B (Employee Covenants, 16 clauses), each closing with its
    own execution block.

    HR fills: joining date, full name, permanent address, role, and the reporting and approving
    managers with their positions.
    """
    who = ctx["name"]
    role = ctx["designation"]
    start = ctx["start_date"]
    witness = ctx["signatory_name"]
    annexure = comp.contract_annexure(ctx.get("annual_ctc"), ctx.get("comp_overrides"))
    execution = [
        b.p(
            f"**IN WITNESS WHEREOF** EZ Lab has caused this Agreement to be executed as of the "
            f"**{start}**."
        ),
        b.signature(
            ("PARTICIPANT - NAME", "" if who.startswith("[") else who.upper()),
            ("WITNESS to PARTICIPANT - NAME", witness.upper(), witness, ctx["signatory_title"]),
            heading="Signed in the presence of:",
        ),
    ]

    return {
        "title": f"FTE Contract - {who}",
        "doc_type": "contract",
        "blocks": [
            # ── Cover letter ──────────────────────────────────────────────────────────────
            # The source sets the addressee on the left with the reference and date level with it.
            b.row(
                [b.p(f"**{who}**"), b.p(ctx["address"])],
                [b.p(f"Reference: {ctx['reference']}", align="right"),
                 b.p(f"Date: {ctx['letter_date']}", align="right")],
            ),
            b.p(f"Dear {who},"),
            b.p(
                f"We are pleased to confirm this offer of employment to you for a regular full-time "
                f"position with EZ LAB PRIVATE LIMITED (herein after referred to as EZ Lab) as a "
                f"**{role}** effective **{start}**. As discussed, this offer is conditional upon "
                f"completion of satisfactory references that could include, but is not necessarily "
                f"limited to, a review of past employment and education records."
            ),
            b.p(
                "The details of our offer, including the terms and conditions of your employment, "
                "are attached as Schedule “A”. Please take the time to carefully review our offer. "
                "This letter, along with the enclosed schedules, outlines the obligations of both EZ "
                "Lab and yourself with respect to your employment conditions. It details the terms "
                "and conditions of your employment with EZ Lab, and will form our agreed upon "
                "employment contract with you once signed."
            ),
            b.p(
                "Accepting employment will be conditional upon agreeing to and signing the attached "
                "copy of this letter and the attached Schedule(s), initialing each page in the "
                "right-hand corner, and returning it to me upon your earliest convenience, but prior "
                "to your first day of employment."
            ),
            b.p(
                f"**{who}**, we look forward to welcoming you to the EZ Lab team and wish you a "
                f"successful and rewarding career with us."
            ),
            b.p("Sincerely,"),
            b.space(74),   # room to sign, measured off the source letter
            b.p(f"**{witness}**"),
            b.p(ctx["signatory_title"]),
            b.p(
                f"I, **{who}**, acknowledge that I have read, understood and accept this offer and "
                f"the terms and conditions contained in the attached Schedule(s), and agree to be "
                f"bound by the terms and conditions of employment as outlined therein."
            ),
            b.p("Signature ________________________________    Date ___________________"),
            b.divider(),

            # ── Schedule A ────────────────────────────────────────────────────────────────
            b.h(1, "Schedule A"),
            b.h(3, "EZ LAB PRIVATE LIMITED"),
            b.h(3, "Terms and Conditions of Employment"),
            b.p(
                "The following outlines the terms and conditions of employment with EZ Lab. EZ Lab "
                "reserves the right to change these terms and conditions as necessary, with due "
                "notice."
            ),
            b.terms([
                ("Title", [b.p(role)]),
                ("Reporting Relationship", [
                    b.p(f"**{ctx['manager']}**, {ctx['manager_role']}"),
                    b.p(f"**{ctx['approving_manager']}**, {ctx['approving_manager_role']}"),
                ]),
                ("Responsibilities", [
                    b.p("Your key responsibilities would include:"),
                    b.ol(ctx["responsibilities"] or _FC_RESPONSIBILITIES),
                    b.p(
                        "While employed by EZ Lab, you agree to work on a full-time basis "
                        "exclusively for EZ Lab and agree that you shall not, while you are employed "
                        "by EZ Lab, be employed or engaged in any capacity, in promoting, "
                        "undertaking or carrying on any other business that competes with EZ Lab or "
                        "interferes or could reasonably interfere with your duties to EZ Lab without "
                        "our prior written permission."
                    ),
                ]),
                ("Location", [b.p(
                    "EZ Lab Office, 5th Floor, Imperia Mindspace, Golf Course Extension, Sector 62, "
                    "Gurugram, Haryana – 122413, INDIA"
                )]),
                ("Joining Bonus", [b.p("N/A")]),
                ("Bond", [b.p("N/A")]),
                ("Status", [b.p("Full-time")]),
                ("Start Date", [b.p(start)]),
                ("Hours of Work", [b.p(
                    "Hours of work are flexible based on workload. You will however be required to "
                    "work from office at least 3 days a week."
                )]),
                ("Overtime", [b.p(
                    "There is no provision for payment for overtime. We track output and you will be "
                    "paid for additional output as defined in the Bonus/ Incentive section"
                )]),
                ("Payroll Schedule", [b.p(
                    "Salary will be paid monthly, with deductions for statutory obligations including "
                    "but not limited to PF, ESIC, TDS, LWF, Professional Tax as applicable from time "
                    "to time."
                )]),
                ("Vacation", [b.p(
                    "You shall be entitled to leaves and annual holidays as per the rules of the "
                    "company."
                )]),
                ("Compensation", [
                    b.comp_custom(annexure["rows"], annexure["notes"], known=annexure["known"]),
                ]),
                # The ESIC clause was added to the source contract after this template was first
                # written. It is three paragraphs under a plain sub-heading, inside the Benefits
                # row rather than as a row of its own — that is how the source lays it out.
                ("Benefits", [
                    b.p(
                        "You shall be entitled to participate in all benefit plans of EZ Lab as may be "
                        "made available to employees of EZ Lab from time to time for which you are "
                        "eligible."
                    ),
                    b.p("ESIC Coverage and Group Insurance"),
                    b.p(
                        "Employees whose Basic Pay is ₹21,000 (Rupees Twenty-One Thousand) or below "
                        "per month, or such other threshold as may be prescribed under the Employees’ "
                        "State Insurance Act, 1948 (“**ESI Act**”) from time to time, shall be "
                        "mandatorily covered under the Employees’ State Insurance Corporation "
                        "(“**ESIC**”) Scheme. The employee and the Company shall make statutory "
                        "contributions towards ESIC at the rates prescribed under applicable law, as "
                        "amended from time to time."
                    ),
                    b.p(
                        "Upon becoming eligible for ESIC coverage, the employee shall cease to be "
                        "eligible for the Company’s Group Medical Insurance (GMC) and Group Personal "
                        "Accident Insurance (GPA) benefits, unless otherwise expressly approved by the "
                        "Company in writing. The employee shall thereafter be entitled to medical and "
                        "other benefits available under the ESIC Scheme in accordance with the "
                        "provisions of the ESI Act and applicable rules."
                    ),
                    b.p(
                        "The Company reserves the right to enroll, modify, discontinue, or transition "
                        "an employee’s insurance coverage to ensure compliance with applicable laws "
                        "and statutory requirements. Any change in ESIC eligibility arising from "
                        "revisions to salary structure or statutory thresholds shall automatically "
                        "apply without requiring any further amendment to this Agreement."
                    ),
                ]),
                ("Travel", [b.p(
                    "You will need to travel for work as required. You are required to maintain a "
                    "valid passport during your tenure at EZ Lab."
                )]),
                ("Nature of Employment", [b.p(
                    "You will be a permanent employee of the Company from the date of your joining "
                    "and will be entitled to all the benefits and facilities that are applicable to "
                    "rest of the employees of the Company. Your position is a wholetime employment "
                    "with the Company and you shall devote yourself exclusively to the business and "
                    "interests of the Company."
                )]),
                ("Retirement Age", [b.p(
                    "Your age of retirement from the services of the company will be 58 (Fifty-Eight) "
                    "years. The date of birth as submitted by you at the time of joining the services "
                    "of the Company will be treated as binding and final. The Company may at its sole "
                    "discretion extend the Terms & Conditions of employment beyond the age of "
                    "retirement."
                )]),
                ("Place of Posting & Transfer", [b.p(
                    "Your initial place of posting will be at GURGAON (India). However, your services "
                    "are liable to be transferred/lent to any place/branch of our organization or "
                    "subsidiary and/or associated company in India or abroad, whether existing or "
                    "established in future at the sole discretion of the Management, in such other "
                    "capacity as the Company may determine. Upon being transferred / lent, you shall "
                    "be governed by the conditions of service / rules and regulations as prevalent at "
                    "that place."
                )]),
                ("Policies and Standards", [b.p(
                    "EZ Lab has established a variety of policies and standards that ensure a safe, "
                    "enjoyable working environment. During the period of your employment with us, you "
                    "agree to be bound by these policies and standards, and any future policies and "
                    "standards that are reasonably introduced by the EZ Lab. It is agreed that the "
                    "introduction and administration of these policies is within the sole discretion "
                    "of EZ Lab and that these policies do not form a part of this Agreement. It is "
                    "agreed that if EZ Lab introduces, amends or deletes employment-related policies "
                    "as conditions warrant that such introduction, deletion or amendment does not "
                    "constitute a breach of this Agreement."
                )]),
                ("Confidentiality & Intellectual Property", [b.p(
                    "Our offer of employment is conditional upon you agreeing to and abiding by the "
                    "“Confidentiality and Proprietary Information Agreement.” Attached Schedule “B.”"
                )]),
                ("Non-Solicitation", [b.p(
                    "You hereby agree that, while you are employed by EZ Lab and for one (1) year "
                    "following the termination of your employment with EZ Lab, you will not (i) "
                    "recruit, attempt to recruit or directly or indirectly participate in the "
                    "recruitment of, any EZ Lab employee or (ii) directly or indirectly solicit, "
                    "attempt to solicit, canvass or interfere with any customer or supplier of EZ Lab "
                    "in a manner that conflicts with or interferes in the business of EZ Lab as "
                    "conducted with such customer or supplier."
                )]),
                ("Representation", [b.p(
                    "You hereby represent and warrant to EZ Lab that you are not party to any written "
                    "or oral agreement with any third party that would restrict your ability to enter "
                    "into this Agreement or the Confidentiality and Proprietary Information Agreement "
                    "or to perform your obligations hereunder and that you will not, by joining EZ "
                    "Lab, breach any non-disclosure, proprietary rights, non-competition, "
                    "non-solicitation or other covenant in favor of any third party."
                )]),
                ("Changes to Duties and/or Compensation", [b.p(
                    "If your duties or compensation should change during the course of your "
                    "employment with EZ Lab, the validity of our agreement will not be affected. In "
                    "addition, if one or more of the provisions in our agreement are deemed void by "
                    "law, then the remaining provisions will continue in full force and effect."
                )]),
                ("Termination", _fc_termination()),
                ("Company's Honor Code & Workplace Guidelines", [
                    b.p(
                        "During the course of your employment, you will be required to adhere to the "
                        "Code of Conduct of the Company and follow the Workplace Guidelines and "
                        "Policies as compiled in the HR Handbook of the Company."
                    ),
                    b.p(
                        "1. You shall be governed by the rules and regulations and policies of the "
                        "organization, which are in force and/or are framed from time to time. The "
                        "terms and conditions of service can be changed without any reference to you "
                        "and the same shall be binding upon you as is applicable to other employees "
                        "of your grade/level/function/department of the company. You will abide by "
                        "the rules & regulation of the Company which are in force for the time being "
                        "and/or which may be framed from time to time and you shall also ensure "
                        "compliance to statues, regulations and requirements laid down by various "
                        "regulatory and statutory bodies including the Information Technology Act and "
                        "its related rules and regulations."
                    ),
                    b.p(
                        "2. You shall communicate the change, if any, in your permanent/present "
                        "residential address/telephone/mobile number hereafter immediately, failing "
                        "which communication sent to you at your notified address shall be deemed to "
                        "have been received by you."
                    ),
                    b.p(
                        "3. You shall throughout your service with the company, conduct yourself in a "
                        "manner befitting a responsible employee of the company and maintain absolute "
                        "integrity. In case your behaviour or conduct is found wanting or undesirable, "
                        "the company reserves the right to terminate your services without any "
                        "compensation, notice or salary in lieu thereof."
                    ),
                    b.p(
                        "4. In the event of your resignation from the Company or leaving the company "
                        "due to any other reason, you will not use / utilize / provide any work / "
                        "material / information that may be either produced or acquired by you during "
                        "your tenure with the Company. The Company reserves the right to initiate "
                        "appropriate legal action and claim appropriate damages in the event of your "
                        "failure to comply with this provision, resulting in any financial / "
                        "non-financial loss to the Company."
                    ),
                ]),
                ("Misc. Provisions", [
                    b.p(
                        "5. You will not accept any present, commission or any sort of gratification "
                        "in cash or kind from any person, party, firm or company having dealing with "
                        "the Company and if you are offered any, you should immediately report the "
                        "same to the Management."
                    ),
                    b.p(
                        "6. If any provision of this letter is held to be invalid or unenforceable, "
                        "then such provision shall so far as it is invalid or unenforceable, be given "
                        "no effect and shall be deemed to be included in this letter but without "
                        "invalidating any of the remaining provisions of this letter."
                    ),
                    b.p(
                        "7. Any dispute arising out of this employment shall be referred to the "
                        "exclusive jurisdiction of court in Gurgaon, INDIA only."
                    ),
                ]),
                ("Legal Advice", [b.p(
                    "If you are uncertain about the contents of this offer, we suggest that it may be "
                    "advisable to seek independent legal advice prior to signing."
                )]),
            ]),
            *execution,
            b.divider(),

            # ── Schedule B ────────────────────────────────────────────────────────────────
            b.h(1, "Schedule B"),
            b.h(3, "Employee Covenants"),
            b.h(3, "Confidentiality and Proprietary Information Agreement"),
            b.p(
                "In consideration of employment as an employee or engagement as an independent "
                "contractor with EZ Lab Private Limited (“**EZ Lab**”), the undersigned (the "
                "“**Participant**”) agrees and covenants as follows:"
            ),
            *_fc_schedule_b_blocks(),
            *execution,
        ],
    }


register(
    "ez_full_contract",
    full_contract,
    # The full-time EMPLOYMENT CONTRACT, offered as its own document (the "FTE Contract") alongside
    # the shorter offer letter. The key stays ez_full_contract: it is stored on every document
    # already drafted from it, and renaming a key orphans them.
    label="FTE Contract",
    description=(
        "EZ Lab full-time employment contract: cover letter with acknowledgement, Schedule A terms "
        "grid (with the compensation table) and Schedule B employee covenants."
    ),
    entity="EZ",
    doc_type="contract",
    party_type="individual",
    contract_type="full_time",
)


def agency_nda(ctx: dict) -> dict:
    """Agency NDA (EZ, agency, agency, nda).

    Faithful to 'Date_Agency NDA_EZ Lab_.docx.pdf': the standalone Schedule B Confidentiality and
    Proprietary Information Agreement issued on EZ Lab letterhead, 11 clauses, executed by both
    parties. As in the EZ Lab agency contract, the party named in the body is ArabEasy LLC.

    Kept as its own builder rather than sharing the ArabEasy one: the recitals are worded
    differently ("Name of the Agency" vs "Name of the Agency/ service provider"), so a future edit
    to one entity's NDA must not silently rewrite the other's.
    """
    agency = ctx["agency_name"]
    signatory = ctx["agency_signatory_name"]
    ez_name = ctx["contract_signatory_name"]
    ez_title = ctx["contract_signatory_title"]

    return {
        "title": f"Agency NDA - {ctx['agency_name_raw']}",
        "doc_type": "nda",
        "blocks": [
            b.p(f"Ref # {ctx['reference']}", align="right"),
            b.p(f"Date: {ctx['letter_date']}", align="right"),
            b.h(1, "Schedule B", underline=True),
            b.h(3, "Confidentiality and Proprietary Information Agreement"),
            b.p(f"This Agreement is made on this **{b.dots(ctx['effective_date'])}** (Date) by and between:"),
            b.p(
                f"ArabEasy LLC (\"**EZ**\"), having its business address at "
                f"{ctx['contracting_office']}, hereinafter duly represented by **{ez_name}** in his "
                f"capacity as {ez_title} (hereinafter referred to as \"**EZ**\" or \"**Disclosing "
                f"Party**\")"
            ),
            b.p("And"),
            b.p(
                f"**{b.dots(agency)}** (Name of the Agency), a {b.dots(ctx['service_type'])} (type of service) with its principal "
                f"office at {b.dots(ctx['agency_address'])}, hereinafter duly represented by {b.dots(signatory)} "
                f"(Name of the Authorized Signatory) in his capacity as "
                f"{b.dots(ctx['agency_signatory_title'])} (Position/Designation) (hereinafter referred to as "
                f"\"**Service Provider**\" or \"**Receiving Party**\");"
            ),
            b.p("(Collectively hereinafter referred to as Parties and individually as Party)"),
            b.p("**WHEREAS**:"),
            b.p(
                f"EZ (**Disclosing Party**) wishes to employ the services of Service Provider "
                f"(**Receiving Party**) to provide {b.dots(ctx['service_type'])} (type of Services)."
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
                "2. As referred to herein, the “**Business of EZ**” shall relate to the business of EZ "
                "as the same is determined by the Proprietor of EZ from time to time."
            ),
            b.p(
                "3. The Receiving Party may in the course of the working process conceive, develop "
                "or contribute to material or information related to the Business of EZ, including, "
                "without limitation, software, technical documentation, ideas, inventions (whether "
                "or not patentable), hardware, know-how, marketing plans, designs, techniques, "
                "documentation, and records, regardless of the form or media, if any, on which such "
                "is stored (referred to in this Agreement as “**Proprietary Property**”). EZ shall "
                "exclusively own all Proprietary Property which the Participant conceives, develops "
                "or contributes to in the course of the working process and all intellectual and "
                "industrial property and other rights of any kind in or relating to the Proprietary "
                "Property, including but not limited to all copyright, patent, trade secret and "
                "trade-mark rights in or relating to the Proprietary Property. For greater "
                "certainty, the Receiving party hereby assigns to EZ any and all rights that the "
                "Participant may have or obtain in or to the Proprietary Property. Material or "
                "information conceived, developed or contributed to by the Receiving Party outside "
                "work hours on EZ’s premises or through the use of EZ’s property and/or assets "
                "shall also be Proprietary Property and be governed by this Agreement if such "
                "material or information relates to the Business of EZ. The Receiving Party shall "
                "keep full and accurate records accessible at all times to EZ relating to all "
                "Proprietary Property and shall promptly disclose and deliver to EZ all Proprietary "
                "Property."
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
                "this Agreement do not and will not breach any agreement to which the Receiving "
                "Party is currently a Party or which currently applies to the Receiving Party."
            ),
            b.p(
                "6. The Receiving Party hereby irrevocably and unconditionally waives all moral "
                "rights the Receiving Party may now or in the future have in any Proprietary "
                "Property."
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
                "will be suffered by EZ in the event of the Participant’s breach or threatened "
                "breach of any of his or her obligations under this Agreement and that EZ will be "
                "entitled to seek, in addition to any other rights and remedies that it may have at "
                "law or equity, a temporary or permanent injunction restraining the Receiving Party "
                "from engaging in or continuing any such breach hereof. Any claims asserted by the "
                "Participant against EZ shall not constitute a defence in any injunction action, "
                "application, or motion brought against the Receiving Party by EZ."
            ),
            b.p(
                f"10. This Agreement is governed by the laws of {ctx['governing_law']} and the "
                f"Receiving Party agrees to the non-exclusive jurisdiction of the courts of "
                f"{ctx['jurisdiction']} in relation to this Agreement."
            ),
            b.p(
                "11. If any provision of this Agreement is held by a court of competent jurisdiction "
                "to be invalid or unenforceable, that provision shall be deleted and the other "
                "provisions shall remain in effect."
            ),

            b.p(
                f"**IN WITNESS WHEREOF** EZ has caused this Agreement to be executed as of the "
                f"{ctx['effective_date']} (Effective Date)."
            ),
            b.signature(
                ("SIGNED for and on behalf of Service Provider", ""),
                ("SIGNED for and on behalf of EZ", ez_name.upper(), None, ez_title),
            ),
        ],
    }


register(
    "ez_agency_nda",
    agency_nda,
    label="Agency NDA",
    description=(
        "Standalone Confidentiality and Proprietary Information Agreement on EZ Lab letterhead, "
        "between EZ and a service-provider agency. 11 clauses, signed by both parties."
    ),
    entity="EZ",
    doc_type="nda",
    party_type="agency",
    contract_type="agency",
)


_NDA_CLAUSES = [
    "Employment with EZ Lab as an employee or engagement with EZ Lab as an independent contractor, "
    "as the case may be (the “**Engagement**”), will give the Participant access to proprietary and "
    "confidential information belonging to EZ Lab, its customers, its suppliers and others (the "
    "proprietary and confidential information is collectively referred to in this Agreement as "
    "“**Confidential Information**”). Confidential Information includes but is not limited to customer "
    "lists, marketing plans, proposals, contracts, technical and/or financial information, "
    "databases, software and know-how. All Confidential Information remains the confidential and "
    "proprietary information of EZ Lab.",

    "As referred to herein, the “**Business of EZ Lab**” shall relate to the business of EZ Lab as the "
    "same is determined by the Proprietor of EZ Lab from time to time.",

    "The Participant may in the course of the Engagement conceive, develop or contribute to material "
    "or information related to the Business of EZ Lab, including, without limitation, software, "
    "technical documentation, ideas, inventions (whether or not patentable), hardware, know-how, "
    "marketing plans, designs, techniques, documentation and records, regardless of the form or "
    "media, if any, on which such is stored (referred to in this Agreement as “**Proprietary "
    "Property**”). EZ Lab shall exclusively own all Proprietary Property which the Participant "
    "conceives, develops or contributes to in the course of the Engagement and all intellectual and "
    "industrial property and other rights of any kind in or relating to the Proprietary Property, "
    "including but not limited to all copyright, patent, trade secret and trade-mark rights in or "
    "relating to the Proprietary Property. For greater certainty, the Participant hereby assigns to "
    "EZ Lab any and all rights that the Participant may have or obtain in or to the Proprietary "
    "Property. Material or information conceived, developed or contributed to by the Participant "
    "outside work hours on EZ Lab’s premises or through the use of EZ Lab’s property and/or assets "
    "shall also be Proprietary Property and be governed by this Agreement if such material or "
    "information relates to the Business of EZ Lab. The Participant shall keep full and accurate "
    "records accessible at all times to the EZ Lab relating to all Proprietary Property and shall "
    "promptly disclose and deliver to the EZ Lab all Proprietary Property.",

    None,  # clause 4 carries the (i)-(iii) sub-limbs; inserted separately

    "The Participant shall return or destroy, as directed by EZ Lab, Confidential Information and "
    "Proprietary Property to EZ Lab upon request by EZ Lab at any time. The Participant shall "
    "certify, by way of affidavit or statutory declaration, that all such Confidential Information "
    "and Proprietary Property has been returned or destroyed, as applicable.",

    "The Participant covenants and agrees not to make any unauthorized use whatsoever of or to bring "
    "onto EZ Lab’s premises for the purpose of making any unauthorized use whatsoever of any trade "
    "secrets, confidential information or proprietary property of any third party, including without "
    "limitation any trade-marks or copyrighted materials, during the course of the Engagement. The "
    "Participant agrees and represents that the Engagement and the execution of this Agreement do "
    "not and will not breach any agreement to which the Participant is currently a party, or which "
    "currently applies to the Participant.",

    "At the reasonable request and at the sole expense of EZ Lab, the Participant shall do all "
    "reasonable acts necessary and sign all reasonable documentation necessary in order to ensure EZ "
    "Lab’s ownership of the Proprietary Property and all intellectual and industrial property rights "
    "and other rights in the same, including but not limited to providing to the EZ Lab written "
    "assignments of all rights to EZ Lab and any other documents required to enable EZ Lab to "
    "document rights to and/or register patents, copyrights, trade-marks, industrial designs and "
    "such other protections as EZ Lab considers advisable anywhere in the world.",

    "The Participant hereby irrevocably and unconditionally waives all moral rights the Participant "
    "may now or in the future have in any Proprietary Property.",

    "The Participant agrees that the Participant will, if requested from time to time by EZ Lab, "
    "execute such further reasonable agreements as to confidentiality and proprietary rights as EZ "
    "Lab’s customers or suppliers reasonably required to protect Confidential Information or "
    "Proprietary Property.",

    "Regardless of any changes in position, salary or otherwise, including, without limitation, "
    "termination of the Engagement, unless otherwise stipulated pursuant to the terms hereof, the "
    "Participant will continue to be subject to each of the terms and conditions of this Agreement "
    "and any other(s) executed pursuant to the preceding paragraph.",

    "The Participant agrees that the Participant’s sole and exclusive remedy for any breach of this "
    "Agreement or any other agreement by EZ Lab will be limited to monetary damages and that the "
    "Participant will not make any claim in respect of any rights to or interest in any Confidential "
    "Information or Proprietary Property.",

    "The Participant agrees that, during the term of this Agreement and for one (1) year after "
    "termination for any reason, he or she will not hire or solicit nor attempt to hire or solicit "
    "EZ Lab’s employees (or any person who was employed by EZ Lab within the past one year) without "
    "the prior written consent of EZ Lab.",

    "The Participant acknowledges that, during the term of this Agreement, he or she may become "
    "familiar with Confidential Information concerning such Related Companies, and with investment "
    "opportunities relating to their respective businesses and therefore agree that, during the term "
    "of this Agreement and for a period of two years thereafter (the “**Noncompete Period**”), he or she "
    "will not directly or indirectly own, manage, control, participate in, consult with, render "
    "services for, or in any other manner engage in any business, or invest in or lend money to any "
    "business which constitutes or is competitive with (including, without limitation, by competing "
    "for the same subscriber or customer base) any business conducted by any System owned or managed "
    "by any Related Company (as and where such Systems are operated or managed or are proposed to be "
    "operated or managed by EZ Lab during the term of this Agreement, or as of the end of the "
    "Noncompete Period.",

    "The Participant acknowledges that the services provided by the Participant to EZ Lab are "
    "unique. The Participant further agrees that irreparable harm will be suffered by EZ Lab in the "
    "event of the Participant’s breach or threatened breach of any of his or her obligations under "
    "this Agreement, and that EZ Lab will be entitled to seek, in addition to any other rights and "
    "remedies that it may have at law or equity, a temporary or permanent injunction restraining the "
    "Participant from engaging in or continuing any such breach hereof. Any claims asserted by the "
    "Participant against EZ Lab shall not constitute a defence in any injunction action, application "
    "or motion brought against the Participant by EZ Lab.",

    "This Agreement is governed by the laws of the India and the Participant agrees to the "
    "non-exclusive jurisdiction of the courts of New Delhi in relation to this Agreement.",

    "If any provision of this Agreement is held by a court of competent jurisdiction to be invalid or "
    "unenforceable, that provision shall be deleted, and the other provisions shall remain in effect.",
]


def nda(ctx: dict) -> dict:
    """NDA (EZ, individual, nda).

    Faithful to 'Date_NDA_EZ Lab.docx.pdf': Employee Covenants / Confidentiality and Proprietary
    Information Agreement, 16 clauses, executed by the Participant and witnessed.

    Distinct from the tech NDA: this version's Confidential Information and Proprietary Property
    definitions are the shorter general ones, and its clause order differs, so the two are
    registered as separate doc_types ('nda' and 'nda-tech') rather than one template.
    """
    who = ctx["name"]
    witness = ctx["signatory_name"]

    body: list[dict] = []
    for i, text in enumerate(_NDA_CLAUSES, 1):
        if text is None:
            body.append(b.p(
                "4. The Participant shall, both during and after the Engagement, keep all "
                "Confidential Information and Proprietary Property confidential and shall not use "
                "any of it except for the purpose of carrying out authorized activities on behalf of "
                "EZ Lab. The Participant may, however, use or disclose Confidential Information "
                "which:"
            ))
            body.append(b.ul([
                "(i) is or becomes public other than through a breach of this Agreement;",
                "(ii) is known to the Participant prior to the date of this Agreement and with "
                "respect to which the Participant does not have any obligation of confidentiality; or",
                "(iii) is required to be disclosed by law, whether under an order of a court or "
                "government tribunal or other legal process, provided that Participant informs EZ Lab "
                "of such requirement in sufficient time to allow EZ Lab to avoid such disclosure by "
                "the Participant.",
            ]))
            continue
        body.append(b.p(f"{i}. {text}"))

    return {
        "title": f"NDA - {who}",
        "doc_type": "nda",
        "blocks": [
            b.p(f"Reference: {ctx['reference']}", align="right"),
            b.p(f"Date: {ctx['letter_date']}", align="right"),
            b.h(1, "Employee Covenants"),
            b.h(3, "Confidentiality and Proprietary Information Agreement"),
            b.p(
                "In consideration of employment as an employee or engagement as an independent "
                "contractor with EZ Lab Private Limited (“**EZ Lab**”), the undersigned (the "
                "“**Participant**”) agrees and covenants as follows:"
            ),
            *body,
            b.p(
                f"**IN WITNESS WHEREOF** EZ Lab has caused this Agreement to be executed as of the "
                f"{ctx['execution_date']}."
            ),
            b.signature(
                ("PARTICIPANT - NAME", "" if who.startswith("[") else who.upper()),
                ("WITNESS to PARTICIPANT - NAME", witness.upper(), witness, ctx["signatory_title"]),
                heading="Signed in the presence of:",
            ),
        ],
    }


register(
    "ez_nda",
    nda,
    label="NDA",
    description=(
        "Employee Covenants: Confidentiality and Proprietary Information Agreement signed by an "
        "employee or independent contractor of EZ Lab. 16 clauses, witnessed."
    ),
    entity="EZ",
    doc_type="nda",
    party_type="individual",
    contract_type=None,  # binds an employee OR an independent contractor
)


# Annexure-1 of the traineeship letter: the job description bullets, then the trainee-specific
# undertakings (exclusivity, IP, data security, termination, conduct), transcribed verbatim.
_TRAINEE_JD = [
    "Create, schedule, and manage posts across social media platforms (LinkedIn, Instagram, "
    "Facebook, etc.).",
    "Support in planning and analyzing social media campaigns to increase engagement and reach.",
    "Conduct basic SEO research (keywords, backlinks, website performance) to support marketing "
    "activities.",
    "Write, design and edit creative content for blogs, social media, emailers, and marketing "
    "collaterals.",
    "Collaborate with the design team to maintain brand consistency across all visuals and messages.",
    "Monitor trends and competitor activities to identify opportunities for brand improvement.",
]

_TRAINEE_UNDERTAKINGS = [
    "During your training period, you are expected to devote your time and efforts solely to EZ LAB "
    "PRIVATE LIMITED work. You are also required to let your mentor know about forthcoming events "
    "(if there are any) in advance so that your work can be planned accordingly.",

    "All the work that you will produce at or in relation to EZ LAB PRIVATE LIMITED will be the "
    "intellectual property of EZ LAB PRIVATE LIMITED. You are not allowed to store, copy, sell, "
    "share, and distribute it to a third party under any circumstances. Similarly, you are expected "
    "to refrain from talking about your work in public domains (both online such as blogging, social "
    "networking site and offline among your friends, college etc.) without prior discussion and "
    "approval with your mentor.",

    "We take data privacy and security very seriously and to maintain confidentiality of any "
    "students, customers, clients, and companies’ data and contact details that you may get access "
    "to during your training period will be your responsibility. EZ LAB PRIVATE LIMITED operates on "
    "zero tolerance principle with regard to any breach of data security guidelines. At the "
    "completion of the training period you are expected to hand over all EZ LAB PRIVATE LIMITED "
    "work/data stored on your Personal Computer to your mentor.",

    "During the appointment period you shall not engage yourselves directly or indirectly or in any "
    "capacity in any other organization (other than your college). In the event of breach of this "
    "condition, this appointment is liable to be terminated forthwith by the company. In addition, "
    "you shall be liable to pay liquidated damages to the Company of an extent estimated by the "
    "Company.",

    "Under normal circumstances either the company or you may terminate this association by "
    "providing a notice without assigning any reason. However, the company may terminate this "
    "agreement forthwith under situations of in-disciplinary behaviors.",

    "You are expected to conduct yourself with utmost professionalism in dealing with your mentor, "
    "team members, colleagues, clients and customers and treat everyone with due respect.",

    "Honor Code is what EZ LAB PRIVATE LIMITED stands for and we expect you to imbibe it in your "
    "day-to-day actions and continuously challenge us if we are falling short of expectations on "
    "either of them.",
]


def traineeship_offer(ctx: dict) -> dict:
    """Traineeship Offer Letter (EZ, individual, trainee, offer).

    Faithful to 'Date_Offer Letter_Traineeship_Name.docx.pdf': the offer letter with its 10 terms,
    Annexure-1 (job description plus the trainee undertakings), Annexure-2 (compensation, computed
    by comp.trainee_annexure) and the Acceptance page.
    """
    who = ctx["name"]
    role = ctx["designation"]
    annexure = comp.trainee_annexure(ctx.get("annual_ctc"))

    return {
        "title": f"Traineeship Offer Letter - {who}",
        "doc_type": "offer",
        "blocks": [
            b.p("To"),
            b.p(who),
            b.h(2, f"SUBJECT: OFFER FOR THE POSITION OF {role.upper()} TRAINEE", underline=True),
            b.p(f"Dear {who},"),
            b.p(
                f"In furtherance to your application and subsequent discussions held between Us, we "
                f"are glad to Offer you the Position of **{role} Trainee** to be initially based at "
                f"Gurugram, Haryana, at the below stated Address;"
            ),
            b.p("EZ Lab Private Limited, Near HBR Chowk, Sector 62, Gurgaon, Haryana, 22413."),
            b.p("We would like to share with you the Terms & Conditions of this Offer;"),

            b.p(
                "This Offer would become Effective and Enforceable on its Acceptance by You in the "
                "manner prescribed hereinafter",
                strong_prefix="1. Effectiveness",
            ),
            b.p(
                f"You shall Report to **{ctx['manager']}, {ctx['manager_role']}** and shall perform "
                f"the functions as detailed under Annexure-1 herein.",
                strong_prefix="2. Duties & Responsibilities",
            ),
            b.p(
                "Your future growth and Compensation in the Organisation shall entirely depend on "
                "your contribution to the business success and overall Organisation performance. We "
                "follow a Work Oriented Appraisal Policy, and the Compensation Revision may be "
                "subject to a Separate Agreement/Personal Bond.",
                strong_prefix="3. Performance Evaluation & Compensation Revision",
            ),
            b.p(
                "You will be entitled for leaves with company policies and the holiday calendar. "
                "Leaves are to be taken at such time as is determined by or acceptable to EZ.",
                strong_prefix="4. Vacation",
            ),
            b.p(
                "You shall be covered under the provisions of Provident Fund Scheme, ESI Scheme and "
                "Professional Tax as applicable from time to time. All compensation, Incentives & "
                "Monetary Rewards shall be subject to Tax deduction.",
                strong_prefix="5. Statutory Coverage",
            ),
            b.p(
                "The Compensation will become Payable after completion of One Month of the Job. In "
                "Case you leave the Organisation within One Month from the Date of your Joining, you "
                "shall not be entitled to any Compensation/Remuneration for any Services whatsoever "
                "rendered to the Organisation. Your compensation details are attached in Annexure 2 "
                "herein.",
                strong_prefix="6. Compensation",
            ),
            b.p(
                "During the training period, your employment shall be subject to 15 days' notice or "
                "equivalent payment in lieu of notice from either side.",
                strong_prefix="7. Termination",
            ),
            b.p(
                "This Offer, on its Acceptance, shall be enforceable by and before the Civil "
                "Courts/Authorities at Gurugram only.",
                strong_prefix="8. Enforceability",
            ),
            b.p(
                "Background verification is a part of onboarding and is still in process. It will "
                "take 1-2 weeks to get completed, we might reconsider the offer if the results don't "
                "turn out to be positive.",
                strong_prefix="9. Subject to Confirmation",
            ),
            b.p(
                f"This Offer shall be Valid till **{ctx['validity_date']}**. In case you do accept "
                f"our offer, please convey your Acceptance within Such Period; failing which the "
                f"offer shall be considered null & void. We shall receive the following documents "
                f"within this period to constitute this Offer into a Contract;",
                strong_prefix="10. Validity",
            ),
            b.ul([
                "A. Acceptance of the Offer, as Annexed with this Offer Letter",
                "B. Proof of Resignation (Submitted or Accepted) from Current Employer, if Applicable",
            ]),
            b.p(
                f"You are requested to join us on **{ctx['start_date']}**. The training period will "
                f"span 3 months (and is extendable up to 6 months). Other formalities shall be "
                f"completed after your joining."
            ),
            b.p(
                "Congratulations! On this exciting advancement in your career that comes your way by "
                "means of this offer."
            ),
            b.p("We welcome you to EZ team."),
            b.p("Best Wishes!"),
            b.script(ctx['signatory_name']),
            b.p(f"**{ctx['signatory_name']}**"),
            b.p(ctx["signatory_title"]),
            b.p("EZ Lab Private Limited"),
            b.divider(),

            # ── Annexure-1 ────────────────────────────────────────────────────────────────
            b.h(1, "ANNEXURE - 1", underline=True),
            b.p("**THE HIGH-LEVEL JOB-DESCRIPTION IS AS BELOW:**"),
            b.ul(ctx["responsibilities"] or _TRAINEE_JD),
            *[b.p(t) for t in _TRAINEE_UNDERTAKINGS],
            b.divider(),

            # ── Annexure-2 ────────────────────────────────────────────────────────────────
            b.h(1, "ANNEXURE - 2", underline=True),
            b.p("**COMPENSATION WOULD BE AS FOLLOWS:**"),
            b.comp_custom(annexure["rows"], annexure["notes"], known=annexure["known"]),
            b.p("**NOTES:**"),
            b.p("*EFFECTIVENESS: Payable only after completion of One Month of the Job."),
            b.divider(),

            # ── Acceptance ────────────────────────────────────────────────────────────────
            b.h(1, "ACCEPTANCE", underline=True),
            b.p(
                "I have read and understood the terms & conditions and also agree that the "
                "Remuneration and other details are Confidential between the Organization and me. I "
                "undertake that there would be no breach of this Confidentiality."
            ),
            b.p(
                "I undertake that in Case of my not Joining the Organisation after Acceptance of this "
                "Offer, I shall be liable to Pay the Organisation a Sum equal to One month Total "
                "Remuneration as offered to me in this Offer Letter, as a Reimbursement of the "
                "Expenses incurred by the Organisation for Conducting My Interview as well as for the "
                "Losses caused due to my Non-Joining after Confirmation, and I would return the "
                "Original of this Letter (along with all its Annexure) without use/making any copies "
                "of the same."
            ),
            b.p("I hereby accept the offer of employment on the said terms & conditions."),
            b.p("Date: ……………………………………"),
            b.p("Place: ………………………………….."),
            b.p("Mr./Ms. ……………………………….."),
            b.p("S/D/o ………………………………….."),
            b.p("R/o …………………………………….."),
            b.p("(Signature)"),
        ],
    }


register(
    "ez_traineeship_offer",
    traineeship_offer,
    label="Traineeship Offer Letter",
    description=(
        "EZ Lab traineeship offer: 10 terms & conditions, Annexure-1 job description with the "
        "trainee undertakings, Annexure-2 compensation computed from the stipend, and Acceptance."
    ),
    entity="EZ",
    doc_type="offer",
    party_type="individual",
    contract_type="trainee",
)
