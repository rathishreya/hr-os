/** Render a document (structured blocks) as an EZ Lab–letterhead page in a print window, so HR
 *  can save it as a PDF that matches the original templates (logo, ISO badges, address, accents). */

import { richSegments } from './rich'

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Escape + apply inline **bold** / __underline__ marks.
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

// Letterhead text per legal entity.
const ENTITY = {
  EZ: { name: 'EZ Lab Private Limited', addr: 'Technology and Innovation Hub: EZ, Sector-62, Gurugram, Haryana - 122102. INDIA', web: 'www.ez.works' },
  AEZ: { name: 'AEZ Private Limited', addr: 'Sector-62, Gurugram, Haryana, INDIA', web: 'www.ez.works' },
}

// EZ Lab logo mark + wordmark (SVG approximation of the brand logo).
const LOGO = `
<svg width="156" height="46" viewBox="0 0 156 46" xmlns="http://www.w3.org/2000/svg" aria-label="EZ Lab">
  <rect x="2" y="7" width="34" height="32" rx="8" fill="none" stroke="#6ba43a" stroke-width="2.4"/>
  <text x="19" y="30" font-family="Arial, sans-serif" font-weight="800" font-size="17" fill="#6ba43a" text-anchor="middle">EZ</text>
  <text x="44" y="22" font-family="Arial, sans-serif" font-weight="800" font-size="16" fill="#4b7a2c">EZ Lab</text>
  <text x="44" y="38" font-family="Arial, sans-serif" font-weight="600" font-size="11" fill="#6b7280">Private Limited</text>
</svg>`

const PIN = `<svg width="11" height="11" viewBox="0 0 24 24" fill="#84202f"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z"/></svg>`
const GLOBE = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1f3b5c" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>`

function strong(text, prefix) {
  if (prefix && String(text).startsWith(prefix)) return `<strong>${esc(prefix)}</strong>${richHtml(String(text).slice(prefix.length))}`
  if (prefix && !text) return `<strong>${esc(prefix)}</strong>`
  if (prefix) return `<strong>${esc(prefix)}: </strong>${richHtml(text)}`
  return richHtml(text)
}

function blockToHtml(b) {
  switch (b.type) {
    case 'heading':
      return `<h${b.level || 2} class="${b.underline ? 'ul' : ''}">${esc(b.text)}</h${b.level || 2}>`
    case 'para':
      return `<p class="${b.muted ? 'muted' : ''} ${b.align === 'right' ? 'right' : ''}">${strong(b.text, b.strong_prefix)}</p>`
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul'
      return `<${tag}>${(b.items || []).map((i) => `<li>${richHtml(i)}</li>`).join('')}</${tag}>`
    }
    case 'terms':
      return `<table class="terms">${(b.rows || [])
        .map((r) => `<tr><th>${esc(r.label)}</th><td>${(r.blocks || []).map(blockToHtml).join('')}</td></tr>`)
        .join('')}</table>`
    case 'comp':
      return (
        `<table class="comp"><thead><tr><th>Component</th><th class="r">INR</th></tr></thead><tbody>${(b.rows || [])
          .map((r) => `<tr class="${r.emphasis ? 'em' : ''}"><td>${esc(r.label)}</td><td class="r">${esc(r.value)}</td></tr>`)
          .join('')}</tbody></table>` +
        ((b.notes || []).length
          ? `<div class="notes"><div class="nt">Important points</div><ul>${b.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`
          : '')
      )
    case 'signature':
      return `<div class="sig">${(b.columns || [])
        .map((c) => `<div class="col"><div class="line">${esc(c.name)}</div><div class="lbl">${esc(c.label)}</div></div>`)
        .join('')}</div>`
    case 'divider':
      return '<div class="pb"></div>'
    default:
      return ''
  }
}

export function printDocument(doc) {
  const e = ENTITY[doc.entity] || ENTITY.EZ
  const body = doc.blocks && doc.blocks.length ? doc.blocks.map(blockToHtml).join('') : `<pre>${esc(doc.content)}</pre>`

  const head = `
    <div class="lh">
      <div class="lh-l">
        ${LOGO}
        <div class="iso">ISO 27001:2022<br/>ISO 9001:2015</div>
      </div>
      <div class="lh-r">
        <div class="co">${esc(e.name)}</div>
        <div class="ad">${PIN} ${esc(e.addr)}</div>
        <div class="ad">${GLOBE} ${esc(e.web)}</div>
      </div>
    </div>`

  const accents = `
    <div class="edge edge-r"><span class="seg navy"></span><span class="seg maroon"></span><span class="seg navy sm"></span></div>
    <div class="edge edge-l"><span class="dot"></span><span class="dot mid"></span></div>
    <div class="corner"><span class="c-gold"></span><span class="c-maroon"></span></div>`

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(doc.title || 'Document')}</title>
<style>
  @page { size: A4; margin: 30mm 16mm 16mm 16mm; }
  *{ box-sizing:border-box; }
  body{ font-family:Georgia,'Times New Roman',serif; color:#1f2937; font-size:11.5px; line-height:1.5; margin:0; }

  /* Letterhead — repeats on every printed page (fixed sits in the top page margin). */
  .lh{ position:fixed; top:0; left:0; right:0; height:26mm; padding:5mm 16mm 0; display:flex; justify-content:space-between; align-items:flex-start; }
  .lh-l{ display:flex; flex-direction:column; gap:3px; }
  .iso{ font-family:Arial,sans-serif; font-weight:700; font-size:8.5px; letter-spacing:1px; color:#374151; }
  .lh-r{ text-align:right; }
  .lh-r .co{ font-family:Arial,sans-serif; font-weight:700; font-size:11px; color:#111827; }
  .lh-r .ad{ font-family:Arial,sans-serif; font-size:8.5px; color:#374151; margin-top:2px; display:flex; gap:4px; justify-content:flex-end; align-items:center; }

  /* Decorative brand accents at the page edges (repeat each page). */
  .edge{ position:fixed; top:0; bottom:0; width:5mm; }
  .edge-r{ right:0; } .edge-l{ left:0; }
  .edge .seg{ position:absolute; right:0; width:5mm; }
  .seg.navy{ top:34mm; height:34mm; background:#1f3b5c; }
  .seg.maroon{ top:78mm; height:30mm; background:#84202f; }
  .seg.navy.sm{ top:150mm; height:24mm; background:#1f3b5c; }
  .edge-l .dot{ position:absolute; left:2.4mm; width:3mm; height:3mm; background:#1f3b5c; }
  .edge-l .dot{ top:70mm; } .edge-l .dot.mid{ top:150mm; }
  .corner{ position:fixed; left:0; bottom:0; }
  .c-gold{ position:fixed; left:0; bottom:18mm; width:5mm; height:26mm; background:#efa31d; }
  .c-maroon{ position:fixed; left:0; bottom:0; width:5mm; height:18mm; background:#84202f; }

  h1{ font-size:14px; text-align:center; text-transform:uppercase; letter-spacing:.6px; margin:14px 0 8px; }
  h2{ font-size:12.5px; font-weight:700; text-transform:uppercase; margin:12px 0 6px; }
  h3{ font-size:12px; text-align:center; font-weight:700; margin:8px 0; }
  h1.ul,h2.ul,h3.ul{ text-decoration:underline; text-underline-offset:3px; }
  u{ text-decoration:underline; }
  p{ margin:7px 0; text-align:justify; }
  p.muted{ color:#4b5563; }
  p.right{ text-align:right; color:#2e7d5b; font-weight:600; margin:1px 0; }
  ol,ul{ margin:6px 0; padding-left:20px; } li{ margin:3px 0; text-align:justify; }
  strong{ font-weight:700; }

  table{ border-collapse:collapse; width:100%; margin:10px 0; font-size:11px; break-inside:avoid; }
  table.terms th{ width:42mm; background:#f4f6f9; text-align:left; vertical-align:top; font-weight:700; }
  table.terms th,table.terms td{ border:1px solid #9aa7b8; padding:6px 8px; vertical-align:top; }
  table.terms p{ margin:4px 0; } table.terms ol,table.terms ul{ margin:4px 0; }
  table.comp th{ background:#e9eef5; }
  table.comp th,table.comp td{ border:1px solid #9aa7b8; padding:5px 8px; }
  table.comp .r{ text-align:right; } table.comp tr.em{ font-weight:700; background:#f4f6f9; }
  .notes{ border:1px solid #cbd5e1; background:#f8fafc; padding:7px 10px; margin:6px 0; }
  .notes .nt{ font-family:Arial,sans-serif; font-weight:700; font-size:8.5px; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; margin-bottom:3px; }
  .notes ul{ font-size:9.5px; color:#4b5563; margin:0; padding-left:16px; }

  .sig{ display:flex; gap:48px; margin-top:22px; break-inside:avoid; }
  .sig .col{ min-width:62mm; } .sig .line{ border-bottom:1px solid #475569; height:24px; padding-left:2px; }
  .sig .lbl{ font-family:Arial,sans-serif; font-size:9px; text-transform:uppercase; font-weight:700; color:#475569; margin-top:3px; }

  .pb{ break-after:page; height:0; } /* a divider in the source starts a new schedule on its own page */
  pre{ white-space:pre-wrap; font-family:inherit; }
  main{ position:relative; }
  @media screen{ body{ background:#f1f5f9; } main{ background:#fff; max-width:210mm; margin:8mm auto; padding:30mm 16mm 16mm; min-height:297mm; box-shadow:0 2px 16px rgba(0,0,0,.12); position:relative; } }
</style></head>
<body>
  ${head}
  ${accents}
  <main>${body}</main>
  <script>window.onload=function(){setTimeout(function(){window.print()},120)}</script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  return true
}
