"""Which operating entity a document — and therefore a candidate — is on.

A candidate belongs to ONE operating entity: their first document settles it, and every later one
must be issued on the same company's paper.

This lives in the service rather than in a router because THREE different routes can put a
document into a candidate's file — POST /documents/generate, POST /documents/{id}/regenerate, and
the hire flow's auto-draft in routers/pipeline.py — and a second copy of the rule would drift from
the first. The auto-draft is the one that actually caused a violation in production: it hardcoded
an EZ offer letter and its de-duplication only looked for offer-type documents on one application,
which no AEZ candidate can ever have (AEZ issues contracts and NDAs, never an offer letter), so
hiring an AEZ candidate reliably dropped EZ paper into their file.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .registry import TEMPLATES


def entity_of(doc) -> str:
    """The entity a stored document is on.

    Mirrors the enrichment the API returns: the template is authoritative and terms['entity'] is
    only the fallback for legacy/AI documents that were never drafted from one. Never read terms
    first — PATCH /documents/{id}/fields writes terms['entity'] even on template-backed rows,
    where it is inert and therefore routinely stale.
    """
    tpl = TEMPLATES.get(doc.template_key)
    return (tpl.entity if tpl else "") or (doc.terms or {}).get("entity") or "EZ"


def settled_entity(db: Session, candidate_id: int, exclude_doc_id: int | None = None) -> str:
    """The entity this candidate is already on, or "" when nothing has settled it yet.

    Empty means UNSET, not EZ. That distinction is load-bearing: answering "EZ" for a candidate
    with no documents would make it impossible to ever start anyone on AEZ.

    Scoped by CANDIDATE, never by application — a candidate can hold several applications, and the
    hire flow drafts per application, so an application-scoped answer is blind to exactly the
    documents that create a conflict. Ordered by id rather than created_at, because created_at is
    identical to the second for documents drafted within one request.

    Taking the earliest document rather than, say, the majority means the answer never moves as
    documents are added, and it stays stable for the handful of candidates created before this
    rule existed whose documents disagree.
    """
    from ... import models  # local: keeps the service importable without the ORM graph

    rows = db.scalars(
        select(models.Document)
        .where(models.Document.candidate_id == candidate_id)
        .order_by(models.Document.id)
    )
    for doc in rows:
        if exclude_doc_id is not None and doc.id == exclude_doc_id:
            continue
        return entity_of(doc)
    return ""


def entity_conflict(db: Session, candidate_id: int) -> list[str]:
    """Every distinct entity in this candidate's file, when there is more than one.

    Empty list means the file is consistent. Used to surface pre-existing violations rather than
    silently picking a winner: the odd letter is on the wrong company's paper, and which one is
    wrong is a decision for a person, not for this code.
    """
    from ... import models

    rows = db.scalars(
        select(models.Document).where(models.Document.candidate_id == candidate_id)
    )
    found = sorted({entity_of(d) for d in rows})
    return found if len(found) > 1 else []
