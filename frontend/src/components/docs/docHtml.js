// Convert a document's structured `blocks` to the SAME HTML the PDF/print window uses, so the rich
// editor seeds from an exact match of the printed output, and a manually edited `content_html`
// round-trips through preview → editor → PDF unchanged. The on-screen `.doc-html` CSS (index.css)
// and the print CSS (printDocument.js) both style these tags identically.
import { richSegments } from './rich'

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

export function blockToHtml(b) {
  switch (b.type) {
    case 'heading':
      return `<h${b.level || 2} class="${b.underline ? 'ul' : ''}">${esc(b.text)}</h${b.level || 2}>`
    case 'para': {
      const cls = [b.muted && 'muted', b.align === 'right' && 'right', isClause(b) && 'clause']
        .filter(Boolean).join(' ')
      return `<p class="${cls}">${strong(b.text, b.strong_prefix)}</p>`
    }
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul'
      const attr = b.ordered && b.start ? ` start="${Number(b.start)}"` : ''
      return `<${tag}${attr}>${(b.items || []).map((i) => `<li>${richHtml(i)}</li>`).join('')}</${tag}>`
    }
    case 'terms':
      return `<table class="terms">${(b.rows || [])
        .map((r) => `<tr><th>${esc(r.label)}</th><td>${(r.blocks || []).map(blockToHtml).join('')}</td></tr>`)
        .join('')}</table>`
    case 'comp': {
      // Important Points live INSIDE the table as full-width italic rows, as the sources set them.
      const noteRows = (b.notes || []).length
        ? `<tr class="np"><td colspan="2"><u><strong>Important Points</strong></u></td></tr>` +
          b.notes.map((n) => `<tr class="ni"><td colspan="2">${esc(n)}</td></tr>`).join('')
        : ''
      return `<table class="comp"><thead><tr><th>Component</th><th class="r">INR</th></tr></thead><tbody>${(b.rows || [])
        .map((r) => `<tr class="${r.emphasis ? 'em' : ''}"><td>${esc(r.label)}</td><td class="r">${esc(r.value)}</td></tr>`)
        .join('')}${noteRows}</tbody></table>`
    }
    case 'table': {
      const al = (i) => (b.align?.[i] === 'right' ? ' class="r"' : b.align?.[i] === 'center' ? ' class="c"' : '')
      const head = (b.columns || []).map((c, i) => `<th${al(i)}>${esc(c)}</th>`).join('')
      const body = (b.rows || [])
        .map((r) => `<tr>${(r || []).map((cell, i) => `<td${al(i)}>${esc(cell)}</td>`).join('')}</tr>`)
        .join('')
      return `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
    }
    case 'script':
      return `<p class="script">${esc(b.text)}</p>`
    case 'signature':
      return `<div class="sig">${(b.columns || [])
        .map((c) => `<div class="col">${c.script ? `<div class="scr">${esc(c.script)}</div>` : ''}<div class="line">${esc(c.name)}</div><div class="lbl">${esc(c.label)}</div></div>`)
        .join('')}</div>`
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
