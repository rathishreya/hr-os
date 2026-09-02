"""Every onboarding mail the People team sends, as they wrote them.

The bodies here are transcribed from the People team's own template document, not paraphrased.
That matters: HR reads these before they go, and a mail that has been quietly reworded is a mail
they have to re-read every time. Where the document gives two versions of the same mail for
in-campus and remote joiners, both are here and the joiner's own mode picks one.

A template names what it is FOR: a checklist step, or one of the mails a session sends. Nothing
here decides when to send; that is the step's due date (services/onboarding/steps.py) or the
session's invite rule (services/onboarding/sessions.py).

Merge fields keep the document's own {{Name}} spelling. Anything the system cannot fill is left
standing as {{Session Time}} rather than blanked, so HR can see what is still theirs to type
before they press send.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

CAMPUS = "campus"
REMOTE = "remote"
BOTH = "both"

#: Who the mail goes to. The address is resolved at send time, not stored here.
CANDIDATE = "candidate"
MANAGER = "manager"
HOD = "hod"
TEAM = "team"


@dataclass(frozen=True)
class MailTemplate:
    key: str
    name: str
    subject: str
    body: str
    mode: str = BOTH
    to: str = CANDIDATE
    cc: tuple[str, ...] = ()
    #: The checklist step this mail belongs to, when it is a per-candidate mail.
    step_key: str | None = None
    #: The session and the part it plays, when it is a session mail.
    session_key: str | None = None
    session_role: str | None = None
    note: str = ""


# ── the mails on a candidate's checklist ────────────────────────────────────────────────────

WELCOME_CAMPUS = """Dear {{Name}},

Congratulations and a warm welcome to Team EZ! We're thrilled to have you join us on {{Date of Joining}} and are excited to begin this journey together.

To help you get started smoothly, here are your Day 1 details

- Reporting Time: 10:00 AM
- Office Address: EZ Lab Pvt. Ltd., 5th Floor, Imperia Mindspace, Golf Course Ext Rd, behind Aipl Business Club, Sector 62, Gurugram, Haryana - 122098
- Google Maps Link
- Point of Contact:
  Sweta: 7987380766
  Landline: 9311786723
- Dress Code: Smart Business Casuals
- On Arrival: Please check in at the reception with the Facilities Team.

What your Day 1 will include:
- Orientation
- IT asset handover
- Team introductions

To support you during your initial weeks, {{Go to Person}} from the {{Team}} will be your go-to person. Feel free to reach out for any guidance or help settling in.

Get to know you better:
We'd love to understand your work style and personality to support you better. Please complete the MBTI personality test and share your results using the links below:
Take the Test
Submit Your MBTI Results

Your feedback matters:
Lastly, your experience helps us improve. Please take 2 minutes to share your feedback on the hiring process:
Hiring Feedback Form

Reporting Manager:
Looping in {{Reporting Manager}} ({{Reporting Manager Email}}), your direct reporting manager, feel free to connect for any role-related queries.

Department Head:
Looping in {{Department Head}} ({{Department Head Email}}), your Department Head.

We're truly excited to have you on board and can't wait to see the impact you'll make at EZ.

Once again, welcome to Team EZ, {{Name}}!"""

WELCOME_REMOTE = """Dear {{Name}},

Congratulations and a warm welcome to Team EZ! We're thrilled to have you join us in a remote role starting {{Date of Joining}}.

To ensure a smooth start, here are your Day 1 details:

- Joining Time: 10:00 AM
- Mode: Remote (Google Meet)
- Session Details: {{Meeting Link}}
- Contact Person:
  Sweta | +91 79873 80766
  Landline: 9311786723
- Support Email: hr@ez.works
- Dress Code (for virtual meets): Business Casual

Your Day 1 schedule will include:
- Virtual Orientation
- IT Access Setup
- Team Introductions

We'd love to understand your work preferences better. Please take a moment to complete the MBTI personality test and share your results with us:
Take the Test
Submit Your MBTI Results

Lastly, your feedback helps us grow. Please take 2 minutes to share your experience with our hiring process.
Hiring Feedback Form

Reporting Manager:
Looping in {{Reporting Manager}} ({{Reporting Manager Email}}), your direct reporting manager, feel free to connect for any role-related queries.

Department Head:
Looping in {{Department Head}} ({{Department Head Email}}), your Department Head.

We're so excited to have you on board. Let's make great things happen together, even from afar!

Once again, welcome to Team EZ, {{Name}}!"""

CULTURE = """Dear {{Name}},

As you prepare to join EZ, we'd like to give you a quick glimpse into the culture and experiences that shape life here.

EZ Fridays
EZ Fridays are a cornerstone of our culture, designed to keep us connected, informed, and growing together. Over the past year, they've included:
* People Updates
* EZ Honor Code & Delivery Mindset sessions
* Learning forums (Sales Deck, How to Pitch, POSH & Anti-Harassment)
* Wellbeing & engagement initiatives (FINWIN, Pulse Surveys, milestone celebrations)
* Culture-led conversations (Espresso with EZ, Sessions with Joy, Brand EZ, and festive series)
All sessions are thoughtfully planned for both in-office and remote teams.

VIBE Committee
To drive engagement going forward, we've introduced the VIBE Committee, co-led by Aman and Harsh, focused on building meaningful people experiences across EZ.

I Power EZ
At EZ, we believe everyone has a unique way of contributing beyond their everyday role. Through I Power EZ, we celebrate the different ways our people add value, whether through their hobbies and interests, hosting or facilitating sessions, planning and executing workshops, sharing knowledge, or taking the lead on initiatives.
As you become a part of EZ, we'd love to hear about how you I Power EZ and the interests, strengths, and ideas you bring with you.

Life at EZ
At EZ, growth, communication, and ownership matter. Your ideas are valued, and your contributions help shape our journey.

We're excited to welcome you and look forward to growing together."""

DIVE_DEEPER_CAMPUS = """Dear {{Name}},

We hope this message finds you in great spirits!

It's with genuine excitement that we welcome you to EZ. We're delighted to have you join us and look forward to starting this new chapter together.

At EZ, we believe every individual brings something meaningful to the table. With your skills and enthusiasm, we're confident you'll be a great addition to our growing team.

EZ Culture: How We Work Together

Purpose-Led & Impact-Driven
Our work is guided by ownership, accountability, and a strong focus on outcomes. We believe in moving fast while delivering meaningful value.

Collaboration at the Core
Teamwork fuels everything we do. We value open communication, diverse perspectives, and shared problem-solving.

Inclusive & Respectful Workplace
EZ is a place where individuality is respected and every voice matters. We're committed to fairness, trust, and psychological safety.

A New Space, A Professional Vibe
With our recent move to a new office, we've embraced a more formal and professional work environment, while keeping collaboration and approachability at the heart of our culture.

Your First Day at EZ

Orientation
Your journey begins with an orientation to help you understand EZ's values, structure, and ways of working.

Your Go-To Buddy
A buddy will support you through your initial days and help you settle in smoothly.

Welcome Coffee
We'll wrap up with a relaxed welcome coffee, an easy way to meet your team and start building connections.

Dive Deeper into EZ (Before You Join)
To get familiar with our work and mindset, we encourage you to explore:
EZ Services - An overview of what we do
Faster Than the Fastest - How speed and innovation shape our approach
Consistently High Quality - Our commitment to excellence
You can also watch our Corporate Film for a quick snapshot of our journey and ethos.

We're excitedly counting down the days to welcome you on {{Date of Joining}}!

Key Information for Day One
Reporting Time: 10:00 AM
Location: EZ Lab Pvt. Ltd., 5th Floor, Imperia Mindspace, Golf Course Ext Rd, behind AIPL Business Club, Sector 62, Gurugram, Haryana
Google Maps Link
Point of Contact: Sweta - 7987380766
Landline: 9311786723
Dress Code: Business Casual

If you have any questions before your joining date, feel free to reach out. We're excited to welcome you to Team EZ."""

DIVE_DEEPER_REMOTE = DIVE_DEEPER_CAMPUS.replace(
    """Reporting Time: 10:00 AM
Location: EZ Lab Pvt. Ltd., 5th Floor, Imperia Mindspace, Golf Course Ext Rd, behind AIPL Business Club, Sector 62, Gurugram, Haryana
Google Maps Link""",
    """Reporting Time: 10:00 AM
Mode: Remote
Session Details: {{Meeting Link}}""")

MANAGER_ONBOARDING = """Hello {{Reporting Manager}},

Hope this email finds you well.

We are writing to inform you that a team member from your team has been onboarded with EZ on {{Date of Joining}}. The details are as follows:

1. Name: {{Name}}
   Designation: {{Designation}}
   Team: {{Team}}
   Department: {{Department}}

On the first day, they joined at 10:00 AM for the orientation session. During the orientation, we covered an overview of the organization, people, culture, services, professional development framework, and branding guidelines. Over the next three months, they will also attend sessions on Code of Ethics, Information Security, Branding, Delivery Mindset, and Sales Deck to help them gain a deeper understanding of EZ.

All key policies have been shared from our end. In case any additional assets are required (such as mobile phones, SIM cards, or specific subscriptions), kindly coordinate directly with the IT Team.

Please let us know if there are any specific trainings, courses, or rotational programs that need to be planned so we can schedule them accordingly. We also have a list of online learning modules available (Gmail Productivity, Communication, Advanced Excel, PowerPoint, etc.). If you'd like these to be assigned, do let us know, and we'll share the details.

We request you to please ensure that the growth trajectory and role expectations are clearly explained, and that the new joiners are introduced to their team within the first week.

If there is anything else you would like to add to enhance their onboarding journey, please feel free to reach out."""

PPR_EXPECTATIONS = """Hi {{Reporting Manager}},

As a reminder, please ensure that the expectations for {{Name}} are clearly defined and kept updated in the PPR module in ERP.

We also request you to take some time to walk the individual through their role expectations, key responsibilities, growth trajectory, and performance expectations so they have clarity from the beginning.

Keeping these expectations updated and clearly communicated will help ensure alignment between the manager and the individual and provide a clear direction for their growth and performance.

Thank you for your support in making the onboarding journey smoother and more structured."""

_POLICY_SIGNATURE = """Email Signature Update (Mandatory)

Kindly update your email signature in the following format:

Best Regards,
Employee Name
Employee Designation - Employee Team, Department
Mob./WhatsApp: +91 "Employee Phone Number"

A short tutorial video is attached to guide you through the signature update process. Please refer to it if needed.

Link for tutorial video

Note: Update your signature as per the below sample details:
Designation: {{Designation}}
Team: {{Team}}
Department: {{Department}}

Calendar Invite Format to Follow at EZ:
<Meeting/Skype/Discussion> re: "Descriptive subject" w person 1, person 2, person 3
Ensure correct duration and add location or dialing instructions (Google Meet Link, Zoom, Skype ID, etc.).

If you have any questions, feel free to reach out.

Wishing you a great start at EZ!"""

POLICY_REMOTE = """Hi {{Name}},

Welcome aboard!

We're excited to have you join EZ and look forward to an amazing journey ahead.

To help you get started smoothly, this email contains access to all key company policies, programs, and important resources. Please take some time to carefully go through the Frequently Asked Questions (FAQ) document, as it covers everything you need to know.

Access the FAQ here:
https://docs.google.com/document/d/1f5NKAr3gf8tS5Wd3E1UWrmodWFPOQbSu1d0WIDxPN9E/edit?usp=sharing

Through the FAQ, you can access details regarding:
- Leave System & Policy
- EZ Brand Kit
- Performance Program
- Increment & Promotion Cycle
- Rewards & Recognition Policy
- Calendar Invite Format to be followed at EZ

""" + _POLICY_SIGNATURE

POLICY_CAMPUS = """Hi {{Name}},

Welcome aboard!

We're glad to have you on board and look forward to your contributions as part of the team.

To ensure a smooth onboarding experience, please go through the Frequently Asked Questions (FAQ) document shared below. It includes important policies, processes, and guidelines you'll need to be familiar with.

Access the FAQ here:
https://docs.google.com/document/d/1f5NKAr3gf8tS5Wd3E1UWrmodWFPOQbSu1d0WIDxPN9E/edit?usp=sharing

The FAQ provides access to:
- Leave System & Policy
- EZ Brand Kit
- Health Insurance Form & Policy
- Performance Program
- Increment & Promotion Cycle
- Calendar Invite Format to be followed at EZ

""" + _POLICY_SIGNATURE

ISO_COURSE = """Hi {{Name}},

The login credentials for the Udemy course, "Cyber Security Guidelines for Organizational Users" are as follows:

Link to Udemy: https://www.udemy.com/
Email ID: people@arabeasy.com

Kindly use these details to access the course. We appreciate your commitment to completing the course. Upon successful completion, please inform us within the same email chain."""

ISO_QUIZ = """Hi {{Name}},

Congratulations on completing the ISO course. Here is the link for the small quiz for the same. The deadline to complete this test is 24 hours.

Link to quiz: https://forms.gle/XbJ4rAPNn8MbdsMD8

Feel free to reach out in case of any questions."""

INDUCTION_FEEDBACK = """Hi {{Name}},

We hope you're settling in well at EZ! Your experience and feedback are very important to us, and we'd love to hear your thoughts on our induction and onboarding process.

Please take a few minutes to share your feedback by clicking the link below or scanning the QR code:

EZ Induction & Onboarding Feedback Form

Your inputs will help us make the onboarding experience even better for everyone.

Thank you for your time and valuable feedback!"""

CERTIFICATION_FORM = """Hi {{Name}},

We hope you're settling in well at EZ.

Please take a few minutes to fill in your certification details using the form below:

Certification Details Form - https://forms.gle/GeJ7JZP7B2d1hkeX6

Your inputs will help us keep your record complete ahead of your 100-day certification.

Thank you for your time."""

TRAINING_FEEDBACK = """Hi {{Name}},

As part of our continuous effort to improve learning and development initiatives, we request you to kindly share your feedback on the training sessions and your overall journey in the organization so far.

Your inputs are extremely valuable in helping us understand what has worked well and where we can improve to make your learning experience more impactful.

Please take a few minutes to fill out the feedback form using the link below:

Training Feedback Form

We encourage you to submit your responses as soon as possible.

Thank you for your time and honest feedback."""

MANAGER_FEEDBACK = """Hi {{Reporting Manager}},

I hope this message finds you well!

As part of our ongoing efforts to support and enhance employee development, we are seeking your valuable insights on the journey of your team members at EZ. Your feedback will play a crucial role in understanding their experiences and identifying areas for growth.

To facilitate this process, we have created a brief survey that we kindly ask you to complete for each of your direct reports. The survey can be accessed via the following link:

https://www.surveymonkey.com/r/79C599G

Please provide your feedback based on your observations and interactions with each individual.

We would appreciate it if you could confirm once the same is completed from your end."""

PERFORMANCE_BUDDY = """Hi {{Name}},

Your session with your performance buddy is scheduled for {{Session Date}}, {{Session Time}}.

This is an informal conversation to help you settle in, talk through how the role is going, and ask anything you would rather not raise in a wider forum.

Please confirm your availability by replying to this email.

Looking forward to it."""


# ── session mails ───────────────────────────────────────────────────────────────────────────

BRAND_EZ_CAMPUS = """Hi {{Name}},

Hope you're doing great!

We're excited to invite all our on-campus team members to the upcoming Brand EZ session, designed to help you connect with the essence of the EZ brand, elevate your professional presence, and engage in a meaningful learning experience.

Why this session matters
At EZ, we believe that culture, collaboration, and great ideas thrive when we come together. This session will help strengthen your connection to the EZ brand and empower you to represent it with confidence and clarity.

What to expect:
An engaging walkthrough of the Brand EZ story
Practical takeaways on building your personal brand
An interactive hands-on segment to enhance your professional presence
A fun surprise to keep the session lively and energizing!

Session Details:
Date: {{Week Day}}, {{Session Date}}
Time: {{Session Time}}
Venue: Breakout Area

What you'll need:
Just bring your enthusiasm and curiosity, we'll take care of everything else!

We look forward to having you join us and experience the EZ brand journey together.

See you there!"""

BRAND_EZ_REMOTE = """Hi {{Name}},

Hope you're doing great!

We're excited to invite you to a dedicated Brand EZ session specially curated for our remote team members. This session is designed to help you feel more connected, inspired, and aligned with the EZ brand experience, no matter where you are working from.

Why this session matters
At EZ, we believe that ideas, culture, and impact flow from every corner, whether you're in the office or working remotely. This session aims to strengthen that connection and ensure every remote EZ-mate feels included, valued, and empowered.

What to expect:
A thoughtful walkthrough of the Brand EZ story and what it means for you
Practical insights on strengthening your personal brand in a virtual-first environment
An interactive segment to boost your professional presence
And of course, a little something fun to keep the energy high!

Session Details:
Date: {{Week Day}}, {{Session Date}}
Time: {{Session Time}}
Mode: Online

Join the Session
Google Meet link: {{Meeting Link}}

What you'll need:
Just your laptop, a stable connection, and your curious self, we'll take care of the rest.

Your voice and participation truly matter. We're looking forward to connecting with you the EZ way!

See you there!"""

BRAND_EZ_FEEDBACK = """Hi {{Name}},

Hope you enjoyed today's Brand EZ session and found it insightful.

We would love to hear your feedback, as it helps us improve and curate even better experiences in the future. If you haven't filled it out yet, please take a moment to complete the feedback form below:

Share Feedback:
https://www.surveymonkey.com/r/Z3S8FL8

Additionally, we are compiling participant profiles for future collaborations and engagements. Kindly add your LinkedIn/Profile link in the Google Sheet shared below:

https://docs.google.com/spreadsheets/d/1bhMJS50STUOua0qS9shGLqdDm53h_f0gYrECmfqYo6U/edit?usp=sharing

Requesting you to kindly update your details in the sheet and share confirmation over email by EOD, {{Deadline}}.

We truly appreciate your time, participation, and valuable inputs.

Thank you for your support."""

HONOR_CODE_CAMPUS = """Hi {{Name}},

Hope you're doing well!

Let's move on to the next step of your orientation journey at EZ. At EZ, we conduct our business with the highest standards of professionalism and fairness. To uphold this, we follow the EZ Honor Code, a framework built on six core, non-negotiable principles that define our culture.

You are invited to attend a session where we'll walk you through the EZ Honor Code and its importance in how we work and collaborate.

Session Details
Date: {{Week Day}}, {{Session Date}}
Time: {{Session Time}}
Venue: Breakout Area

A calendar invite has already been shared with you.

Your participation is mandatory, and we look forward to seeing you there."""

HONOR_CODE_REMOTE = HONOR_CODE_CAMPUS.replace(
    "Venue: Breakout Area", "Meeting Link: {{Meeting Link}}")

HONOR_CODE_FEEDBACK = """Hi {{Name}},

This is a gentle reminder for participants who attended the EZ Honor Code Session held on {{Session Date}}.

If you haven't done so already, please complete the following mandatory actions:

1. Submit Your Session Feedback
Kindly take a few minutes to complete the feedback form using the link below:
https://www.surveymonkey.com/r/5MPTY8W
Your feedback helps us improve the quality and effectiveness of our future learning sessions.

2. Submit the Signed EZ Honor Code
EZ Honor Code Doc Link:
https://drive.google.com/file/d/1iUcehOOBGNULGwD0_7BEvNU95NegiCRU/view?usp=sharing
Please review the EZ Honor Code document, sign it, and share the signed copy by replying to this email.

If you have already completed both the feedback form and submitted the signed document, please update through this email.

Should you have any questions or require any clarification, feel free to reach out."""

SALES_DECK_CAMPUS = """Hi {{Name}},

Hope you're doing well.

We're pleased to invite you to our upcoming EZ Sales Deck Session scheduled for {{Week Day}}, {{Session Date}} at {{Session Time}} in the Breakout Area. This interactive session will offer valuable insights into market trends, product strengths, and sales strategies that align with our growth roadmap.

Agenda Highlights:
Project Workflow: How projects are received, delegated, and delivered to clients.
Offerings Overview: Quick rundown of key product/service features and benefits.
Quiz: Short check to assess understanding of offerings and sales deck.
Q&A: Open forum to clarify doubts.

Note: Attendance is mandatory.

Should you have any questions, feel free to reach out.

Looking forward to your active participation!"""

SALES_DECK_REMOTE = """Hi {{Name}},

Hope you're doing well.

We're pleased to invite you to our upcoming EZ Sales Deck Session scheduled for {{Week Day}}, {{Session Date}} at {{Session Time}}.

This virtual session has been designed to help you understand our market positioning, core offerings, and key sales enablers that support our growth roadmap.

Agenda Highlights:
Project Workflow: How projects are received, delegated, and delivered to clients in a structured manner.
Offerings Overview: Quick rundown of our key product/service features and benefits.
Quiz: A short interactive quiz to assess understanding of our offerings and the sales deck.
Q&A: Open forum for clarifying any questions.

Note: Attendance is mandatory for all participants.
Meeting Link: {{Meeting Link}}

If you have any questions, feel free to reach out.

Looking forward to your active participation!"""

SALES_DECK_FEEDBACK = """Hi {{Name}},

Hope you're doing well.

This is regarding the Sales Deck Session conducted on {{Week Day}}, {{Session Date}} at {{Session Time}}. It has come to our attention that several participants faced issues while accessing or submitting the feedback form shared earlier.

To ensure we capture your valuable insights, we request you to kindly fill out the feedback form again using the link below:
Sales Deck Feedback Form

Your feedback is important for us to improve future sessions and make them more engaging and relevant. We appreciate your time and support in completing the form at the earliest."""

DELIVERY_MINDSET_CAMPUS = """Hi {{Name}},

We're pleased to invite you to the upcoming Delivery Mindset session scheduled for {{Session Date}}.

This session will focus on the core pillars of Delivery Mindset through interactive discussions and activities designed to help us strengthen how we plan, execute, and deliver our projects with excellence.

As part of our continued learning journey, Delivery Mindset is now included in the PPR module and will serve as one of the three complementary approaches for reviews. Your participation is key to embedding this mindset into our daily work culture.

Date: {{Session Date}}
Time: {{Session Time}}
Venue: Breakout Area

Please ensure you join on time and come prepared for an engaging and collaborative session.

Let's continue to build a strong culture of accountability, ownership, and delivery excellence together!"""

DELIVERY_MINDSET_REMOTE = DELIVERY_MINDSET_CAMPUS.replace(
    "Venue: Breakout Area", "Mode: Online\nMeeting Link: {{Meeting Link}}")

DELIVERY_MINDSET_FEEDBACK = """Hi {{Name}},

Thank you for attending the Delivery Mindset Session on {{Week Day}}, {{Session Date}}. We hope you found the session informative and valuable.

To help us enhance future sessions, we request you to please share your feedback using the link below (only for session attendees):

Feedback Form: https://www.surveymonkey.com/r/5MPTY8W

We appreciate your time and inputs."""

HUNDRED_DAYS_CAMPUS = """Hi {{Name}},

Congratulations on completing 100 days at EZ!

This marks an important milestone in your journey with us, and we'd love to take a moment to recognize your contributions and commitment so far.

You are invited to a small certification ceremony to celebrate this achievement:

Date: {{Session Date}}
Time: {{Session Time}}
Venue: Breakout

Let's come together to acknowledge your journey and cheer you on for the many milestones ahead.

Looking forward to celebrating with you!"""

HUNDRED_DAYS_REMOTE = HUNDRED_DAYS_CAMPUS.replace(
    "Venue: Breakout", "Mode: Online\nMeeting Link: {{Meeting Link}}")

JOY_INVITE = """Hi {{Name}},

Curious to know how EZ was started, how we've evolved, and the milestones along the way? Then this is the session you shouldn't miss.

About half a decade ago, #EZ was just an idea envisioned by our CEO, Joy Sharma, and we'd love for you to hear the story directly from him.

When & Where
Date: {{Session Date}}
Time: {{Session Time}}
Venue: Breakout Area

This is an essential session for everyone to attend. If you have any questions about EZ, please bring them along.

Looking forward to seeing you there!"""

JOY_FEEDBACK = """Hi {{Name}},

Thank you for attending the Session with Joy on {{Week Day}}, {{Session Date}}. We hope it was informative and valuable.

To help us improve future sessions, please take a moment to share your feedback using the link below:

Feedback Form: https://www.surveymonkey.com/r/5MPTY8W

We appreciate your time and inputs."""

ANTI_HARASSMENT_INVITE = """Hi All,

We are pleased to invite you to this session which is designed to help us foster a respectful, inclusive, and safe workplace environment. It will cover key aspects of workplace conduct, awareness, and the steps we can all take to prevent and address harassment effectively.

Session Details: Safe Workplace Practices: Anti Harassment Awareness Session
Date: {{Session Date}}
Time: {{Session Time}}
Session Link: {{Meeting Link}}

Your presence and participation will play a vital role in making this initiative meaningful. We look forward to seeing you there."""

ANTI_HARASSMENT_FACILITATOR = """Hi Team,

I hope this email finds you well.

As part of our commitment to fostering a safe, respectful, and inclusive workplace, we are organizing a mandatory session on Safe Workplace Practices: Anti-Harassment Awareness. This annual session is designed to build awareness around workplace harassment, inappropriate behaviour, professional boundaries, respectful communication, and the role each of us plays in creating a safe and comfortable work environment. The session will also help individuals understand how to identify and prevent instances of harassment, respond appropriately to concerns, and be aware of the channels available for raising concerns or seeking support.

The session will be led by {{Facilitator}}, {{Profile Details}}

{{Poster Link}}

Please note that attendance is mandatory.

If you have any questions or require further information regarding the session, please feel free to contact the People Team.

We look forward to your active participation in creating a workplace where everyone feels safe, respected, and valued."""

ANTI_HARASSMENT_FEEDBACK = """Hi {{Name}},

Thank you for joining today's Safe Workplace Practices: Anti-Harassment Awareness Session. We hope the session was insightful and provided meaningful takeaways.

Your feedback plays a vital role in helping us evaluate the effectiveness of such programs and enhance future sessions. We kindly request you to take a few minutes to share your inputs through the link below:

Feedback Form: https://www.surveymonkey.com/r/P2MMMCQ

Please submit your responses by {{Deadline}}.

For your reference, here is the link to EZ's Professional Boundaries and Anti-Harassment Policy:
View Policy

We truly value your time, feedback, and commitment to fostering a safe, respectful, and inclusive workplace."""

POSH_AWARENESS_INVITE = """Hi {{Name}},

I hope this email finds you well.

As part of our commitment to fostering a safe, respectful, and inclusive workplace, we are organizing a mandatory session on the Prevention of Sexual Harassment (POSH) Awareness. This session is held annually to ensure that every member of our organization is well-informed about the Prevention of Sexual Harassment at Workplace Act (POSH Act) and the policies and procedures we have in place to maintain a safe and comfortable environment.

The session will be led by {{Facilitator}}, {{Profile Details}}

{{Poster Link}}

Please note that attendance is mandatory.

If you have any questions or require further information regarding this session, please feel free to contact the People team."""

POSH_AWARENESS_FEEDBACK = """Hi {{Name}},

Thank you for participating in today's POSH Awareness and Sensitisation Program. We hope you found the session both insightful and engaging.

Your feedback is invaluable in helping us assess the effectiveness of the program and improve future sessions. We request you to take a few minutes to share your thoughts through the feedback form below:

Feedback Link: Click Here

Kindly submit your responses by {{Deadline}}.

For your reference, please find the link to our POSH Policy below:
POSH Policy Document

We truly appreciate your time, input, and commitment towards fostering a safe and respectful workplace."""

POSH_IC_INVITE = """Hi {{Name}},

Hope you are doing well.

Creating a safe, respectful, and inclusive workplace is a shared responsibility. As part of this ongoing commitment, we are organizing a POSH (Prevention of Sexual Harassment) Training on {{Week Day}}, {{Session Date}}.

This program is designed for Internal Committee members, Team Leads, and HRs, and aims to strengthen awareness of the POSH Act, 2013, while reinforcing the role each of us plays in maintaining a harassment-free work environment.

Training Details at a Glance
Total Duration: 2.5 hours ({{Session Time}})
Venue: Breakout Area, EZ

Part 1 | Awareness Session: Open to team leads, HRs, and Internal Committee members. Focus areas include POSH awareness, roles, responsibilities, and expectations from people managers.

Part 2 | IC Deep-Dive Session: Exclusively for Internal Committee members and HRs, covering mock inquiries, case study discussions and interactive Q&A.

Key Learning Outcomes
Gender sensitivity and emotional awareness at work
Core provisions and shared responsibilities under the POSH Act
Identifying inappropriate workplace behavior
Clear understanding of reporting mechanisms
Investigation process, timelines, and compliance requirements
Building and sustaining a respectful workplace culture

Training Methodology
Real-life case studies and practical scenarios
Problem-centered learning and group discussions
Mock investigations and hands-on exercises
Audio-visual aids, questionnaires, and quizzes

About the Facilitator
The session will be conducted by {{Facilitator}}, {{Profile Details}}

Please note: This training is mandatory. We request all relevant participants to mark their calendars and ensure attendance.

Looking forward to an engaging and insightful session together."""

ISO_AI_INVITE = """Hi Team,

Security. Compliance. AI. Productivity.
Get ready for an engaging and interactive session designed to help you work smarter and safer!

As part of our ongoing compliance and awareness initiatives, we are organizing an informative session on ISO Awareness & AI Tools Usage, combining workplace security best practices with practical tips.

Session Details
Date: {{Session Date}}
Time: {{Session Time}}
Venue: Workspace

What You'll Explore
ISO Information Security Awareness
Responsibility within ISO 27001 Environment
Workplace Security & Compliance Practices
Risk Handling & Audit Readiness
AI Tools Usage & Best Practices
Interactive Activities & Real-World Use Cases

Whether it's understanding secure workplace practices or learning how to use AI tools in a secure way, this session is packed with practical insights and engaging discussions.

Don't miss out, calendar invites have been shared. Looking forward to seeing everyone there on time!"""

JOY_2_INVITE = """Hi {{Name}},

We're delighted to invite you to an exclusive and engaging conversation with our CEO, Mr. Joy Sharma, as he is hosting "Session with Joy 2.0" on {{Week Day}}, {{Session Date}}.

This session is specially curated for team members who have completed one year or more with us. It's a wonderful opportunity to pause, reflect on our shared journey, exchange experiences, and explore how we can continue to grow together. Your voice matters, and we're excited to hear your thoughts and perspectives.

Session Details:
Date: {{Session Date}}
Time: {{Session Time}}
Location: Breakout Area

As always, this forum will be a space for open, transparent, and candid conversations, no filters, just honest dialogue.

We're looking forward to your active participation in making this session enriching and impactful."""

JOY_2_FEEDBACK = """Dear Team,

Thank you for attending the Session with Joy 2.0 held on {{Week Day}}, {{Session Date}}. We hope you found the session valuable and insightful.

Your feedback is extremely important to us as it helps us evaluate the effectiveness of the program and improve future sessions. We request you to kindly take a few minutes to share your feedback through the form below:

Feedback Form Link: https://www.surveymonkey.com/r/DG63X7X

We appreciate your time and inputs, and we look forward to incorporating your suggestions into upcoming initiatives."""

ROTATIONAL_INVITE = """Hi {{Name}},

Step Into Another Team's Shoes, the Rotational Induction Program is back!

Ever wondered what happens behind the scenes in other departments at EZ? Curious about how different teams contribute to our success?

Here's your chance to explore, learn, and connect across functions through our Rotational Induction Program! Get a first-hand experience of how different departments operate and collaborate.

Program Schedule
Delivery Department
Branding & Marketing Department
Technology Department
Sales Department

Why Participate?
Gain exposure to different functions
Understand how teams work together
Learn beyond your day-to-day role
Build cross-functional connections

How to Register?
Fill out the registration form here:
https://www.surveymonkey.com/r/9GL2WKN

Last Date to Register: {{Deadline}}

Before You Register
Please obtain approval from your HOD/Manager.
Slots are limited and will be allotted on a first-come, first-served basis.
Schedule will be shared with registered participants.

Got questions? Feel free to reach out to the People Team.

Don't miss this opportunity to broaden your perspective and discover what makes EZ tick!

See you at the program!"""

PULSE_CAMPUS = """Hi {{Name}},

I hope you're doing well!

It's time for our EZ Pulse Survey, our biannual check-in to understand how you're feeling, what's working well, and where we can improve. Your honest feedback plays a direct role in shaping our culture, engagement, and overall workplace experience at EZ.

Survey Details (Team-wise Slots | {{Session Date}})

Slot 1  SWAT, Delivery                       Breakout Area   4:00 PM - 4:30 PM
Slot 2  Experts, Delivery                    Breakout Area   4:30 PM - 5:00 PM
Slot 3  Technology                           Breakout Area   5:00 PM - 5:30 PM
Slot 4  People, Sales, Branding & Marketing,
        Admin, CEO's Office, COO's Office    Breakout Area   5:30 PM - 6:00 PM

Please carry your laptop or mobile.
Participation is mandatory, kindly ensure availability in your assigned slot.

Your responses are completely confidential, and every voice truly matters. Let's use this opportunity to build a stronger EZ together.

Looking forward to your active participation."""

PULSE_REMOTE = """Hi {{Name}},

I hope you're doing well!

It's time for our EZ Pulse Survey, our biannual check-in to understand how you're feeling, what's working well, and where we can improve. Your honest feedback plays a direct role in shaping our culture, engagement, and overall workplace experience at EZ.

Survey Details
Date & Time: {{Session Date}}, {{Session Time}}
Google Meet Link: {{Meeting Link}}

Participation is mandatory, kindly ensure availability in your assigned slot.

Your responses are completely confidential, and every voice truly matters. Let's use this opportunity to build a stronger EZ together.

Looking forward to your active participation."""

PULSE_NON_ATTENDEES = """Hi {{Name}},

We noticed that you were unable to attend the Pulse Survey Session held on {{Week Day}}, {{Session Date}}. Kindly share the reason for your absence at the earliest.

Please note that individuals who neither attended the session nor provided any communication will be marked half day absent for the day.

In case you were unable to attend, you are required to complete the Pulse Survey using the link below by {{Deadline}}:
https://www.surveymonkey.com/r/396FMF6

After submission, please share a screenshot of the submission confirmation page for our records.

Your prompt action on this is mandatory and appreciated."""

PULSE_FOLLOWUP_CAMPUS = """Hi {{Name}},

Hope this message finds you well.

As you may recall, a Pulse Survey was conducted on {{Survey Date}}. This survey provided a quick and confidential way for you to share your thoughts, opinions, and suggestions about your experience at EZ.

In our ongoing effort to foster a culture of open communication and continuous improvement, we are pleased to announce a follow-up session on {{Session Date}} at {{Session Time}}. During this session, we will provide updates on the survey, share insights into the feedback received, and communicate the next steps based on the findings.

Your voice matters, and this session will help us collectively understand the insights and actions ahead.

Kindly ensure your presence for the session, as it is mandatory to attend.

Feel free to reach out to us if you have any questions."""

PULSE_FOLLOWUP_REMOTE = PULSE_FOLLOWUP_CAMPUS.replace(
    "Your voice matters, and this session will help us collectively understand the insights and actions ahead.",
    "Your participation will help ensure that everyone stays aligned on the insights and actions ahead.")

PULSE_FOLLOWUP_NON_ATTENDEES = """Hi {{Name}},

We noticed that you were unable to attend the Pulse Survey Follow-up Session on {{Week Day}}, {{Session Date}}. Kindly share the reason for your absence at the earliest.

Please note, those who neither attended the session nor provided a response will be marked absent for the day.

Looking forward to your prompt response."""


TEMPLATES: list[MailTemplate] = [
    # ── checklist mails ─────────────────────────────────────────────────────────────────────
    MailTemplate("welcome_campus", "Welcome to EZ (in campus)", "Welcome to EZ | {{Name}}!",
                 WELCOME_CAMPUS, mode=CAMPUS, step_key="welcome_mail", cc=(MANAGER, HOD)),
    MailTemplate("welcome_remote", "Welcome to EZ (remote)", "Welcome to EZ | {{Name}}!",
                 WELCOME_REMOTE, mode=REMOTE, step_key="welcome_mail", cc=(MANAGER, HOD)),
    MailTemplate("culture", "Life & Culture at EZ", "Life & Culture at EZ | {{Name}}!",
                 CULTURE, step_key="culture_mail"),
    MailTemplate("dive_deeper_campus", "Dive Deeper into EZ (in campus)",
                 "{{Name}} | Dive Deeper into EZ: Welcome to the Exciting Journey!",
                 DIVE_DEEPER_CAMPUS, mode=CAMPUS, step_key="first_day_mail"),
    MailTemplate("dive_deeper_remote", "Dive Deeper into EZ (remote)",
                 "{{Name}} | Dive Deeper into EZ: Welcome to the Exciting Journey!",
                 DIVE_DEEPER_REMOTE, mode=REMOTE, step_key="first_day_mail"),
    MailTemplate("manager_onboarding", "Onboarding note to the manager", "Onboarding | {{Name}}",
                 MANAGER_ONBOARDING, to=MANAGER, cc=(HOD,), step_key="hod_mail"),
    MailTemplate("ppr_expectations", "PPR expectations reminder to the manager",
                 "Reminder: Update Expectations in PPR Module | {{Name}}",
                 PPR_EXPECTATIONS, to=MANAGER, step_key="manager_expectations_mail"),
    MailTemplate("policy_campus", "Policies & FAQ (in campus)",
                 "FAQ: Policies & Important Links | {{Name}}", POLICY_CAMPUS, mode=CAMPUS,
                 step_key="policy_faq_mail"),
    MailTemplate("policy_remote", "Policies & FAQ (remote)",
                 "FAQ: Policies & Important Links | {{Name}}", POLICY_REMOTE, mode=REMOTE,
                 step_key="policy_faq_mail"),
    MailTemplate("iso_course", "ISO course credentials", "ISO Course | {{Name}}",
                 ISO_COURSE, step_key="iso_course"),
    MailTemplate("iso_quiz", "ISO quiz", "ISO Quiz | {{Name}}", ISO_QUIZ, step_key="iso_course"),
    MailTemplate("induction_feedback", "Induction & onboarding feedback",
                 "Share Your Feedback on EZ's Induction & Onboarding", INDUCTION_FEEDBACK,
                 step_key="induction_feedback"),
    MailTemplate("certification_form", "Certification details form",
                 "Certification Details | {{Name}}", CERTIFICATION_FORM,
                 step_key="certification_form_mail",
                 note="The certification form link, split out of the induction feedback mail "
                      "because the checklist sends it thirty working days later."),
    MailTemplate("training_feedback", "Training feedback form",
                 "Share Your Feedback on Training Journey at EZ | {{Name}}", TRAINING_FEEDBACK,
                 step_key="training_manager_feedback"),
    MailTemplate("manager_feedback", "Manager's feedback form",
                 "Feedback Request for Your Team Members | {{Name}}", MANAGER_FEEDBACK,
                 to=MANAGER, step_key="training_manager_feedback"),
    MailTemplate("performance_buddy", "Meet the performance buddy",
                 "Meet your performance buddy | {{Name}}", PERFORMANCE_BUDDY,
                 step_key="performance_buddy",
                 note="Not in the People team's template document; written to match the others "
                      "and worth their review before it becomes routine."),

    # ── session mails ───────────────────────────────────────────────────────────────────────
    MailTemplate("brand_ez_invite_campus", "Brand EZ invite (in campus)",
                 "Invitation: Brand EZ Session | {{Session Date}}", BRAND_EZ_CAMPUS, mode=CAMPUS,
                 session_key="brand_ez", session_role="invite"),
    MailTemplate("brand_ez_invite_remote", "Brand EZ invite (remote)",
                 "Invitation: Session on Brand EZ | Remote | {{Session Date}}", BRAND_EZ_REMOTE,
                 mode=REMOTE, session_key="brand_ez", session_role="invite"),
    MailTemplate("brand_ez_feedback", "Brand EZ feedback & LinkedIn",
                 "Brand EZ | Feedback & LinkedIn Profile Update | {{Session Date}}",
                 BRAND_EZ_FEEDBACK, session_key="brand_ez", session_role="feedback_linkedin"),
    MailTemplate("honor_code_invite_campus", "Honor Code invite (in campus)",
                 "Invitation: EZ Honor Code Session | EZ Campus | {{Session Date}}",
                 HONOR_CODE_CAMPUS, mode=CAMPUS, session_key="honor_code", session_role="invite"),
    MailTemplate("honor_code_invite_remote", "Honor Code invite (remote)",
                 "Invitation: EZ Honor Code Session | Remote | {{Session Date}}",
                 HONOR_CODE_REMOTE, mode=REMOTE, session_key="honor_code", session_role="invite"),
    MailTemplate("honor_code_feedback", "Honor Code feedback & signed copy",
                 "Action Required: Feedback & Signed Copy of EZ Honor Code | {{Session Date}}",
                 HONOR_CODE_FEEDBACK, session_key="honor_code",
                 session_role="feedback_honor_code"),
    MailTemplate("sales_deck_invite_campus", "Sales Deck invite (in campus)",
                 "Invitation: EZ Sales Deck Session | {{Session Date}}", SALES_DECK_CAMPUS,
                 mode=CAMPUS, session_key="sales_deck", session_role="invite"),
    MailTemplate("sales_deck_invite_remote", "Sales Deck invite (remote)",
                 "Invitation: EZ Sales Deck Session | Remote | {{Session Date}}",
                 SALES_DECK_REMOTE, mode=REMOTE, session_key="sales_deck", session_role="invite"),
    MailTemplate("sales_deck_feedback", "Sales Deck feedback",
                 "Mandatory Feedback | Sales Deck Session | {{Session Date}}", SALES_DECK_FEEDBACK,
                 session_key="sales_deck", session_role="feedback"),
    MailTemplate("delivery_mindset_invite_campus", "Delivery Mindset invite (in campus)",
                 "Invitation: Delivery Mindset Session | {{Session Date}}",
                 DELIVERY_MINDSET_CAMPUS, mode=CAMPUS, session_key="delivery_mindset",
                 session_role="invite"),
    MailTemplate("delivery_mindset_invite_remote", "Delivery Mindset invite (remote)",
                 "Invitation: Delivery Mindset Session | Remote | {{Session Date}}",
                 DELIVERY_MINDSET_REMOTE, mode=REMOTE, session_key="delivery_mindset",
                 session_role="invite"),
    MailTemplate("delivery_mindset_feedback", "Delivery Mindset feedback",
                 "Feedback | Delivery Mindset | {{Session Date}}", DELIVERY_MINDSET_FEEDBACK,
                 session_key="delivery_mindset", session_role="feedback"),
    MailTemplate("hundred_days_invite_campus", "100 days certification invite (in campus)",
                 "Invitation: 100 Days Certification | {{Session Date}}", HUNDRED_DAYS_CAMPUS,
                 mode=CAMPUS, session_key="hundred_days", session_role="invite"),
    MailTemplate("hundred_days_invite_remote", "100 days certification invite (remote)",
                 "Invitation: 100 Days Certification | {{Session Date}}", HUNDRED_DAYS_REMOTE,
                 mode=REMOTE, session_key="hundred_days", session_role="invite"),
    MailTemplate("joy_invite", "Session with Joy invite",
                 "Invitation: Session w Joy EZ | {{Session Date}}", JOY_INVITE,
                 session_key="joy", session_role="invite"),
    MailTemplate("joy_feedback", "Session with Joy feedback",
                 "Feedback | Session w Joy | {{Session Date}}", JOY_FEEDBACK,
                 session_key="joy", session_role="feedback"),
    MailTemplate("anti_harassment_invite", "Anti-Harassment invite",
                 "Invitation: Safe Workplace Practices: Anti Harassment Awareness Session | {{Session Date}}",
                 ANTI_HARASSMENT_INVITE, to=TEAM, session_key="anti_harassment",
                 session_role="invite"),
    MailTemplate("anti_harassment_facilitator", "Anti-Harassment facilitator profile",
                 "Facilitator Profile: Safe Workplace Practices | {{Session Date}}",
                 ANTI_HARASSMENT_FACILITATOR, to=TEAM, session_key="anti_harassment",
                 session_role="facilitator_profile"),
    MailTemplate("anti_harassment_feedback", "Anti-Harassment feedback",
                 "Feedback | Safe Workplace Practices: Anti Harassment Awareness Session | {{Session Date}}",
                 ANTI_HARASSMENT_FEEDBACK, session_key="anti_harassment", session_role="feedback"),
    MailTemplate("posh_awareness_invite", "POSH Awareness invite",
                 "Invitation: POSH Awareness & Sensitisation Program | {{Session Date}}",
                 POSH_AWARENESS_INVITE, session_key="posh_awareness", session_role="invite"),
    MailTemplate("posh_awareness_feedback", "POSH Awareness feedback",
                 "Feedback | POSH Awareness & Sensitisation Program | {{Session Date}}",
                 POSH_AWARENESS_FEEDBACK, session_key="posh_awareness", session_role="feedback"),
    MailTemplate("posh_ic_invite", "POSH IC training invite",
                 "Invitation: POSH Training | {{Session Date}}",
                 POSH_IC_INVITE, session_key="posh_ic", session_role="invite"),
    MailTemplate("iso_ai_invite", "ISO awareness & AI tools invite",
                 "Invitation | ISO Awareness Session & AI Tools Usage | {{Session Date}}",
                 ISO_AI_INVITE, to=TEAM, session_key="iso_ai_security", session_role="invite"),
    MailTemplate("joy_2_invite", "Session with Joy 2.0 invite",
                 "Session with Joy 2.0 | {{Session Date}}", JOY_2_INVITE,
                 session_key="joy_2", session_role="invite"),
    MailTemplate("joy_2_feedback", "Session with Joy 2.0 feedback",
                 "Feedback | Session with Joy 2.0 | {{Session Date}}", JOY_2_FEEDBACK,
                 to=TEAM, session_key="joy_2", session_role="feedback"),
    MailTemplate("rotational_invite", "Rotational programme invite",
                 "Your Chance to Explore EZ: Rotational Induction Program {{Year}}",
                 ROTATIONAL_INVITE, session_key="rotational", session_role="invite"),
    MailTemplate("pulse_invite_campus", "Pulse Survey invite (in campus)",
                 "EZ Pulse Survey | Your Feedback Matters | {{Session Date}}", PULSE_CAMPUS,
                 mode=CAMPUS, session_key="pulse_survey", session_role="invite"),
    MailTemplate("pulse_invite_remote", "Pulse Survey invite (remote)",
                 "EZ Pulse Survey | Your Feedback Matters | {{Session Date}}", PULSE_REMOTE,
                 mode=REMOTE, session_key="pulse_survey", session_role="invite"),
    MailTemplate("pulse_non_attendees", "Pulse Survey chase",
                 "Mandatory Response | Pulse Survey Session | {{Session Date}}",
                 PULSE_NON_ATTENDEES, session_key="pulse_survey", session_role="non_attendees"),
    MailTemplate("pulse_followup_campus", "Pulse follow-up invite (in campus)",
                 "Pulse Survey Follow-up Session | {{Session Date}}", PULSE_FOLLOWUP_CAMPUS,
                 mode=CAMPUS, session_key="pulse_followup", session_role="invite"),
    MailTemplate("pulse_followup_remote", "Pulse follow-up invite (remote)",
                 "Pulse Survey Follow-up Session | Remote | {{Session Date}}",
                 PULSE_FOLLOWUP_REMOTE, mode=REMOTE, session_key="pulse_followup",
                 session_role="invite"),
    MailTemplate("pulse_followup_non_attendees", "Pulse follow-up chase",
                 "Mandatory Response | Pulse Survey Follow-up Session | {{Session Date}}",
                 PULSE_FOLLOWUP_NON_ATTENDEES, session_key="pulse_followup",
                 session_role="non_attendees"),
]

BY_KEY: dict[str, MailTemplate] = {t.key: t for t in TEMPLATES}


def for_step(step_key: str, mode: str = CAMPUS) -> list[MailTemplate]:
    """The mails a checklist step sends, narrowed to the joiner's mode.

    A step with an in-campus and a remote version returns one of them; a step that genuinely sends
    two different mails (the employee's and the manager's) returns both, in the order the People
    team lists them."""
    want = mode or CAMPUS
    return [t for t in TEMPLATES
            if t.step_key == step_key and t.mode in (BOTH, want)]


def for_session(session_key: str, mode: str = CAMPUS) -> list[MailTemplate]:
    want = mode or CAMPUS
    return [t for t in TEMPLATES
            if t.session_key == session_key and t.mode in (BOTH, want)]


_TOKEN = re.compile(r"\{\{\s*([^}]+?)\s*\}\}")


def fields(text: str) -> list[str]:
    """Every merge field in a template, in order, without duplicates."""
    seen, out = set(), []
    for m in _TOKEN.finditer(text or ""):
        name = m.group(1)
        if name not in seen:
            seen.add(name)
            out.append(name)
    return out


def render(text: str, ctx: dict) -> str:
    """Fill what we know and LEAVE the rest standing.

    A blanked-out {{Session Time}} reads as a finished sentence with a hole in it; the token left
    in place reads as "type this before you send", which is what it is. HR sees every draft before
    it goes, so an unfilled field is a prompt rather than a defect."""
    def sub(m):
        value = ctx.get(m.group(1))
        return str(value) if value not in (None, "") else m.group(0)
    return _TOKEN.sub(sub, text or "")


def unfilled(text: str, ctx: dict) -> list[str]:
    """The fields still standing after a render, so the UI can say what needs a person."""
    return [f for f in fields(text) if ctx.get(f) in (None, "")]


def as_dict(t: MailTemplate) -> dict:
    return {
        "key": t.key, "name": t.name, "subject": t.subject, "body": t.body,
        "mode": t.mode, "to": t.to, "cc": list(t.cc), "step_key": t.step_key,
        "session_key": t.session_key, "session_role": t.session_role, "note": t.note,
        "fields": fields(t.subject + "\n" + t.body),
    }
