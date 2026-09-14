// Convert a document's structured `blocks` to the SAME HTML the PDF/print window uses, so the rich
// editor seeds from an exact match of the printed output, and a manually edited `content_html`
// round-trips through preview → editor → PDF unchanged. The on-screen `.doc-html` CSS (index.css)
// and the print CSS (printDocument.js) both style these tags identically.
import { richSegments } from './rich'
import { signImageFor } from './signatureAssets'

export const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function richHtml(text) {
  return richSegments(text)
    .map((s) => {
      let h = esc(s.text)
      if (s.bold) h = `<strong>${h}</strong>`
      if (s.underline) h = `<u>${h}</u>`
      return h
    })
    .join('')
}

// A clause-shaped paragraph: "1. ..." / "12.1 ..." in the body, or a numbered strong_prefix
// ("2. Duties & Responsibilities"). These get a hanging indent so the number sits in the gutter.
// Every item opens with its own enumerator ("A.", "a)", "(i)", "iii.", "1.") -- the source
// documents set such lists without bullets, the marker IS the text.
const MARK_RE = /^\s*\(?[A-Za-z0-9]{1,5}[.)]\s/
export const selfMarked = (items) => Array.isArray(items) && items.length > 0 && items.every((i) => MARK_RE.test(String(i)))

export const isClause = (b) =>
  /^\s*\d{1,2}(\.\d+)?[.)]?\s/.test(String(b?.strong_prefix || b?.text || ''))

function strong(text, prefix) {
  // The source documents set the clause number in regular weight and only the label bold
  // ("1. Effectiveness:"), so a leading number is split out of the bold span.
  const boldPrefix = (p) => {
    const m = /^(\s*\d{1,2}(?:\.\d+)?[.)]?\s+)([\s\S]*)$/.exec(p)
    return m ? `${esc(m[1])}<strong>${esc(m[2])}</strong>` : `<strong>${esc(p)}</strong>`
  }
  if (prefix && String(text).startsWith(prefix)) return `${boldPrefix(prefix)}${richHtml(String(text).slice(prefix.length))}`
  if (prefix && !text) return boldPrefix(prefix)
  if (prefix) return `${boldPrefix(prefix)}<strong>: </strong>${richHtml(text)}`
  return richHtml(text)
}

// A signature label is "PARTICIPANT - NAME" / "WITNESS to PARTICIPANT - NAME": the role sits on the
// first line, and the " - NAME" tail becomes the "NAME: <name>" line below the rule, both as the
// source contracts set them. Shared by every renderer so they read identically.
export const sigRole = (label) => {
  const m = /^(.*?)\s*[-–]\s*NAME\s*$/i.exec(String(label || ''))
  return (m ? m[1] : String(label || '')).trim()
}
export const sigNameLine = (c) => {
  const nm = c.name ? esc(c.name) : ''
  const title = c.title ? ` &ndash; ${esc(c.title)}` : ''
  if (nm) return `NAME: ${nm}${title}`
  return /NAME\s*$/i.test(String(c.label || '')) ? 'NAME:' : (c.title ? esc(c.title) : '')
}

// The lines printed UNDER a signature rule, as PLAIN TEXT (each renderer escapes/wraps as needed).
// Two source formats:
//  - Participant/Witness ("PARTICIPANT - NAME"): the role, then "NAME: <name>".
//  - Signatory blocks ("SIGNED for and on behalf of EZ", "For Service Provider"): the role line
//    followed by "NAME: <name>", "Title: <title>", "Date:" — exactly as the agency contracts set it.
export const sigCaptionLines = (c) => {
  const label = String(c.label || '')
  if (/-\s*NAME\s*$/i.test(label)) {
    const role = /^(.*?)\s*[-–]\s*NAME\s*$/i.exec(label)[1].trim()
    const nm = c.name ? String(c.name) : ''
    const title = c.title ? ` – ${c.title}` : ''
    return [role, nm ? `NAME: ${nm}${title}` : 'NAME:']
  }
  return [`${label}:`, `NAME: ${c.name || ''}`, `Title: ${c.title || ''}`, 'Date:']
}

export function blockToHtml(b) {
  switch (b.type) {
    case 'heading': {
      // Underline both ways: the `ul` class drives the on-screen editor, and an inner <u> carries the
      // underline into an edited letter's PDF — html-to-pdfmake ignores our CSS classes but honours
      // the <u> tag. (blockToPdf underlines the fresh PDF via `decoration` on its own path.)
      const lvl = b.level || 2
      const inner = b.underline ? `<u>${esc(b.text)}</u>` : esc(b.text)
      return `<h${lvl} class="${b.underline ? 'ul' : ''}">${inner}</h${lvl}>`
    }
    case 'para': {
      const cls = [b.muted && 'muted', b.align === 'right' && 'right', isClause(b) && 'clause']
        .filter(Boolean).join(' ')
      // Inline styles alongside the classes: an edited document's PDF is built by html-to-pdfmake,
      // which ignores our CSS classes — so the date's right alignment (and muted grey) have to ride
      // on the element itself to survive an edit. The classes still drive the on-screen editor.
      const style = [b.align === 'right' && 'text-align:right', b.muted && 'color:#6b7280']
        .filter(Boolean).join(';')
      return `<p class="${cls}"${style ? ` style="${style}"` : ''}>${strong(b.text, b.strong_prefix)}</p>`
    }
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul'
      const attr = b.ordered && b.start ? ` start="${Number(b.start)}"` : ''
      // Items that carry their own marker (A., a), (i), iii., 1.) are set in the sources as
      // plain indented lines -- adding a disc would double-mark them.
      const plain = !b.ordered && selfMarked(b.items) ? ' class="plain"' : ''
      // An item may be {text, subs} — a bullet with its own indented second level, as the source
      // letters set the brand list under "for the following brands:".
      const li = (i) => {
        if (i && typeof i === 'object') {
          const subs = (i.subs || []).map((s) => `<li>${richHtml(s)}</li>`).join('')
          return `<li>${richHtml(i.text || '')}${subs ? `<ul class="sub">${subs}</ul>` : ''}</li>`
        }
        return `<li>${richHtml(i)}</li>`
      }
      return `<${tag}${attr}${plain}>${(b.items || []).map(li).join('')}</${tag}>`
    }
    case 'terms':
      return `<table class="terms">${(b.rows || [])
        .map((r) => `<tr><th>${esc(r.label)}</th><td>${(r.blocks || []).map(blockToHtml).join('')}</td></tr>`)
        .join('')}</table>`
    case 'comp': {
      // The compensation table stays EDITABLE (the amounts can be hand-tweaked). Its source look —
      // grey header, grey bold emphasis rows, italic notes — is carried on INLINE styles as well as
      // the CSS classes, because an edited letter's PDF is built by html-to-pdfmake, which ignores our
      // classes but honours inline background-color / font-weight / text-align / font-style. So edits
      // survive AND it matches the source. Important Points live inside the table as full-width rows.
      const EMPH = 'background-color:#D9D9D9;font-weight:bold'
      const noteRows = (b.notes || []).length
        ? `<tr class="np"><td colspan="2"><u><strong>Important Points</strong></u></td></tr>` +
          b.notes.map((n) => `<tr class="ni"><td colspan="2" style="font-style:italic">${esc(n)}</td></tr>`).join('')
        : ''
      const rowHtml = (r) => {
        const l = r.emphasis ? ` style="${EMPH}"` : ''
        const v = r.emphasis ? ` style="${EMPH};text-align:right"` : ` style="text-align:right"`
        return `<tr class="${r.emphasis ? 'em' : ''}"><td${l}>${esc(r.label)}</td><td class="r"${v}>${esc(r.value)}</td></tr>`
      }
      return `<table class="comp">`
        + `<thead><tr><th style="background-color:#D9D9D9;font-weight:bold">Component</th>`
        + `<th class="r" style="background-color:#D9D9D9;font-weight:bold;text-align:right">INR</th></tr></thead>`
        + `<tbody>${(b.rows || []).map(rowHtml).join('')}${noteRows}</tbody></table>`
    }
    case 'table': {
      const al = (i) => (b.align?.[i] === 'right' ? ' class="r"' : b.align?.[i] === 'center' ? ' class="c"' : '')
      const head = (b.columns || []).map((c, i) => `<th${al(i)}>${esc(c)}</th>`).join('')
      const body = (b.rows || [])
        .map((r) => `<tr>${(r || []).map((cell, i) => `<td${al(i)}>${esc(cell)}</td>`).join('')}</tr>`)
        .join('')
      return `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
    }
    case 'script': {
      // The real handwritten sign where we hold the artwork; Great Vibes stand-in otherwise.
      // Explicit height so html-to-pdfmake (edited letters) sizes it the same as the CSS.
      const img = signImageFor(b.text)
      if (img) return `<p class="script"><img src="${img}" alt="${esc(b.text)}" height="30" style="height:30px"/></p>`
      return `<p class="script">${esc(b.text)}</p>`
    }
    case 'signature': {
      // Laid out exactly as the source contracts set it: per column, with a gap between — the
      // handwritten sign sits just above a rule that is SEPARATE per column (never joined), and
      // under the rule the role and "NAME: <name>", both bold. Structurally a borderless three-cell
      // table (signer | gap | signer): the two outer cells carry the rule (their bottom border), the
      // middle cell is the gap. The on-screen editor and the email render this HTML directly (see the
      // .doc-html table.sig CSS). The edited-letter PDF is built by html-to-pdfmake, which cannot
      // reproduce this faithfully — so the signature's data rides along in data-pdfmake (`__sig`) and
      // pdfDocument.js rebuilds it there with the SAME builder the fresh PDF uses, keeping the two
      // pixel-identical.
      const head = b.heading
        ? `<div class="sighd" style="${b.heading_align === 'right' ? 'text-align:right;' : ''}font-weight:700">${esc(b.heading)}</div>`
        : ''
      const cols = b.columns || []
      const scrCell = (c) => {
        const img = c.script ? signImageFor(c.script) : null
        if (img) return `<div class="scr"><img src="${img}" alt="${esc(c.script)}" height="28" style="height:28px"/></div>`
        return c.script ? `<div class="scr">${esc(c.script)}</div>` : '&nbsp;'
      }
      const ruleCells = cols.map((c) => `<td class="sigrule">${scrCell(c)}</td>`).join('<td class="siggap"></td>')
      const lblCells = cols.map((c) => `<td class="siglbl">${sigCaptionLines(c).map(esc).join('<br>')}</td>`).join('<td class="siggap"></td>')
      // __sig carries the raw columns (label/name/script/title, not the huge signature image) so the
      // PDF path rebuilds the strip from data rather than from this HTML.
      const sigData = esc(JSON.stringify({ __sig: cols }))
      // contenteditable=false: the signature is a structural, auto-filled block rebuilt from data in
      // the PDF, so editing inside it (an accidental Enter) can only corrupt it — protect it as a
      // non-editable island; the surrounding letter stays fully editable.
      return `${head}<table class="sig" contenteditable="false" data-pdfmake="${sigData}" style="width:100%"><tbody>`
        + `<tr>${ruleCells}</tr><tr>${lblCells}</tr></tbody></table>`
    }
    case 'row':
      // Two stacks level with each other (the salutation on the left, the reference/date on the
      // right), as the source letters set them. A borderless two-cell TABLE, not flex divs: an edited
      // letter's PDF is built by html-to-pdfmake, which cannot do flexbox — a flex row collapsed into
      // a single stacked column, dropping the date below the address. As a table it stays two columns
      // everywhere; pdfDocument widens the left cell so the right one sits at the right edge.
      // The row data rides in data-pdfmake (__row): the on-screen editor and email render this table
      // via CSS, but an edited letter's PDF rebuilds the row from __row with the same blockToPdf the
      // fresh PDF uses (pdfDocument) — html-to-pdfmake cannot be made to place the reference/date
      // stack at the right edge without borders reliably, so the PDF sidesteps it entirely.
      return `<table class="drow" contenteditable="false" data-pdfmake="${esc(JSON.stringify({ __row: { left: b.left || [], right: b.right || [] } }))}" style="width:100%"><tbody><tr>`
        + `<td class="dl">${(b.left || []).map(blockToHtml).join('')}</td>`
        + `<td class="dr">${(b.right || []).map(blockToHtml).join('')}</td>`
        + `</tr></tbody></table>`
    case 'space':
      return `<div style="height:${Number(b.points) || 40}px"></div>`
    case 'divider':
      return '<div class="pb"></div>'
    default:
      return ''
  }
}

// The document body as HTML — the manual edit wins, else the generated blocks, else plain content.
export function documentBodyHtml(doc) {
  if (doc.content_html) return doc.content_html
  if (doc.blocks && doc.blocks.length) return doc.blocks.map(blockToHtml).join('')
  return `<pre>${esc(doc.content)}</pre>`
}

// Strip anything executable before persisting/printing editor HTML (internal tool, but never store
// scripts or inline event handlers).
export function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>]*\2/gi, '$1="#"')
}
