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
  const fonts = ['Regular:400:normal', 'Bold:700:normal', 'Italic:400:italic', 'BoldItalic:700:italic']
    .map((spec) => {
      const [file, weight, style] = spec.split(':')
      const range = weight === '700' ? '600 900' : '100 500'
      return `@font-face{ font-family:'Exo2'; src:url('${location.origin}/fonts/Exo2-${file}.ttf') format('truetype'); font-weight:${range}; font-style:${style}; }`
    })
    .join('\n  ') + '\n  ' + script

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(doc.title || 'Document')}</title>
<style>
  ${fonts}
  @page { size: A4; margin: 31mm 19mm 17mm 19mm; }
  *{ box-sizing:border-box; }
  body{ font-family:'Exo2','Segoe UI',Arial,sans-serif; color:#1f2430; font-size:10.5pt; line-height:1.5; margin:0; }
  ${chromeCss('print')}

  h1{ font-size:11.5pt; font-weight:600; text-align:center; margin:14px 0 8px; }
  h2{ font-size:10.5pt; font-weight:600; margin:12px 0 6px; }
  h3{ font-size:10.5pt; text-align:center; font-weight:600; margin:8px 0; }
  h1.ul,h2.ul,h3.ul{ text-decoration:underline; text-underline-offset:3px; }
  u{ text-decoration:underline; }
  p{ margin:7px 0; text-align:left; }
  p.clause{ padding-left:2em; text-indent:-2em; }
  p.muted{ color:#4b5563; }
  p.right{ text-align:right; ${doc.entity === 'AEZ' ? '' : 'color:#538135;'} font-weight:600; margin:1px 0; }
  ol,ul{ margin:6px 0; padding-left:24px; } li{ margin:3px 0; text-align:left; padding-left:4px; }
  ul.sub{ list-style:circle; margin:3px 0; padding-left:20px; }
  ul.plain{ list-style:none; padding-left:12px; } ul.plain li{ padding-left:2em; text-indent:-2em; }
  strong{ font-weight:600; }

  table{ border-collapse:collapse; width:100%; margin:10px 0; font-size:9.5pt; break-inside:avoid; }
  table.terms th{ width:38mm; background:#f4f6f9; text-align:left; vertical-align:top; font-weight:600; }
  table.terms th,table.terms td{ border:0.5pt solid #333; padding:4px 7px; vertical-align:top; }
  table.terms p{ margin:4px 0; } table.terms ol,table.terms ul{ margin:4px 0; }
  table.grid{ width:100%; border-collapse:collapse; margin:6px 0; }
  table.grid th{ background:#e9eef5; font-weight:600; }
  table.grid th,table.grid td{ border:0.5pt solid #333; padding:4px 7px; vertical-align:top; text-align:left; }
  table.grid .r{ text-align:right; } table.grid .c{ text-align:center; }
  table.comp{ border:0.5pt solid #333; }
  table.comp th{ background:#D9D9D9; font-weight:600; }
  table.comp th,table.comp td{ border:0.5pt solid #333; padding:2px 7px; }
  table.comp .r{ text-align:right; } table.comp tr.em{ font-weight:600; background:#D9D9D9; }
  table.comp tr.ni td{ font-style:italic; font-size:8.5pt; }

  p.script,.sig .scr{ font-family:'Great Vibes',cursive; font-size:20pt; line-height:1.1; margin:2px 0; }
  p.script img{ height:30px; width:auto; }
  /* The salutation and the date level with each other (borderless two-cell table — see docHtml.js). */
  table.drow{ width:100%; border:0; border-collapse:collapse; margin:0; table-layout:auto; }
  table.drow td{ border:0; padding:0; vertical-align:top; }
  table.drow td.dr{ text-align:right; white-space:nowrap; width:1%; padding-left:16px; }
  table.drow p{ margin:0 0 4px; }
  .sighd{ font-weight:700; margin:20px 0 2px; }
  /* Signature: two columns with a gap, a rule PER column (signer | gap | signer — the outer cells'
     bottom border is the rule), the handwritten sign above its rule, role + "NAME: <name>" bold
     under it. Matches the source contracts and the on-screen editor. */
  table.sig{ width:100%; border:0; border-collapse:collapse; margin-top:6px; break-inside:avoid; table-layout:fixed; }
  table.sig td{ border:0; padding:0; }
  table.sig td.siggap{ width:24pt; }
  table.sig td.sigrule{ border-bottom:0.75pt solid #000; height:34pt; vertical-align:bottom; padding-bottom:2pt; }
  table.sig td.siglbl{ font-weight:700; color:#1f2937; font-size:9pt; line-height:1.35; vertical-align:top; padding-top:4pt; }
  table.sig .scr{ font-family:'Great Vibes',cursive; font-size:20pt; line-height:1; text-transform:none; }
  table.sig .scr img{ height:28px; }

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
