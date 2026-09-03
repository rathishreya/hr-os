"""The links these mails point at, in one place.

In the People team's document these are hyperlinks: the words "Take the Test" carry a URL, and the
reader never sees the address. Transcribing the visible words alone turned every one of them into
dead text, so this is the register of what each of those words points to.

One place rather than forty because the same form appears in several letters. When the MBTI form
moves, it moves here and every template that mentions it is already correct.

WHERE A URL IS EMPTY, IT IS EMPTY ON PURPOSE. Nobody here knows the address, and a guessed URL in
a letter to a new joiner is worse than a visible gap: the gap gets filled, the guess gets clicked.
Empty ones are reported by `missing()`, the composer shows them as something still to supply, and
they can be filled from the Links screen without a deploy.
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


# A note about the tracking links below: three of these are mail-merge URLs (yamm-track,
# yatrack2). Each carries a token minted for one send, so it can expire, and everyone who clicks
# it is recorded as the same person. They work, and they are what the People team supplied, but a
# plain form address would survive longer and report honestly. Worth swapping when convenient.

LINKS: list[Link] = [
    # ── day one, and the forms that go with it ───────────────────────────────────────────────
    Link("maps", "Google Maps Link",
         "https://maps.app.goo.gl/6ytwBhYbPhTwF4FfA",
         "The office pin used in the day-one mails."),
    Link("mbti_test", "Take the Test",
         "https://www.16personalities.com/free-personality-test",
         "The MBTI personality test itself."),
    Link("mbti_results", "Submit Your MBTI Results",
         "https://www.surveymonkey.com/r/2XSHZJ9",
         "The form a joiner posts their MBTI result to."),
    Link("hiring_feedback", "Hiring Feedback Form",
         "https://www.surveymonkey.com/r/797JNDK",
         "Feedback on the hiring process, sent with the welcome mail."),

    # ── the four dive-deeper reads ───────────────────────────────────────────────────────────
    Link("ez_services", "EZ Services", "https://ez.works/ez/services"),
    Link("faster_than_fastest", "Faster Than the Fastest",
         "https://www.ez.works/ez/faster-than-the-fastest"),
    Link("consistently_high_quality", "Consistently High Quality", "",
         "Still needed. The address supplied for Corporate Film has a path reading 'consisten', "
         "which looks like this page instead, so neither was assumed."),
    Link("corporate_film", "Corporate Film",
         "https://www.ez.works/ez/consisten",
         "Supplied under this label, but the path reads like the Consistently High Quality page "
         "and looks truncated. Worth checking before it goes to a joiner."),

    # ── policies, courses and the forms after them ───────────────────────────────────────────
    Link("faq", "Access the FAQ here",
         "https://docs.google.com/document/d/1f5NKAr3gf8tS5Wd3E1UWrmodWFPOQbSu1d0WIDxPN9E/edit?usp=sharing",
         "The policies and FAQ document."),
    Link("signature_tutorial", "Link for tutorial video", "",
         "Still needed. How to change an email signature, in the policy mail."),
    Link("udemy", "Link to Udemy", "https://www.udemy.com/"),
    Link("iso_quiz", "Link to quiz", "https://forms.gle/XbJ4rAPNn8MbdsMD8"),
    Link("induction_feedback_form", "EZ Induction & Onboarding Feedback Form",
         "https://ezworks-dot-yamm-track.appspot.com/2WqZhevNuSPhXxks3WBlPJBvHPutHLvkZBtxaA7Rb32Rc8DR9mgHaJihl3yW3FgwPbepnkhYi8FjkVPu6N0FN4PocuTxAgI4xhLNZHiEcgOM_7T04XqGcg1wgLcswRjjFiHqrnJig13y08IcxQO0VT4ysZqYCHazPwgWzB1vHaVeCkZi-3U8ks14ZGZepevUWtmoaDZQWe3h_0VUIUo8OyH80huTRQDxRL0zs-9xEgM7r6Q6yJo49ouz5M5uWKhveh2QOMD7COFTg6X01XQkeP9BwteNG2FiaaRG9OUxo85HOr2Z3ful1-tlBqELQ7YR1hLb0kgMSLL6efONjKfMPGN15cv65x148UNXr2xd--aTT2tCzNTVEOWKdU-FTOIRIumzfmCsvJbICJh1PeMMHNBImYGj23lBFkUBHgNd7FMnkj1dO9Ul9br1zOG8nG940hSsKFqJGXix9Qn4DbNo",
         "A mail-merge tracking link."),
    Link("certification_form", "Certification Details Form",
         "https://ezworks-dot-yamm-track.appspot.com/2MW2au1c--qLpTuJk3unpAmQI9fuFJnZLl4Vt2FZzl2Jf8DR9mgFEND8HRI55PfQUDfvVgOTx_0OdDg7fXt5p0AFCLAMHqfKoZJ3Ktn78cDWtjDdCUmUf4X7k-Da3Kbwhq5y3ImObg0SNrl4lDU9shX9td-DGQgVKiJYwqF8lognJjN4aWU17mzevEK4BZVlOv3R1pus",
         "A mail-merge tracking link. Replaces the forms.gle address the document carried."),
    Link("training_feedback_form", "Training Feedback Form",
         "https://ezworks.yatrack2.com/2BxpiiX_mOZBE6bfPvFk540zbsKCOjJFBuVYJLkxR5uxerpcDnwEyQRr4pd0cugFaIhoxjKvJhhxoBaa8V3eM3ZNuXhAwKXUr5NS2dFT24crOaSPGct4u1RBIuBjVdpL-iqhosD3aRqSjFFXQOkGdMYe7D-FLqxLeOY6Ib5nCaZuv_FARJOScEv57wlbEnRgjcKBZQHmDaQmSUuzKUGUP3V3gZB6TU6ph1rE0jqKfvo-m7oQy_zzGjsA56_IwutQsfh428bRK274mMnqobqdtdfR92boeTT-3IaZtafV-r9Y1XMfiGANdqDZQDYtg6n4Z4x5Qjc5uZ8RHk1ZnVaOaLHBIIfVE1jPA7wTW6NXTxpUX0YQ_melnABrQRwrzOfgDnD7qgwOpoFMv2FeNVjW0QONziRubH_aiU1gc5hDmNC-sf2DcZbjXJBRI7ul25V_gJd5YeUmq8uHaEVCjU7W1x6uZR4O4CM40y-KKelElFhfXVCo0uJ6xIaaD-JfUyzmA_Pgaq05Akj5QrYSx-vw72v8iZX4QVuSCuMmNWjpJMjYUSuEQvFLEKJyKgRApTM2Cd0A6kuLWBswZvPQ9RBJGkgkayyeDd6I0J9VOS4HP0qEyEuHlzd85ZL3MF0xDkdRcxaaRQj-IBf6A1tXT-E-D8TjPr1SHfHAE2lYhl5WMY-rZfW_R04tgOeoc499ng-Xw3zauKpBWSo4RyK-Hp5jYoRuVDJ5IGa-p21ZDSiylVdwbtccOvItIuoBtkUCqF8xdxN5I_4_BO06UdrcohmipWZQ3g66wvRegXmpDeg",
         "A mail-merge tracking link."),

    # ── the sessions ─────────────────────────────────────────────────────────────────────────
    Link("brand_ez_feedback", "Share Feedback", "https://www.surveymonkey.com/r/Z3S8FL8"),
    Link("brand_ez_profiles", "Participant profile sheet",
         "https://docs.google.com/spreadsheets/d/1bhMJS50STUOua0qS9shGLqdDm53h_f0gYrECmfqYo6U/edit?usp=sharing"),
    Link("session_feedback", "Feedback Form", "https://www.surveymonkey.com/r/5MPTY8W",
         "The shared feedback form: honor code, delivery mindset, session with Joy."),
    Link("honor_code_doc", "EZ Honor Code Doc",
         "https://drive.google.com/file/d/1iUcehOOBGNULGwD0_7BEvNU95NegiCRU/view?usp=sharing"),
    Link("sales_deck_feedback", "Sales Deck Feedback Form", "", "Still needed."),
    Link("anti_harassment_feedback", "Feedback Form",
         "https://www.surveymonkey.com/r/P2MMMCQ"),
    Link("anti_harassment_policy", "View Policy", "",
         "Still needed. EZ's professional boundaries and anti-harassment policy."),
    Link("posh_feedback", "Click Here", "", "Still needed. The POSH awareness feedback form."),
    Link("posh_policy", "POSH Policy Document", "", "Still needed."),
    Link("joy_2_feedback", "Feedback Form Link", "https://www.surveymonkey.com/r/DG63X7X"),
    Link("rotational_registration", "Fill out the registration form here",
         "https://www.surveymonkey.com/r/9GL2WKN"),
    Link("pulse_survey_form", "Pulse Survey", "https://www.surveymonkey.com/r/396FMF6"),
    Link("pulse_remote_meet", "Google Meet Link", "https://meet.google.com/vnk-kfhe-omt"),
    Link("manager_feedback_survey", "Manager's feedback survey",
         "https://www.surveymonkey.com/r/79C599G"),
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
