"""The little markup the mail templates are written in, and the two things it turns into.

The People team's document is a Word file: things are bold, some are italic, a few are underlined,
and a lot of words are hyperlinks. Storing the letters as flat text threw all of that away, and a
welcome mail that says "Take the Test" with nothing behind it is a mail that does not work.

So the bodies carry a small markup, chosen to stay readable when somebody edits it in a plain
textarea:

    *bold*            ->  <strong>
    /italic/          ->  <em>
    _underline_       ->  <u>
    [words](url)      ->  a link to that address
    [words](#key)     ->  a link to whatever links.py holds for that key

and every mail goes out as both: an HTML part that carries the formatting, and a plain-text part
for anything that will not show it. The plain part is not the markup with the symbols left in.
It is written out properly, with each link's address in brackets after its words, so a plain-text
reader can still get to the form.
"""
from __future__ import annotations

import html
import re

from . import links

# A merge value is DATA, not markup. A designation of "Analyst /Delivery/ SWAT" would otherwise
# render the middle word in italics, and a candidate's own record would be deciding how their
# welcome letter is typeset. mails.render escapes the markers in every value it substitutes, and
# these placeholders carry them past the regexes untouched.
_ESCAPES = {"*": "\x00A", "/": "\x00B", "_": "\x00C", "[": "\x00D", "]": "\x00E"}
_UNESCAPES = {v: k for k, v in _ESCAPES.items()}


def protect(value: str) -> str:
    """Make a substituted value safe to put into a template body."""
    out = str(value)
    for ch, ph in _ESCAPES.items():
        out = out.replace(ch, ph)
    return out


def _restore(text: str) -> str:
    for ph, ch in _UNESCAPES.items():
        text = text.replace(ph, ch)
    return text


_LINK = re.compile(r"\[([^\]\n]+)\]\(([^)\n]*)\)")
_BOLD = re.compile(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])")
_ITALIC = re.compile(r"(?<![\w/])/([^/\n]+)/(?![\w/])")
_UNDER = re.compile(r"(?<![\w_])_([^_\n]+)_(?![\w_])")


def resolve(target: str, overrides: dict | None = None) -> str:
    """A link target: either a real address, or #key looked up in the register.

    `overrides` is what somebody has since typed in for keys the document never showed an address
    for; it wins over the built-in register so a form can move without a deploy."""
    target = (target or "").strip()
    if target.startswith("#"):
        key = target[1:]
        return (overrides or {}).get(key) or links.url_for(key)
    return target


def used_links(text: str) -> list[str]:
    """The register keys this text points at, in order, without duplicates."""
    seen, out = set(), []
    for _label, target in _LINK.findall(text or ""):
        target = (target or "").strip()
        if target.startswith("#") and target[1:] not in seen:
            seen.add(target[1:])
            out.append(target[1:])
    return out


def unresolved(text: str, overrides: dict | None = None) -> list[str]:
    """The link keys in this text that still have no address behind them."""
    return [k for k in used_links(text)
            if not ((overrides or {}).get(k) or links.url_for(k))]


def _is_table_row(line: str) -> bool:
    line = line.strip()
    return line.startswith("|") and line.endswith("|") and len(line) > 2


def _blocks(lines: list[str]):
    """Walk the lines, yielding ("table", rows) for each run of pipe rows and ("text", line) for
    everything else. A table is a run rather than something you open and close: it ends where the
    pipes stop, which is what somebody editing it in a plain box would expect."""
    buf: list[list[str]] = []
    for line in lines:
        if _is_table_row(line):
            buf.append([c.strip() for c in line.strip().strip("|").split("|")])
            continue
        if buf:
            yield ("table", buf)
            buf = []
        yield ("text", line)
    if buf:
        yield ("table", buf)


def _table_html(rows: list[list[str]]) -> str:
    width = max(len(r) for r in rows)
    out = ['<table style="border-collapse:collapse;margin:0 0 14px;font-size:13px">']
    for i, row in enumerate(rows):
        tag = "th" if i == 0 else "td"
        style = "border:1px solid #cbd5e1;padding:6px 10px;text-align:left;vertical-align:top"
        if i == 0:
            style += ";background:#f1f5f9;font-weight:600"
        out.append("<tr>")
        for cell in row + [""] * (width - len(row)):
            out.append(f'<{tag} style="{style}">{cell}</{tag}>')
        out.append("</tr>")
    out.append("</table>")
    return "".join(out)


def _table_text(rows: list[list[str]]) -> str:
    """Padded columns, so a text-only reader still sees a table rather than a run-on line."""
    width = max(len(r) for r in rows)
    grid = [r + [""] * (width - len(r)) for r in rows]
    widths = [max(len(g[i]) for g in grid) for i in range(width)]
    out = []
    for i, row in enumerate(grid):
        out.append("  ".join(c.ljust(widths[j]) for j, c in enumerate(row)).rstrip())
        if i == 0:
            out.append("  ".join("-" * w for w in widths))
    return "\n".join(out)


def to_html(text: str, overrides: dict | None = None) -> str:
    """The formatted version, safe to put in an email body."""
    out = html.escape(text or "")

    def link(m):
        label, target = m.group(1), resolve(m.group(2), overrides)
        if not target:
            # No address yet: keep the words and say so, rather than emit a dead <a href="">.
            return (f'<span style="color:#92400e">{label}</span>'
                    f'<span style="color:#92400e;font-size:12px"> [link needed]</span>')
        # The address goes inside an attribute, so a quote in it would break out of the tag.
        return f'<a href="{html.escape(target, quote=True)}" style="color:#5b21b6">{label}</a>'

    # Links first: their labels must not be re-parsed for emphasis markers.
    out = _LINK.sub(link, out)
    out = _BOLD.sub(r"<strong>\1</strong>", out)
    out = _ITALIC.sub(r"<em>\1</em>", out)
    out = _UNDER.sub(r"<u>\1</u>", out)

    # Emphasis and links are applied above, so a table cell arrives already rendered and only
    # needs putting in its box.
    rendered: list[str] = []
    para: list[str] = []

    def flush():
        chunk = "\n".join(para).strip("\n")
        para.clear()
        if chunk.strip():
            rendered.append("<p style=\"margin:0 0 14px\">" + chunk.replace("\n", "<br>") + "</p>")

    for kind, value in _blocks(out.split("\n")):
        if kind == "table":
            flush()
            rendered.append(_table_html(value))
        elif value.strip() == "":
            flush()
        else:
            para.append(value)
    flush()
    body = "\n".join(rendered)
    return _restore(
        '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;'
        'font-size:14px;line-height:1.6;color:#1e293b">\n' + body + "\n</div>"
    )


def to_text(text: str, overrides: dict | None = None) -> str:
    """The plain version: markers gone, addresses spelled out after the words that carried them."""
    def link(m):
        label, target = m.group(1), resolve(m.group(2), overrides)
        return f"{label} ({target})" if target else f"{label} [link needed]"

    out = _LINK.sub(link, text or "")
    out = _BOLD.sub(r"\1", out)
    out = _ITALIC.sub(r"\1", out)
    out = _UNDER.sub(r"\1", out)
    lines = []
    for kind, value in _blocks(out.split("\n")):
        lines.append(_table_text(value) if kind == "table" else value)
    return _restore("\n".join(lines))


def strip(text: str) -> str:
    """Just the words, for a preview or a subject line."""
    out = _LINK.sub(r"\1", text or "")
    out = _BOLD.sub(r"\1", out)
    out = _ITALIC.sub(r"\1", out)
    out = _UNDER.sub(r"\1", out)
    return _restore(out)
