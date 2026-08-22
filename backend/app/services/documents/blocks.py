"""Block constructors shared by every document template.

These are the rendering toolkit, not legal content — a template builder composes them into the
`blocks` list that the frontend renderer draws (frontend/src/components/docs/DocumentBlocks.jsx)
and that render._blocks_to_text() flattens for the copy/email plain-text version.

Block shapes:
  {"type": "heading", "level": 1|2|3, "text": str, "underline": bool}
  {"type": "para", "text": str, "strong_prefix": str?, "align": "right"?, "muted": bool?}
  {"type": "list", "ordered": bool, "items": [str, ...]}
  {"type": "terms", "rows": [{"label": str, "blocks": [<para|list>, ...]}]}   # 2-col schedule table
  {"type": "comp", "rows": [{"label": str, "value": str, "emphasis": bool}], "notes": [str, ...]}
  {"type": "signature", "columns": [{"label": str, "name": str}, ...]}
  {"type": "divider"}
"""
from __future__ import annotations

from . import comp as _comp


def h(level: int, text: str, underline: bool = False) -> dict:
    return {"type": "heading", "level": level, "text": text, "underline": underline}


def p(text: str, **kw) -> dict:
    return {"type": "para", "text": text, **kw}


def ol(items: list[str]) -> dict:
    return {"type": "list", "ordered": True, "items": list(items)}


def ul(items: list[str]) -> dict:
    return {"type": "list", "ordered": False, "items": list(items)}


def divider() -> dict:
    return {"type": "divider"}


def terms(rows: list[tuple[str, list[dict]]]) -> dict:
    """A two-column schedule: each row is (label, [blocks]) — e.g. ("Notice period", [p("...")])."""
    return {"type": "terms", "rows": [{"label": label, "blocks": blks} for label, blks in rows]}


def comp_block(annual_ctc: int | None, *, extra_notes: list[str] | None = None) -> dict:
    """The computed salary-breakup table for an annual CTC (see comp.breakdown)."""
    b = _comp.breakdown(annual_ctc)
    return {"type": "comp", "rows": b["rows"], "notes": list(b["notes"]) + list(extra_notes or []), "known": b["known"]}


def signature(*columns: tuple[str, str]) -> dict:
    """Signature strip: one (label, name) per column; an empty name renders a blank rule."""
    return {"type": "signature", "columns": [{"label": lbl, "name": name} for lbl, name in columns]}


def table(columns: list[str], rows: list[list[str]], *, align: list[str] | None = None) -> dict:
    """A plain bordered grid with a header row — for rate cards and similar N-column tables that
    the 2-column `terms` and the fixed-shape `comp` block cannot express.

    `align` is one of "left"/"right"/"center" per column, defaulting to left.
    """
    return {
        "type": "table",
        "columns": [str(c) for c in columns],
        "rows": [[str(cell) for cell in row] for row in rows],
        "align": list(align or []),
    }


def comp_custom(rows: list[dict], notes: list[str], *, known: bool = True) -> dict:
    """A compensation table built from explicit rows (label/value/emphasis) and its own notes —
    for letters whose annexure has a different shape from comp.breakdown()'s default layout."""
    return {"type": "comp", "rows": list(rows), "notes": list(notes), "known": known}
