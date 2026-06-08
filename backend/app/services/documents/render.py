"""Render an EZ Lab document: resolve placeholders, build structured blocks, and derive a
plain-text version (for copy/email and backward compatibility with the old `content` field)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ...config import settings
from . import comp, templates

# template_key -> (builder, label, description, default doc_type)
TEMPLATES = {
    "offer_letter": (templates.offer_letter, "Offer Letter", "Short offer letter with job-description and compensation annexures (full-time)."),
    "employment_contract": (templates.employment_contract, "Employment Contract", "Full contract: offer letter + Schedule A terms + compensation + Schedule B covenants."),
    "traineeship_offer": (templates.traineeship_offer, "Traineeship Offer Letter", "Offer letter for a trainee/intern, with training clauses and a PPO note."),
    "nda": (templates.nda, "NDA / Confidentiality Agreement", "Standalone Confidentiality and Proprietary Information Agreement (EZ Lab Schedule B)."),
}

# doc_type -> the template used to draft it
DOC_TYPE_TEMPLATE = {
    "offer_letter": "offer_letter",
    "employment_contract": "employment_contract",
    "traineeship_offer": "traineeship_offer",
    "nda": "nda",
}

# Legal entity presets. EZ Lab details come from the supplied letters; AEZ defaults are a
# best-effort placeholder (same hub) — confirm/override the legal name & address for AEZ.
ENTITIES = {
    "EZ": {
        "short_name": "EZ Lab",  # the defined short term used throughout the body text
        "legal_entity": "EZ Lab Private Limited",
        "company_address": "EZ Lab Private Limited, Near HBR Chowk, Sector 62, Gurgaon, Haryana, 122413.",
        "location": "EZ Lab Office, Sector 62, Gurugram, India",
    },
    "AEZ": {
        "short_name": "AEZ",
        "legal_entity": "AEZ Private Limited",
        "company_address": "AEZ Private Limited, Sector 62, Gurugram, Haryana, India.",
        "location": "AEZ Office, Sector 62, Gurugram, India",
    },
}


def list_templates() -> list[dict[str, str]]:
    return [
        {"key": key, "label": label, "description": desc, "doc_type": key}
        for key, (_, label, desc) in TEMPLATES.items()
    ]


def _today() -> datetime:
    return datetime.now(timezone.utc)


def _resolve_context(raw: dict[str, Any]) -> dict[str, Any]:
    """Fill defaults for every placeholder a template might use; raw values win when truthy."""
    today = _today()
    ctx = {
        "name": "[Name]",
        "address": "[Address]",
        "designation": "[Designation]",
        "manager": "[Manager's Name, Role, Department]",
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
        "approving_manager": "",
        "website": settings.COMPANY_WEBSITE,
        "signatory_name": "Divya Anand",
        "signatory_title": "Head, People",
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
        "name", "address", "designation", "manager", "approving_manager", "reference", "letter_date",
        "start_date", "validity_date", "notice_period", "hours_of_work", "entity", "short_name",
        "location", "legal_entity", "company", "company_address", "website", "signatory_name", "signatory_title",
    ):
        ctx[k] = str(ctx[k])
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
                {**r, **({"label": fix(r["label"])} if isinstance(r.get("label"), str) else {}),
                 **({"blocks": [walk(x) for x in r["blocks"]]} if isinstance(r.get("blocks"), list) else {})}
                for r in out["rows"]
            ]
        if isinstance(out.get("columns"), list):
            out["columns"] = [{**c, **({"name": fix(c.get("name"))} if isinstance(c.get("name"), str) else {})} for c in out["columns"]]
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
            for i, it in enumerate(bl.get("items", []), 1):
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
    builder = TEMPLATES[template_key][0]
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
