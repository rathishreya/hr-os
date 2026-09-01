"""EZ / ArabEasy document templates - structured offer letters, contracts, NDAs and
agreements that fill placeholders from candidate + role + counterparty data and render as
blocks. Templates are classified on four axes (entity / party_type / contract_type /
doc_type); see registry.py."""
from .registry import ENTITIES, TEMPLATES, find  # noqa: F401
from .entity import entity_conflict, entity_of, settled_entity  # noqa: F401
from .render import (  # noqa: F401
    list_templates,
    render_document,
    template_supports_entity,
)
