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


def to_html(text: str, overrides: dict | None = None) -> str:
    """The formatted version, safe to put in an email body."""
    out = html.escape(text or "")

    def link(m):
        label, target = m.group(1), resolve(m.group(2), overrides)
        if not target:
            # No address yet: keep the words and say so, rather than emit a dead <a href="">.
            return (f'<span style="color:#92400e">{label}</span>'
                    f'<span style="color:#92400e;font-size:12px"> [link needed]</span>')
        return f'<a href="{target}" style="color:#5b21b6">{label}</a>'

    # Links first: their labels must not be re-parsed for emphasis markers.
    out = _LINK.sub(link, out)
    out = _BOLD.sub(r"<strong>\1</strong>", out)
    out = _ITALIC.sub(r"<em>\1</em>", out)
    out = _UNDER.sub(r"<u>\1</u>", out)

    paragraphs = []
    for block in out.split("\n\n"):
        block = block.strip("\n")
        if not block:
            continue
        paragraphs.append("<p style=\"margin:0 0 14px\">" + block.replace("\n", "<br>") + "</p>")
    body = "\n".join(paragraphs)
    return (
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
    return out


def strip(text: str) -> str:
    """Just the words, for a preview or a subject line."""
    out = _LINK.sub(r"\1", text or "")
    out = _BOLD.sub(r"\1", out)
    out = _ITALIC.sub(r"\1", out)
    out = _UNDER.sub(r"\1", out)
    return out
