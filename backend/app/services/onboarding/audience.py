"""Who a mail actually goes to.

A joiner's welcome letter has one reader. A POSH session, an ISO briefing or a Pulse Survey does
not: those go to the room, or to the whole company, and the People team's own templates say so in
the greeting ("Hi All," / "Hi Team,"). Until now a session mail could only reach the people
explicitly added to that sitting, which is right for the new joiners and wrong for everything else.

So a mail is addressed to an AUDIENCE, which is any mix of:

    groups   named sets this file knows how to resolve, live, at the moment of sending
    saved    lists somebody built by hand and kept (models.RecipientGroup)
    emails   addresses typed in for this one send

Resolution is deliberately honest about where the names come from. "Everyone" here means everyone
in the staff directory - the people who have a login - because that is the only company-wide list
this system holds. If somebody at EZ has no login, no code here can invent them, and a label that
implied otherwise would be a lie the operator only discovers after pressing send. The UI shows the
count and the source so the gap is visible before it matters.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from ... import models
from ..documents.entity import entity_of


@dataclass(frozen=True)
class Group:
    key: str
    label: str
    #: What the reader needs to know about where these names came from.
    source: str
    #: Set when the group is only meaningful for one entity.
    entity: str | None = None


GROUPS: list[Group] = [
    Group("staff", "Everyone with a login",
          "The staff directory. Anyone without a login is not in here."),
    Group("staff_admin", "Admins", "Staff whose account carries the admin role."),
    Group("staff_recruiter", "Recruiters", "Staff whose account carries the recruiter role."),
    Group("staff_panellist", "Interview panellists", "Staff whose account carries the panellist role."),
    Group("joiners", "Everyone on onboarding", "Candidates with an onboarding plan open."),
    Group("joiners_ez", "On onboarding, EZ", "Joiners whose paperwork is EZ.", entity="EZ"),
    Group("joiners_aez", "On onboarding, ArabEasy", "Joiners whose paperwork is ArabEasy.", entity="AEZ"),
    Group("sitting", "Everyone invited to this sitting",
          "The people added to this particular sitting."),
    Group("sitting_attended", "Only those who came",
          "The people marked present on this sitting. Empty until attendance is taken."),
    Group("sitting_absent", "Only those who did not come",
          "Marked absent on this sitting. This is who the chase-up mail is for."),
]

BY_KEY = {g.key: g for g in GROUPS}

_ROLE_GROUPS = {"staff_admin": "admin", "staff_recruiter": "recruiter", "staff_panellist": "panellist"}


def _clean(name: str, email: str, source: str) -> dict | None:
    email = (email or "").strip()
    if not email or "@" not in email:
        return None
    return {"name": (name or "").strip(), "email": email, "source": source}


def _staff(db: Session, role: str | None = None) -> list[dict]:
    out = []
    for u in db.scalars(select(models.User).order_by(models.User.name)):
        if role and role not in (u.roles or []):
            continue
        row = _clean(u.name, u.email, "staff directory")
        if row:
            out.append(row)
    return out


def _joiners(db: Session, entity: str | None = None) -> list[dict]:
    """Candidates with an onboarding plan, optionally only one entity's.

    Entity comes from the earliest document, the same rule everything else uses, so a joiner with
    no paperwork yet has no settled entity and is left out of an entity-scoped group rather than
    guessed into one.
    """
    plans = list(db.scalars(select(models.OnboardingPlan)))
    if not plans:
        return []
    cand_ids = {p.candidate_id for p in plans}
    cands = {c.id: c for c in db.scalars(
        select(models.Candidate).where(models.Candidate.id.in_(cand_ids)))}
    settled: dict[int, str] = {}
    for d in db.scalars(select(models.Document)
                        .where(models.Document.candidate_id.in_(cand_ids))
                        .order_by(models.Document.id)):
        settled.setdefault(d.candidate_id, entity_of(d))

    out, seen = [], set()
    for p in plans:
        if p.candidate_id in seen:
            continue
        seen.add(p.candidate_id)
        if entity and settled.get(p.candidate_id) != entity:
            continue
        cand = cands.get(p.candidate_id)
        if not cand:
            continue
        row = _clean(cand.name, cand.email, "on onboarding")
        if row:
            row["candidate_id"] = cand.id
            out.append(row)
    return out


def _sitting(db: Session, occurrence_id: int | None, want: str) -> list[dict]:
    """want: "all" | "attended" | "absent"."""
    if not occurrence_id:
        return []
    out = []
    for a in db.scalars(select(models.SessionAttendee)
                        .where(models.SessionAttendee.occurrence_id == occurrence_id)):
        if want == "attended" and not a.attended:
            continue
        # Absent means marked absent, not "not yet marked": chasing somebody whose attendance
        # nobody has taken yet is chasing a gap in the register, not a person.
        if want == "absent" and a.attended is not False:
            continue
        row = _clean(a.name, a.email, "on this sitting")
        if row:
            row["candidate_id"] = a.candidate_id
            row["attendee_id"] = a.id
            out.append(row)
    return out


def resolve_group(db: Session, key: str, occurrence_id: int | None = None) -> list[dict]:
    if key == "staff":
        return _staff(db)
    if key in _ROLE_GROUPS:
        return _staff(db, _ROLE_GROUPS[key])
    if key == "joiners":
        return _joiners(db)
    if key == "joiners_ez":
        return _joiners(db, "EZ")
    if key == "joiners_aez":
        return _joiners(db, "AEZ")
    if key == "sitting":
        return _sitting(db, occurrence_id, "all")
    if key == "sitting_attended":
        return _sitting(db, occurrence_id, "attended")
    if key == "sitting_absent":
        return _sitting(db, occurrence_id, "absent")
    return []


def resolve(db: Session, spec: dict | None, occurrence_id: int | None = None) -> list[dict]:
    """Every distinct person an audience spec reaches, in a stable order.

    spec = {"groups": ["staff"], "saved": [3], "emails": ["someone@x.com"]}

    Deduped by address, keeping the FIRST source that named them, so a person who is both staff and
    on this sitting is listed once and the reader can see which list put them there.
    """
    spec = spec or {}
    people: list[dict] = []
    for key in spec.get("groups") or []:
        people.extend(resolve_group(db, key, occurrence_id))
    for gid in spec.get("saved") or []:
        g = db.get(models.RecipientGroup, gid)
        if not g:
            continue
        for m in (g.members or []):
            row = _clean(m.get("name", ""), m.get("email", ""), f"list: {g.name}")
            if row:
                people.append(row)
    for addr in spec.get("emails") or []:
        row = _clean("", addr, "typed in")
        if row:
            people.append(row)

    out, seen = [], set()
    for p in people:
        k = p["email"].lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(p)
    return out


def catalogue(db: Session, occurrence_id: int | None = None) -> list[dict]:
    """The groups, each with how many people it currently reaches.

    Counted live rather than stored: a group is a rule, and the whole point is that it is right on
    the day you send rather than on the day somebody defined it.
    """
    out = []
    for g in GROUPS:
        if g.key.startswith("sitting") and not occurrence_id:
            continue
        people = resolve_group(db, g.key, occurrence_id)
        out.append({"key": g.key, "label": g.label, "source": g.source,
                    "entity": g.entity, "count": len(people)})
    return out
