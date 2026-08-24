"""Render an EZ Lab document: resolve placeholders, build structured blocks, and derive a
plain-text version (for copy/email and backward compatibility with the old `content` field)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ...config import settings
from . import comp, templates_aez, templates_ez  # noqa: F401 — importing registers templates
from .registry import ENTITIES, TEMPLATES, default_template_for, find

# Templates register themselves into registry.TEMPLATES at import time; the modules above are
# imported purely for that side effect. TEMPLATES / ENTITIES are re-exported here so existing
# callers (routers, __init__) keep their import path.

def list_templates(
    entity: str | None = None,
    party_type: str | None = None,
    contract_type: str | None = None,
    doc_type: str | None = None,
) -> list[dict[str, Any]]:
    """The templates on offer, narrowed by any combination of the four taxonomy axes."""
    return [t.as_dict() for t in find(entity, party_type, contract_type, doc_type)]


def template_supports_entity(template_key: str, entity: str | None) -> bool:
    """Is this template issued by that entity? Unknown template/entity -> True, so this only ever
    blocks a combination we positively know is wrong."""
    ent = (entity or "").strip().upper()
    if template_key not in TEMPLATES or not ent or ent not in ENTITIES:
        return True
    return TEMPLATES[template_key].entity == ent


def _today() -> datetime:
    return datetime.now(timezone.utc)


def _resolve_context(raw: dict[str, Any]) -> dict[str, Any]:
    """Fill defaults for every placeholder a template might use; raw values win when truthy."""
    today = _today()
    ctx = {
        "name": "[Name]",
        "address": "[Address]",
        "designation": "[Designation]",
        "manager": "[Reporting Manager's Name]",
        "manager_role": "[Manager's Role]",
        "responsibilities": None,
        "annual_ctc": None,
        "reference": today.strftime("%Y%m%d") + "-001",
        "letter_date": today.strftime("%d %B %Y"),
        "start_date": "[Start Date]",
        "validity_date": "[Validity Date]",
        "notice_period": "60 (Sixty) days'",
        "hours_of_work": "9 hours for 5 days a week based on the shift timings assigned to you every month.",
        "entity": "EZ",
        "short_name": ENTITIES["EZ"]["short_name"],
        "location": ENTITIES["EZ"]["location"],
        "legal_entity": ENTITIES["EZ"]["legal_entity"],
        "company": settings.COMPANY_NAME,
        "company_address": ENTITIES["EZ"]["company_address"],
        "approving_manager": "[Approving Manager's Name]",
        "approving_manager_role": "[Manager's Role]",
        "website": settings.COMPANY_WEBSITE,
        "signatory_name": "Divya Anand",
        "signatory_title": "Head, People",
        # ── Agency / service-provider contracts ──────────────────────────────────────────
        # The counterparty is an organisation, not a candidate, so it needs its own set of
        # placeholders rather than reusing name/address/designation.
        "agency_name": "[Name of the Agency]",
        "agency_address": "[Registered office address]",
        "agency_signatory_name": "[Name of the authorized signatory]",
        "agency_signatory_title": "[Position/Designation]",
        "agency_poc_name": "",  # defaults to the authorized signatory below
        "service_type": "[type of Services]",
        "service_name": "[Name of the service]",
        "services": None,   # list -> Description of services bullets
        "fees": None,       # list -> Fees for service bullets
        "bank_name": "[Name of the Bank]",
        "commencement_date": "[Date]",
        "effective_date": "[Effective Date]",
        # Long-form execution date; the source NDAs print it as a hand-filled blank.
        "execution_date": "__ day of _______ 20__",
        # The signatory on commercial contracts differs from the offer-letter signatory.
        "contract_signatory_name": "Joy Sharma",
        "contract_signatory_title": "Founder & CEO",
        # The party actually named in the contract body, which is not always the letterhead
        # entity — the supplied EZ Lab agency contract contracts as ArabEasy LLC under UAE law.
        "contracting_entity": "ARABEASY LLC",
        "contracting_office": "Office 10, Level 1, Sharjah Media City, Sharjah, UAE 515000",
        "governing_law": "UAE",
        "jurisdiction": "Sharjah",
    }
    raw = raw or {}
    for k, v in raw.items():
        if v not in (None, "", []):
            ctx[k] = v
    # Entity (EZ/AEZ) drives the legal name, registered address and office location, unless the
    # caller explicitly overrode any of those.
    ent = str(ctx.get("entity") or "EZ").upper()
    ctx["entity"] = ent if ent in ENTITIES else "EZ"
    for k, v in ENTITIES[ctx["entity"]].items():
        if raw.get(k) in (None, "", []):
            ctx[k] = v
    # CTC may arrive as a number or free-text ("20-28 LPA"); normalise to annual rupees.
    if not isinstance(ctx.get("annual_ctc"), int):
        ctx["annual_ctc"] = comp.parse_ctc(ctx.get("annual_ctc") or raw.get("ctc") or raw.get("budget_ctc"))
    # Responsibilities must be a clean list of strings — a stray string would explode into one
    # bullet per character; coerce defensively (bad client/AI input can't corrupt the document).
    r = ctx.get("responsibilities")
    if isinstance(r, list):
        ctx["responsibilities"] = [str(x) for x in r if str(x).strip()] or None
    else:
        ctx["responsibilities"] = [str(r)] if r else None
    # Stringify every text placeholder so a non-string term value can't 500 via .upper()/concat.
    for k in (
        "name", "address", "designation", "manager", "manager_role", "approving_manager",
        "approving_manager_role", "reference", "letter_date",
        "start_date", "validity_date", "notice_period", "hours_of_work", "entity", "short_name",
        "location", "legal_entity", "company", "company_address", "website", "signatory_name", "signatory_title",
        "agency_name", "agency_address", "agency_signatory_name", "agency_signatory_title",
        "service_type", "service_name", "bank_name", "commencement_date", "effective_date",
        "contract_signatory_name", "contract_signatory_title", "contracting_entity", "execution_date",
        "contracting_office", "governing_law", "jurisdiction",
    ):
        ctx[k] = str(ctx[k])
    # The cover letter greets a point of contact who is usually the signatory themselves.
    ctx["agency_poc_name"] = str(ctx["agency_poc_name"] or ctx["agency_signatory_name"])
    return ctx


def _apply_short_name(blocks: list[dict], sn: str) -> list[dict]:
    """Replace the boilerplate short term 'EZ Lab' with the entity's short name (e.g. 'AEZ')
    throughout the rendered document, so a non-EZ entity's clauses don't refer to 'EZ Lab'.
    No-op when sn == 'EZ Lab'. The EZ legal name never appears literally in a non-EZ document
    (the intro/witness interpolate the entity's own legal_entity), so this is a safe substring swap."""
    def fix(s: Any) -> Any:
        return s.replace("EZ Lab", sn) if isinstance(s, str) else s

    def walk(b: dict) -> dict:
        out = dict(b)
        if "text" in out:
            out["text"] = fix(out["text"])
        if "strong_prefix" in out and isinstance(out["strong_prefix"], str):
            out["strong_prefix"] = fix(out["strong_prefix"])
        if isinstance(out.get("items"), list):
            out["items"] = [fix(x) for x in out["items"]]
        if isinstance(out.get("rows"), list):
            out["rows"] = [
                # A grid row is a plain list of cells; terms/comp rows are dicts.
                [fix(c) for c in r] if isinstance(r, list) else
                {**r, **({"label": fix(r["label"])} if isinstance(r.get("label"), str) else {}),
                 **({"blocks": [walk(x) for x in r["blocks"]]} if isinstance(r.get("blocks"), list) else {})}
                for r in out["rows"]
            ]
        if isinstance(out.get("columns"), list) and all(isinstance(c, str) for c in out["columns"]):
            out["columns"] = [fix(c) for c in out["columns"]]  # grid header cells
        if isinstance(out.get("columns"), list):
            # signature columns are {label, name} dicts; grid header cells are plain strings.
            out["columns"] = [
                fix(c) if isinstance(c, str) else
                {**c, **({"name": fix(c.get("name"))} if isinstance(c.get("name"), str) else {})}
                for c in out["columns"]
            ]
        return out

    return [walk(b) for b in blocks]


def _blocks_to_text(blocks: list[dict]) -> str:
    """Flatten structured blocks into readable plain text for copy/email."""
    out: list[str] = []

    def render(bl: dict) -> None:
        t = bl.get("type")
        if t == "heading":
            out.append(("\n" if out else "") + bl.get("text", "").upper())
            out.append("")
        elif t == "para":
            prefix = bl.get("strong_prefix")
            text = bl.get("text", "")
            out.append(f"{prefix}: {text}" if prefix and not text.startswith(prefix) else text)
        elif t == "list":
            for i, it in enumerate(bl.get("items", []), int(bl.get("start") or 1)):
                out.append(f"  {i}. {it}" if bl.get("ordered") else f"  • {it}")
        elif t == "terms":
            for row in bl.get("rows", []):
                out.append(f"{row.get('label', '')}:")
                for sub in row.get("blocks", []):
                    render(sub)
                out.append("")
        elif t == "comp":
            for row in bl.get("rows", []):
                out.append(f"  {row.get('label', ''):<55} {row.get('value', '')}")
            for n in bl.get("notes", []):
                out.append(f"  * {n}")
        elif t == "table":
            cols = bl.get("columns", [])
            if cols:
                out.append("  " + " | ".join(str(c) for c in cols))
            for row in bl.get("rows", []):
                out.append("  " + " | ".join(str(c) for c in (row or [])))
        elif t == "signature":
            out.append("")
            for col in bl.get("columns", []):
                out.append(f"{col.get('label', '')}: {col.get('name', '') or '________________'}")
        elif t == "divider":
            out.append("\n" + ("—" * 40) + "\n")

    for b in blocks:
        render(b)
    # Strip the inline **bold** markers for the plain-text copy (underline is heading-only, and
    # signature underscore runs use single '_', so only '**' needs removing).
    return "\n".join(out).strip().replace("**", "")


def render_document(template_key: str, raw_context: dict[str, Any]) -> dict[str, Any]:
    """Build a document from a template. Returns {title, doc_type, blocks, content, template_key}."""
    if template_key not in TEMPLATES:
        raise KeyError(template_key)
    builder = TEMPLATES[template_key].builder
    ctx = _resolve_context(raw_context)
    built = builder(ctx)
    blocks = built["blocks"]
    sn = ctx.get("short_name") or "EZ Lab"
    if sn != "EZ Lab":
        blocks = _apply_short_name(blocks, sn)  # keep the body's defined term consistent with the entity
    return {
        "title": built["title"],
        "doc_type": built["doc_type"],
        "blocks": blocks,
        "content": _blocks_to_text(blocks),
        "template_key": template_key,
    }
