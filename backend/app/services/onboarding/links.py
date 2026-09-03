"""The links these mails point at, in one place.

In the People team's document these are hyperlinks: the words "Take the Test" carry a URL, and the
reader never sees the address. Transcribing the visible words alone turned every one of them into
dead text, so this is the register of what each of those words points to.

One place rather than forty because the same form appears in several letters. When the MBTI form
moves, it moves here and every template that mentions it is already correct.

WHERE A URL IS EMPTY, IT IS EMPTY ON PURPOSE. The document showed the link text but not the
address, so nobody here knows it. A guessed URL in a letter to a new joiner is worse than a visible
gap: the gap gets filled, the guess gets clicked. Empty ones are reported by `missing()` and the
composer shows them as something still to supply, exactly like an unfilled merge field.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Link:
    key: str
    #: The words that carry the link in the letter.
    label: str
    url: str = ""
    #: What it is, for whoever has to go and find the address.
    note: str = ""


LINKS: list[Link] = [
    # ── taken straight from the document, address and all ────────────────────────────────────
    Link("faq", "Access the FAQ here",
         "https://docs.google.com/document/d/1f5NKAr3gf8tS5Wd3E1UWrmodWFPOQbSu1d0WIDxPN9E/edit?usp=sharing",
         "The policies and FAQ document."),
    Link("certification_form", "Certification Details Form",
         "https://forms.gle/GeJ7JZP7B2d1hkeX6"),
    Link("udemy", "Link to Udemy", "https://www.udemy.com/"),
    Link("iso_quiz", "Link to quiz", "https://forms.gle/XbJ4rAPNn8MbdsMD8"),
    Link("manager_feedback_survey", "Manager's feedback survey",
         "https://www.surveymonkey.com/r/79C599G"),
    Link("brand_ez_feedback", "Share Feedback", "https://www.surveymonkey.com/r/Z3S8FL8"),
    Link("brand_ez_profiles", "Participant profile sheet",
         "https://docs.google.com/spreadsheets/d/1bhMJS50STUOua0qS9shGLqdDm53h_f0gYrECmfqYo6U/edit?usp=sharing"),
    Link("session_feedback", "Feedback Form", "https://www.surveymonkey.com/r/5MPTY8W",
         "The shared feedback form: honor code, delivery mindset, session with Joy."),
    Link("honor_code_doc", "EZ Honor Code Doc",
         "https://drive.google.com/file/d/1iUcehOOBGNULGwD0_7BEvNU95NegiCRU/view?usp=sharing"),
    Link("anti_harassment_feedback", "Feedback Form",
         "https://www.surveymonkey.com/r/P2MMMCQ"),
    Link("joy_2_feedback", "Feedback Form Link", "https://www.surveymonkey.com/r/DG63X7X"),
    Link("rotational_registration", "Fill out the registration form here",
         "https://www.surveymonkey.com/r/9GL2WKN"),
    Link("pulse_survey_form", "Pulse Survey", "https://www.surveymonkey.com/r/396FMF6"),
    Link("pulse_remote_meet", "Google Meet Link", "https://meet.google.com/vnk-kfhe-omt"),

    # ── the document hyperlinked these words but never showed the address ────────────────────
    Link("mbti_test", "Take the Test", "", "The MBTI personality test itself."),
    Link("mbti_results", "Submit Your MBTI Results", "",
         "The form a joiner posts their MBTI result to."),
    Link("hiring_feedback", "Hiring Feedback Form", "",
         "Feedback on the hiring process, sent with the welcome mail."),
    Link("maps", "Google Maps Link", "", "The office pin used in the day-one mails."),
    Link("signature_tutorial", "Link for tutorial video", "",
         "How to change an email signature, in the policy mail."),
    Link("ez_services", "EZ Services", "", "One of the four dive-deeper reads."),
    Link("faster_than_fastest", "Faster Than the Fastest", ""),
    Link("consistently_high_quality", "Consistently High Quality", ""),
    Link("corporate_film", "Corporate Film", ""),
    Link("induction_feedback_form", "EZ Induction & Onboarding Feedback Form", "",
         "The induction and onboarding feedback form."),
    Link("training_feedback_form", "Training Feedback Form", ""),
    Link("sales_deck_feedback", "Sales Deck Feedback Form", ""),
    Link("anti_harassment_policy", "View Policy", "",
         "EZ's professional boundaries and anti-harassment policy."),
    Link("posh_policy", "POSH Policy Document", ""),
    Link("posh_feedback", "Click Here", "", "The POSH awareness feedback form."),
]

BY_KEY: dict[str, Link] = {l.key: l for l in LINKS}


def url_for(key: str) -> str:
    link = BY_KEY.get(key)
    return link.url if link else ""


def label_for(key: str) -> str:
    link = BY_KEY.get(key)
    return link.label if link else key


def missing() -> list[Link]:
    """The links nobody has an address for yet."""
    return [l for l in LINKS if not l.url]


def as_dict(l: Link) -> dict:
    return {"key": l.key, "label": l.label, "url": l.url, "note": l.note}
