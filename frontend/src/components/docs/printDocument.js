/** Render a document (structured blocks) as a letterhead page in a print window, so HR can save
 *  it as a PDF that matches the source templates: Poppins body, full letterhead (logo, ISO
 *  badges, address with pin/globe chips) and the colored edge bars, all repeating per page.
 *  The chrome itself lives in letterhead.js, shared with the on-screen preview. */

import { esc, documentBodyHtml } from './docHtml'
import { letterheadHtml, accentsHtml, chromeCss } from './letterhead'

export function printDocument(doc) {
  const body = documentBodyHtml(doc)

  // Self-hosted Poppins; absolute URLs because the print window is a fresh about:blank document.
  const script = `@font-face{ font-family:'Great Vibes'; src:url('${location.origin}/fonts/GreatVibes-Regular.ttf') format('truetype'); }`
  const fonts = ['Regular:400:normal', 'SemiBold:600:normal', 'Italic:400:italic', 'SemiBoldItalic:600:italic']
    .map((spec) => {
      const [file, weight, style] = spec.split(':')
      const range = weight === '600' ? '600 800' : '100 500'
      return `@font-face{ font-family:'Poppins'; src:url('${location.origin}/fonts/Poppins-${file}.ttf') format('truetype'); font-weight:${range}; font-style:${style}; }`
    })
    .join('\n  ') + '\n  ' + script

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(doc.title || 'Document')}</title>
<style>
  ${fonts}
  @page { size: A4; margin: 31mm 19mm 17mm 19mm; }
  *{ box-sizing:border-box; }
  body{ font-family:Poppins,'Segoe UI',Arial,sans-serif; color:#1f2430; font-size:10.5pt; line-height:1.5; margin:0; }
  ${chromeCss('print')}

  h1{ font-size:11.5pt; font-weight:600; text-align:center; text-transform:uppercase; letter-spacing:.6px; margin:14px 0 8px; }
  h2{ font-size:10.5pt; font-weight:600; text-transform:uppercase; margin:12px 0 6px; }
  h3{ font-size:10.5pt; text-align:center; font-weight:600; margin:8px 0; }
  h1.ul,h2.ul,h3.ul{ text-decoration:underline; text-underline-offset:3px; }
  u{ text-decoration:underline; }
  p{ margin:7px 0; text-align:left; }
  p.clause{ padding-left:2em; text-indent:-2em; }
  p.muted{ color:#4b5563; }
  p.right{ text-align:right; color:#2e7d5b; font-weight:600; margin:1px 0; }
  ol,ul{ margin:6px 0; padding-left:24px; } li{ margin:3px 0; text-align:left; padding-left:4px; }
  strong{ font-weight:600; }

  table{ border-collapse:collapse; width:100%; margin:10px 0; font-size:9.5pt; break-inside:avoid; }
  table.terms th{ width:42mm; background:#f4f6f9; text-align:left; vertical-align:top; font-weight:600; }
  table.terms th,table.terms td{ border:1px solid #9aa7b8; padding:6px 8px; vertical-align:top; }
  table.terms p{ margin:4px 0; } table.terms ol,table.terms ul{ margin:4px 0; }
  table.grid{ width:100%; border-collapse:collapse; margin:6px 0; }
  table.grid th{ background:#e9eef5; font-weight:600; }
  table.grid th,table.grid td{ border:1px solid #9aa7b8; padding:5px 8px; vertical-align:top; text-align:left; }
  table.grid .r{ text-align:right; } table.grid .c{ text-align:center; }
  table.comp th{ background:#e9eef5; }
  table.comp th,table.comp td{ border:1px solid #9aa7b8; padding:5px 8px; }
  table.comp .r{ text-align:right; } table.comp tr.em{ font-weight:600; background:#f4f6f9; }
  .notes{ border:1px solid #cbd5e1; background:#f8fafc; padding:7px 10px; margin:6px 0; }
  .notes .nt{ font-weight:600; font-size:7pt; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; margin-bottom:3px; }
  .notes ul{ font-size:8pt; color:#4b5563; margin:0; padding-left:16px; }

  p.script,.sig .scr{ font-family:'Great Vibes',cursive; font-size:20pt; line-height:1.1; margin:2px 0; }
  .sig{ display:flex; gap:48px; margin-top:22px; break-inside:avoid; }
  .sig .col{ min-width:62mm; } .sig .line{ border-bottom:1px solid #475569; height:24px; padding-left:2px; }
  .sig .lbl{ font-size:7.5pt; text-transform:uppercase; font-weight:600; color:#475569; margin-top:3px; }

  .pb{ break-after:page; height:0; } /* a divider in the source starts a new schedule on its own page */
  pre{ white-space:pre-wrap; font-family:inherit; }
  main{ position:relative; }
  @media screen{ body{ background:#f1f5f9; } main{ background:#fff; max-width:210mm; margin:8mm auto; padding:31mm 19mm 17mm; min-height:297mm; box-shadow:0 2px 16px rgba(0,0,0,.12); position:relative; } }
</style></head>
<body>
  ${letterheadHtml(doc.entity, doc.brandName)}
  ${accentsHtml()}
  <main>${body}</main>
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  return true
}
