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

import re

from . import comp as _comp


def h(level: int, text: str, underline: bool = False) -> dict:
    return {"type": "heading", "level": level, "text": text, "underline": underline}


def p(text: str, **kw) -> dict:
    return {"type": "para", "text": text, **kw}


#: A dotted leader — the rule somebody writes on. The source Word letters set 12 to 14 of these per
#: blank (see the acceptance block further down templates_ez.py); one constant keeps every blank the
#: same width. U+2026 is Unicode line-break class IN, so a run carries no internal break
#: opportunity: keep it short enough to sit on one line inside a table cell.
LEADER = "…" * 13


def blank(value: str, leader: str = LEADER) -> str:
    """An unfilled merge value, printed the way the source letters actually print it.

    Unsupplied merge values arrive from render._resolve_context as a bracketed label —
    "[Name of the Agency]". The source PDFs show exactly that: a plain bracketed placeholder,
    e.g. "[Name of the Agency] (Name of the Agency), represented ..." — no dotted rule before it.
    An earlier version prepended a "………" leader here on the theory that a bare bracket read like a
    rendering fault; comparing against the customer's own PDFs proved the opposite — the leader is
    what looked wrong (it pushed the Schedule-A heading onto three lines and cluttered the recital),
    so we now return the value untouched to match the source exactly.

    The bracket still marks "nobody filled this in": eight signature sites test value.startswith("[")
    to decide whether to draw an empty rule, and the {{Field}} mail-merge guard is separate.

    `leader` is kept in the signature for callers that still pass it, but is intentionally unused.
    """
    return str(value or "")


def dots(value: str, leader: str = LEADER) -> str:
    """A fill-in blank in running text, as the source contracts set it: an UNSUPPLIED merge value
    (a bracketed placeholder like "[Name of the Agency]") prints as the dotted rule someone writes
    on ("…………"); a value that WAS supplied prints as itself. Use only inside recital sentences —
    never in a heading or a table label, where a leader wraps the line badly (that was the old
    mistake `blank` documents). Filled letters therefore read normally; blank templates show the
    dotted blanks the customer's Word originals show.
    """
    v = str(value or "")
    return leader if (v.startswith("[") and v.endswith("]")) else v


# The inline bold/underline markers can sit between the two, as in "**…… [Name of the Agency]**
# (Name of the Agency)", so allow a run of them on either side of the bracket.
_MARK = r"[*_]*"
_DOUBLE_LABEL = re.compile(
    r"(" + LEADER + r")" + _MARK + r"\s*\[[^\]]+\]\s*(" + _MARK + r")\s*\(")


def drop_double_label(text: str) -> str:
    """Where a template already names the blank, do not name it twice.

    The sources write a blank as a rule and, often, a label after it:
    "…………… (Name of the Agency), a ……………… (type of service)". Those parentheticals were
    transcribed into the templates. `blank` then adds its own bracketed label from the placeholder
    default, so the reader gets it twice — "………… [Name of the Agency] (Name of the Agency)".

    Only fires when a parenthetical follows immediately, which is exactly the duplicated case; a
    bracketed label standing on its own is the only thing naming that blank and is left alone.
    """
    # Keep any closing bold/underline marker tight against the rule it closes, so the
    # substitution does not leave a stray gap where the label used to be.
    return _DOUBLE_LABEL.sub(lambda m: f"{m.group(1)}{m.group(2)} (", text or "")


def ol(items: list[str], start: int | None = None) -> dict:
    """A numbered list. `start` resumes the numbering, which is what lets a clause carrying
    sub-limbs interrupt the sequence without the next clause restarting at 1."""
    block = {"type": "list", "ordered": True, "items": list(items)}
    if start and start != 1:
        block["start"] = int(start)
    return block


def ul(items: list) -> dict:
    """A bulleted list. An item is a string, or {"text": str, "subs": [str]} for a bullet that
    carries its own indented second level — which the sources use and which flattening into one
    middot-joined line destroys."""
    return {"type": "list", "ordered": False, "items": list(items)}


def divider() -> dict:
    return {"type": "divider"}


def row(left: list[dict], right: list[dict]) -> dict:
    """Two stacks side by side on one band.

    The source letters set their reference block this way: the salutation (or the addressee's name)
    on the left with "Date: ..." level with it on the right. Stacking them instead, as this used to,
    pushes the whole letter down and reads as a different document.
    """
    return {"type": "row", "left": list(left), "right": list(right)}


def space(points: int = 40) -> dict:
    """Blank vertical space — room left deliberately, not a gap that crept in.

    The source letters leave about 55pt under "Sincerely," for a handwritten signature. Ours closed
    that to the ordinary paragraph gap, so the sign-off had nowhere to sign.
    """
    return {"type": "space", "points": int(points)}


def terms(rows: list[tuple[str, list[dict]]]) -> dict:
    """A two-column schedule: each row is (label, [blocks]) — e.g. ("Notice period", [p("...")])."""
    return {"type": "terms", "rows": [{"label": label, "blocks": blks} for label, blks in rows]}


def comp_block(annual_ctc: int | None, *, extra_notes: list[str] | None = None) -> dict:
    """The computed salary-breakup table for an annual CTC (see comp.breakdown)."""
    b = _comp.breakdown(annual_ctc)
    return {"type": "comp", "rows": b["rows"], "notes": list(b["notes"]) + list(extra_notes or []), "known": b["known"]}


def signature(*columns: tuple, heading: str = "", heading_align: str = "") -> dict:
    """Signature strip: (label, name), (label, name, script) or (label, name, script, title) per
    column. An empty name renders a blank rule; `script` is a handwritten-style signature drawn
    above the rule, as the source letters carry for the People-team witness.

    `title` is the signatory's position. The source letters print it on the caption line after the
    name ("WITNESS to PARTICIPANT NAME: DIVYA ANAND – Head, People"); it is carried as its own
    field so a renderer can lay it out rather than having to unpick one glued string.

    `heading` ("Signed in the presence of:") belongs to the block rather than sitting beside it as
    a loose paragraph. Kept separate it gets orphaned: the heading ends one page and the rules
    start the next, jammed under the letterhead. Inside the block a renderer can hold the two
    together.
    """
    out = []
    for col in columns:
        lbl, name = col[0], col[1]
        entry = {"label": lbl, "name": name}
        if len(col) > 2 and col[2]:
            entry["script"] = str(col[2])
        if len(col) > 3 and col[3]:
            entry["title"] = str(col[3])
        out.append(entry)
    block = {"type": "signature", "columns": out}
    if heading:
        block["heading"] = heading
    if heading_align:
        block["heading_align"] = heading_align
    return block


def script(text: str) -> dict:
    """A handwritten-style signature line (script face) above a typed sign-off, as the source
    offer letters carry for Divya Anand."""
    return {"type": "script", "text": str(text)}


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

