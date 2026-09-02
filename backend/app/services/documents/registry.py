"""The document taxonomy and template registry.

A template is identified by four independent axes, so HR can narrow to exactly the paper it
needs (and so the same doc_type can exist several times over — an NDA for an agency under UAE
law is not the NDA a full-time employee signs):

    entity         EZ | AEZ                    - the operating entity issuing the document
    party_type     agency | individual         - who we're contracting WITH
    contract_type  agency | freelance | ...    - the engagement model
    doc_type       contract | nda | offer      - the kind of paper

Register templates from the per-entity modules (templates_ez.py / templates_aez.py); this module
holds no legal content itself. Vocabularies are closed sets so a typo fails at import time rather
than silently creating an unreachable template.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

# ── Vocabularies ────────────────────────────────────────────────────────────────────────────
ENTITY_KEYS = ("EZ", "AEZ")
PARTY_TYPES = ("agency", "individual")
CONTRACT_TYPES = ("agency", "freelance", "trainee", "full_time", "professional_services")
DOC_TYPES = ("offer", "contract", "nda", "nda-tech")

# Legal-entity presets. These fill the letterhead/legal-name placeholders; a template may still
# name a different contracting party in its body (see templates_ez.agency_contract).
ENTITIES: dict[str, dict[str, str]] = {
    "EZ": {
        "short_name": "EZ Lab",
        "legal_entity": "EZ Lab Private Limited",
        "company_address": "Technology and Innovation Hub: EZ, 5th Floor, Imperia Mindspace, Golf Course Extension, Sector 62, Gurugram, Haryana – 122413, INDIA",
        "location": "EZ Lab Office, Sector 62, Gurugram, India",
    },
    "AEZ": {
        # ArabEasy's documents define the short term as "EZ" throughout their clause text.
        "short_name": "EZ",
        "legal_entity": "ArabEasy LLC",
        "company_address": "Registered Office: 10, Level 1, Sharjah Media City, Sharjah, UAE",
        "location": "Sharjah Media City, Sharjah, UAE",
    },
}


@dataclass(frozen=True)
class Template:
    """One registered document template. `builder(ctx) -> {title, doc_type, blocks}`."""

    key: str
    builder: Callable[[dict], dict]
    label: str
    description: str
    entity: str
    doc_type: str
    # Optional axes: None means "applies regardless". An NDA that binds an employee OR an
    # independent contractor genuinely has no single contract_type, and forcing one would make
    # it invisible to half the searches that should find it.
    party_type: str | None = None
    contract_type: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "description": self.description,
            "entity": self.entity,
            "party_type": self.party_type,
            "contract_type": self.contract_type,
            "doc_type": self.doc_type,
        }


# template_key -> Template. Insertion-ordered, so listings follow registration order.
TEMPLATES: dict[str, Template] = {}


def register(
    key: str,
    builder: Callable[[dict], dict],
    *,
    label: str,
    description: str,
    entity: str,
    doc_type: str,
    party_type: str | None = None,
    contract_type: str | None = None,
) -> Template:
    """Add a template to the registry, validating every axis against its vocabulary.

    `key` must be globally unique and stable — documents.template_key stores it, so renaming a
    key orphans every document already drafted from it.
    """
    if key in TEMPLATES:
        raise ValueError(f"duplicate template key: {key!r}")
    for value, allowed, axis, optional in (
        (entity, ENTITY_KEYS, "entity", False),
        (doc_type, DOC_TYPES, "doc_type", False),
        (party_type, PARTY_TYPES, "party_type", True),
        (contract_type, CONTRACT_TYPES, "contract_type", True),
    ):
        if value is None and optional:
            continue
        if value not in allowed:
            raise ValueError(f"template {key!r}: {axis}={value!r} must be one of {allowed}")
    tpl = Template(key, builder, label, description, entity, doc_type, party_type, contract_type)
    TEMPLATES[key] = tpl
    return tpl


def find(
    entity: str | None = None,
    party_type: str | None = None,
    contract_type: str | None = None,
    doc_type: str | None = None,
) -> list[Template]:
    """Templates matching every axis supplied. A blank or unrecognised value is ignored rather
    than matching nothing, so a stale filter from the UI can never blank the list silently."""

    def keep(tpl: Template) -> bool:
        for want, allowed, got in (
            (entity, ENTITY_KEYS, tpl.entity),
            (doc_type, DOC_TYPES, tpl.doc_type),
            (party_type, PARTY_TYPES, tpl.party_type),
            (contract_type, CONTRACT_TYPES, tpl.contract_type),
        ):
            w = (want or "").strip()
            w = w.upper() if allowed is ENTITY_KEYS else w.lower()
            # got is None -> the template applies to every value of this axis, so it matches.
            if w and w in allowed and got is not None and w != got:
                return False
        return True

    return [t for t in TEMPLATES.values() if keep(t)]


def default_template_for(doc_type: str) -> str:
    """The template to use when a caller names only a doc_type. Only answers when exactly one
    template claims that doc_type — otherwise the caller must be explicit about template_key."""
    matches = [t.key for t in TEMPLATES.values() if t.doc_type == doc_type]
    return matches[0] if len(matches) == 1 else ""
