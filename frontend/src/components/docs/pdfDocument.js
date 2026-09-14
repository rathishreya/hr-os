/** Build the document as a real PDF (vector text, selectable and searchable) so it can be
 *  attached to the covering email.
 *
 *  Built from the same `blocks` the on-screen preview and the print window render, rather than by
 *  screenshotting the page — a rasterised 13-page contract would be several megabytes and its text
 *  un-selectable, which is not something to email a candidate as a legal document.
 *
 *  pdfmake is ~1.9MB, so it is imported dynamically: it is fetched the first time someone emails a
 *  document and never on initial page load.
 */
import { richSegments } from './rich'
import { ENTITY, C, logoImage } from './letterhead'
import { signImageFor } from './signatureAssets'
import { sigCaptionLines } from './docHtml'

// ── Poppins, embedded so the attached PDF sets the same face as the preview and print paths.
// Fetched once from the app's own /fonts (they ship in the build) and cached; if the fetch
// fails the PDF falls back to pdfmake's bundled Roboto rather than failing the send.
let poppinsVfs = null
async function loadPoppins() {
  if (poppinsVfs) return poppinsVfs
  const files = ['Exo2-Regular', 'Exo2-Bold', 'Exo2-Italic', 'Exo2-BoldItalic', 'GreatVibes-Regular']
  const entries = await Promise.all(files.map(async (n) => {
    const res = await fetch(`/fonts/${n}.ttf`)
    if (!res.ok) throw new Error(`font ${n}: HTTP ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
    return [`${n}.ttf`, btoa(bin)]
  }))
  poppinsVfs = Object.fromEntries(entries)
  return poppinsVfs
}

const MM = 2.8346 // mm -> pt
const PAGE_W = 595.28
const PAGE_H = 841.89

const NAVY = '#1f3b5c'
const INK = '#1f2937'
const MUTED = '#6b7280'
const RULE = '#333333'

/** Inline **bold** / __underline__ markers become pdfmake text runs. */
function runs(text, base = {}) {
  const segs = richSegments(String(text ?? ''))
  if (segs.length === 1 && !segs[0].bold && !segs[0].underline) return { text: segs[0].text, ...base }
  return {
    text: segs.map((s) => ({ text: s.text, bold: !!s.bold, decoration: s.underline ? 'underline' : undefined })),
    ...base,
  }
}

function headingStyle(level) {
  if (level === 1) return { fontSize: 11.5, bold: true, alignment: 'center', margin: [0, 10, 0, 6], characterSpacing: 0.4 }
  if (level === 3) return { fontSize: 10.5, bold: true, alignment: 'center', margin: [0, 6, 0, 5] }
  return { fontSize: 10.5, bold: true, margin: [0, 8, 0, 4] }
}

// EZ documents set the right-aligned Reference/Date meta in green (Word Green Accent-6 D25),
// ArabEasy ones in ink. Set per build; rendering is sequential so a module flag is safe.
let metaGreen = false

// ── Signature strip, laid out exactly as the source contracts set it (see the rendered source
// PDFs): "Signed in the presence of:" then, per column with a gap between them — a signing zone
// that carries the handwritten sign at its foot (blank paper to sign on otherwise), a rule PER
// column (never one rule joined across both), and UNDER the rule the caption lines (role / "NAME:…",
// plus Title/Date for signatory blocks — see sigCaptionLines in docHtml.js). The single builder below
// is shared by the freshly generated PDF (blockToPdf) and the edited-letter PDF, so they are identical.
function signatureToPdf(b) {
  const cols = b.columns || []
  // A pdfmake TABLE, not columns: cells in a row share one height, so every rule lands on exactly the
  // same line no matter what sits above it (a tall handwritten sign on one side, blank paper on the
  // other). The rule is each signer cell's bottom border; the middle gap cell has none, so the two
  // rules are separate with a gap between — as the source sets them. defaultBorder:false means only
  // those explicit bottom borders draw.
  const GAP = 34
  const zoneRow = []
  const lblRow = []
  const widths = []
  cols.forEach((c, idx) => {
    if (idx > 0) {
      zoneRow.push({ text: '', border: [false, false, false, false] })
      lblRow.push({ text: '' })
      widths.push(GAP)
    }
    widths.push('*')
    const img = c.script ? signImageFor(c.script) : null
    const sign = c.script
      ? (img ? { image: img, fit: [150, 28] } : { text: c.script, font: 'GreatVibes', fontSize: 20, lineHeight: 1 })
      : { text: ' ', fontSize: 1 }
    // Signing room above the sign, then the rule (the cell's bottom border). Kept compact so a
    // signature at the end of a letter fits in the space left on the current page instead of forcing
    // a near-empty extra page — while still leaving room to sign.
    zoneRow.push({ stack: [sign], margin: [0, 14, 0, 2], border: [false, false, false, true] })
    // The caption lines under the rule (role / "NAME: …" — plus Title/Date for signatory blocks),
    // shared with the editor and email so all three read identically.
    lblRow.push({
      margin: [0, 5, 0, 0],
      stack: sigCaptionLines(c).map((text, i) => ({ text, bold: true, fontSize: 9.5, color: INK, margin: [0, i ? 1 : 0, 0, 0] })),
    })
  })
  return {
    unbreakable: true, // heading + rules can never split across a page
    stack: [
      ...(b.heading
        ? [{ text: b.heading, bold: true, fontSize: 10.5, alignment: b.heading_align || 'left', margin: [0, 10, 0, 6] }]
        : []),
      {
        table: { widths, body: [zoneRow, lblRow] },
        layout: {
          defaultBorder: false,
          hLineWidth: () => 0.7,
          hLineColor: () => '#000000',
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 6],
      },
    ],
  }
}

/** One document block -> pdfmake content node(s). Mirrors DocumentBlocks.jsx case for case. */
function blockToPdf(b) {
  switch (b?.type) {
    case 'heading': {
      const node = runs(b.text || '', headingStyle(b.level))
      if (b.underline) node.decoration = 'underline'
      return node
    }
    case 'para': {
      const prefix = b.strong_prefix
      const text = b.text || ''
      const style = {
        fontSize: 10.5,
        alignment: b.align === 'right' ? 'right' : 'left',
        color: b.align === 'right' && metaGreen ? '#538135' : b.muted ? MUTED : INK,
        margin: [0, 0, 0, 5],
        lineHeight: 1.25,
      }
      const body = prefix && !text.startsWith(prefix)
        ? { text: [{ text: `${prefix}: `, bold: true }, ...[].concat(runs(text).text ?? runs(text))] }
        : runs(text)

      // A numbered clause hangs: pdfmake has no text-indent, so the number goes in its own
      // fixed column and the body wraps against it. Matches the CSS hanging indent elsewhere.
      const clause = /^\s*(\d{1,2}(?:\.\d+)?[.)]?)\s+([\s\S]*)$/.exec(prefix || text)
      if (clause && !b.align) {
        const [, marker, rest] = clause
        const inner = prefix
          ? { text: [{ text: `${prefix.replace(/^\s*\d{1,2}(?:\.\d+)?[.)]?\s+/, '')}: `, bold: true }, ...[].concat(runs(text).text ?? runs(text))] }
          : runs(rest)
        return {
          columns: [
            { width: 24, text: marker, fontSize: 10.5, color: b.muted ? MUTED : INK },
            { width: '*', ...inner, fontSize: 10.5, color: b.muted ? MUTED : INK, alignment: 'left', lineHeight: 1.25 },
          ],
          columnGap: 0,
          margin: [0, 0, 0, 5],
        }
      }
      return { ...body, ...style }
    }
    case 'list': {
      const items = b.items || []
      const MARK = /^(\s*\(?[A-Za-z0-9]{1,5}[.)])\s+([\s\S]*)$/
      // Self-marked items render without bullets, marker hanging in its own column, as the
      // sources set them.
      if (!b.ordered && items.length && items.every((i) => MARK.test(String(i)))) {
        return {
          stack: items.map((i) => {
            const [, marker, rest] = MARK.exec(String(i))
            return {
              columns: [
                { width: 26, text: marker.trim(), fontSize: 10.5, color: INK },
                { width: '*', ...runs(rest), fontSize: 10.5, color: INK, alignment: 'left', lineHeight: 1.25 },
              ],
              columnGap: 4,
              margin: [10, 0, 0, 3],
            }
          }),
          margin: [0, 0, 0, 4],
        }
      }
      return {
        // An item may be {text, subs}: a bullet carrying its own indented second level, the way
        // the source letters set the brand list under "for the following brands:".
        [b.ordered ? 'ol' : 'ul']: items.map((i) => (
          i && typeof i === 'object'
            ? {
                stack: [
                  runs(i.text || ''),
                  ...((i.subs || []).length
                    ? [{ ul: (i.subs || []).map((s) => runs(s)), type: 'circle', margin: [6, 2, 0, 0] }]
                    : []),
                ],
              }
            : runs(i)
        )),
        ...(b.ordered && b.start ? { start: Number(b.start) } : {}),
        fontSize: 10.5,
        color: INK,
        margin: [8, 0, 0, 6],
        lineHeight: 1.25,
      }
    }
    case 'terms':
      return {
        table: {
          widths: [125, '*'],
          body: (b.rows || []).map((r) => [
            { text: r.label || '', bold: true, fontSize: 9, fillColor: '#f4f6f9', margin: [4, 4, 4, 4] },
            { stack: (r.blocks || []).map(blockToPdf).filter(Boolean), margin: [4, 4, 4, 4] },
          ]),
        },
        layout: { hLineColor: () => RULE, vLineColor: () => RULE, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
        margin: [0, 4, 0, 8],
      }
    case 'comp': {
      const cell = (text, opts = {}) => ({ text, fontSize: 9.5, margin: [4, 1.5, 4, 1.5], ...opts })
      const body = [
        [
          cell('Component', { bold: true, fillColor: '#D9D9D9' }),
          cell('INR', { bold: true, fillColor: '#D9D9D9', alignment: 'right' }),
        ],
        ...(b.rows || []).map((r) => [
          cell(r.label || '', { bold: !!r.emphasis, fillColor: r.emphasis ? '#D9D9D9' : undefined }),
          cell(r.value || '', { bold: !!r.emphasis, fillColor: r.emphasis ? '#D9D9D9' : undefined, alignment: 'right' }),
        ]),
      ]
      // Important Points as full-width italic rows inside the table, as the sources set them.
      if ((b.notes || []).length) {
        body.push([{ ...cell('Important Points', { bold: true, decoration: 'underline' }), colSpan: 2 }, {}])
        for (const n of b.notes) {
          body.push([{ ...cell(n, { italics: true, fontSize: 8.5 }), colSpan: 2 }, {}])
        }
      }
      return {
        // No headerRows: the Important Points and the PPR ratings are rows of this same table, so
        // repeating the header at a page break printed "Component INR" in the middle of the rating
        // list. The source prints the header once.
        table: { widths: ['*', 90], body },
        layout: { hLineColor: () => RULE, vLineColor: () => RULE, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
        margin: [0, 4, 0, 8],
      }
    }
    case 'table':
      return {
        table: {
          headerRows: 1,
          widths: (b.columns || []).map((_, i) => (i === 0 ? '*' : 'auto')),
          body: [
            (b.columns || []).map((c, i) => ({
              text: c, bold: true, fontSize: 8.5, fillColor: '#e9eef5',
              alignment: b.align?.[i] === 'right' ? 'right' : b.align?.[i] === 'center' ? 'center' : 'left',
              margin: [4, 3, 4, 3],
            })),
            ...(b.rows || []).map((row) =>
              (row || []).map((cell, i) => ({
                text: String(cell ?? ''), fontSize: 8.5,
                alignment: b.align?.[i] === 'right' ? 'right' : b.align?.[i] === 'center' ? 'center' : 'left',
                margin: [4, 3, 4, 3],
              })),
            ),
          ],
        },
        layout: { hLineColor: () => RULE, vLineColor: () => RULE, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
        margin: [0, 4, 0, 8],
      }
    case 'script': {
      // The real handwritten sign where we hold the artwork; Great Vibes stand-in otherwise.
      const img = signImageFor(b.text)
      if (img) return { image: img, fit: [110, 30], margin: [0, 4, 0, 2] }
      return { text: b.text || '', font: 'GreatVibes', fontSize: 20, lineHeight: 1, margin: [0, 4, 0, 2] }
    }
    case 'signature':
      return signatureToPdf(b)
    case 'row':
      // Two stacks level with each other, as the source letters set the salutation and the date.
      return {
        columns: [
          { width: '*', stack: (b.left || []).map(blockToPdf).filter(Boolean) },
          { width: 'auto', stack: (b.right || []).map(blockToPdf).filter(Boolean) },
        ],
        columnGap: 16,
      }
    case 'space':
      return { text: ' ', fontSize: 1, margin: [0, 0, 0, Number(b.points) || 40] }
    case 'divider':
      return { text: '', pageBreak: 'after' }
    default:
      return null
  }
}

/** The repeating letterhead drawn on every page. Every element sits at the coordinate the source
 *  PDFs place it at — measured off the originals at 300 DPI (see LH) rather than flowed — so the
 *  block is pin-identical. The preview and print window render the same figures (letterhead.js).
 *
 *  Coordinates are the source page's (596pt wide); right-anchored elements are expressed as an
 *  inset from the right edge so they land identically on our 595.28pt A4.
 */
export const LH = {
  logo: { x: 36, y: 17.8, w: 128.2, h: 26.8 },
  iso: { x: 36, y1: 47.65, y2: 62.7, size: 9.7 },        // ink: x 36.8, w 68.4/61.6, y 49.6 and 64.4
  name: { inset: 53.4, y: 17.72, size: 8.97 },           // ink: right 542.6, w 89.3, y 19.4
  addr: { inset: 52.7, y: 28.5, step: 10.9, size: 9.07 },  // ink: right 543.3, w 332.4, y 31.9
  // ^ two lines now, so the block starts higher than the source's single-line y and each
  //   line is placed on its own baseline rather than left to the wrap engine.
  web: { inset: 52.2, y: 50.68, size: 9.76 },            // ink: right 543.8, w 62.4, y 52.4
  chip: { inset: 20, w: 27, y1: 18.7, h1: 20.4, y2: 46.1, h2: 19.7 },
}

function letterhead(entityKey, brandName) {
  const e = ENTITY[entityKey] || ENTITY.EZ
  // A plain text node ignores `width`, so right-aligned lines are wrapped in a fixed-width
  // column whose right edge lands on the source's inset from the page edge.
  const BOX = 400
  const right = (inset, y, text, size, bold) => ({
    columns: [{ width: BOX, text, fontSize: size, bold: !!bold, color: '#000000', alignment: 'right' }],
    absolutePosition: { x: PAGE_W - inset - BOX, y },
  })
  return () => ({
    stack: [
      { image: logoImage(entityKey, brandName), fit: [LH.logo.w, LH.logo.h], absolutePosition: LH.logo },
      { text: 'ISO 27001:2022', fontSize: LH.iso.size, color: '#000000', absolutePosition: { x: LH.iso.x, y: LH.iso.y1 } },
      { text: 'ISO 9001:2015', fontSize: LH.iso.size, color: '#000000', absolutePosition: { x: LH.iso.x, y: LH.iso.y2 } },
      right(LH.name.inset, LH.name.y, brandName || e.name, LH.name.size, true),
      ...e.addr.map((line, i) => right(LH.addr.inset, LH.addr.y + i * LH.addr.step, line, LH.addr.size)),
      right(LH.web.inset, LH.web.y, e.web, LH.web.size, true),
      { svg: PIN_SVG, width: LH.chip.w, absolutePosition: { x: PAGE_W - LH.chip.inset - LH.chip.w, y: LH.chip.y1 } },
      { svg: GLOBE_SVG, width: LH.chip.w, absolutePosition: { x: PAGE_W - LH.chip.inset - LH.chip.w, y: LH.chip.y2 } },
    ],
  })
}

/** The colored edge accents, drawn on every page behind the content. Geometry measured off the
 *  source pages at 300 DPI: 6.35mm bars in 37.1mm bands, a 0.25mm navy hairline running from the
 *  bars' inner edge to a 2.6mm square. The left side is the exact 180-degree mirror of the right.
 *  letterhead.accentsHtml carries the same figures for the preview and print paths. */
export const ACC = {
  barW: 6.35, band: 37.15, ruleW: 0.15, sqW: 2.6, sqH: 2.5,
  ruleR: [0.4, 216.1], sqRy: 216.1,                   // right: bars from the top, square at the foot
  leftBars: 181.8, ruleL: [77.0, 292.8], sqLy: 74.5,  // left: square at the head, bars at the bottom
  ruleOff: 0.23,  // the hairline sits this far inside the bars' inner edge, running their full length
}

function pageBackground() {
  const R = (mm) => ({ x: PAGE_W - mm * MM })
  const rect = (xMm, yMm, wMm, hMm, color, fromRight) => ({
    type: 'rect',
    x: fromRight ? PAGE_W - (xMm + wMm) * MM : xMm * MM,
    y: yMm * MM, w: wMm * MM, h: hMm * MM, color,
  })
  const { barW, band, ruleW, sqW, sqH, ruleOff } = ACC
  const ruleX = barW + ruleOff              // hairline x, measured in from the page edge
  const sqX = ruleX + ruleW / 2 - sqW / 2   // square centred on the hairline
  void R
  return () => ({
    canvas: [
      // Right edge: yellow → navy → maroon fill the top, then the hairline drops to the square.
      rect(0, 0, barW, band, C.yellow, true),
      rect(0, band, barW, band, C.navy, true),
      rect(0, band * 2, barW, band, C.maroon, true),
      rect(ruleX, ACC.ruleR[0], ruleW, ACC.ruleR[1] - ACC.ruleR[0], C.navy, true),
      rect(sqX, ACC.sqRy, sqW, sqH, C.navy, true),
      // Left edge: the square sits at the top of the hairline, bars fill the bottom.
      rect(sqX, ACC.sqLy, sqW, sqH, C.navy, false),
      rect(ruleX, ACC.ruleL[0], ruleW, ACC.ruleL[1] - ACC.ruleL[0], C.navy, false),
      rect(0, ACC.leftBars, barW, band, C.maroon, false),
      rect(0, ACC.leftBars + band, barW, band, C.navy, false),
      rect(0, ACC.leftBars + band * 2, barW, band, C.yellow, false),
    ],
  })
}

// The two gray pills at the letterhead's right edge, as the sources draw them: rounded on the
// left, running flat into the color bars on the right; the first holds a dark map pin, the
// second is empty. The rect is drawn wider than the viewBox so its right corners fall outside.
const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="27" height="20.4" viewBox="0 0 27 20.4"><rect x="0" y="0" width="37" height="20.4" rx="10.2" fill="#D8D8D8"/><path transform="translate(2.65,1.78) scale(0.71)" d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="#242628"/></svg>`
const GLOBE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="27" height="19.7" viewBox="0 0 27 19.7"><rect x="0" y="0" width="37" height="19.7" rx="9.85" fill="#D8D8D8"/></svg>`

/** html-to-pdfmake reads INLINE styles only — it ignores our `.doc-html` CSS classes. So the meta
 *  lines the editor marks with `class="right"` (Reference / Date) and `class="muted"` would flatten
 *  to plain left-aligned ink in an edited letter's PDF, even though the on-screen editor (which does
 *  read the classes) shows them right-aligned. Copy those class meanings onto the element as inline
 *  styles before conversion, so the edited PDF matches the editor — for HTML saved before the editor
 *  started emitting these inline styles as well as new saves. Browser-only path (uses the DOM). */
function inlineClassStyles(html) {
  try {
    const tpl = document.createElement('template')
    tpl.innerHTML = String(html || '')
    tpl.content.querySelectorAll('.right').forEach((el) => {
      const s = el.getAttribute('style') || ''
      if (!/text-align/i.test(s)) el.style.textAlign = 'right'
      if (!/font-weight/i.test(s)) el.style.fontWeight = '600'
      // EZ meta lines are green as the sources set them; ArabEasy ones stay ink.
      if (metaGreen && !/color/i.test(s)) el.style.color = '#538135'
    })
    tpl.content.querySelectorAll('.muted').forEach((el) => {
      if (!/color/i.test(el.getAttribute('style') || '')) el.style.color = '#6b7280'
    })
    return tpl.innerHTML
  } catch {
    return String(html || '')
  }
}

/** An edited letter's signature is emitted (docHtml.js) as a table carrying its column data in
 *  `data-pdfmake` (`__sig`). html-to-pdfmake cannot reproduce the source's per-column rules and
 *  stacked bold labels — and it drops unknown data-pdfmake keys, so the data cannot ride through it.
 *  So before conversion we pull the signature data out ourselves, swap each signature table for a
 *  text marker html-to-pdfmake will faithfully carry, and afterwards replace the marker with the
 *  strip built by signatureToPdf — the SAME builder the fresh PDF uses, so an edited signature is
 *  pixel-identical to a freshly generated one. Browser-only (uses the DOM). */
const SIG_MARKER = (n) => `@@SIGNATURE_${n}@@`

// Reconstruct the signature columns from a signature element saved in ANY historical shape, so an
// already-edited letter never loses its signature: the current table (columns in data-pdfmake
// `__sig`); the earlier borderless table (names in <th>, labels in <td>); and the original flex
// version (<div class="sig"><div class="col">… with .signm / .lbl / .scr). A handwritten sign is
// carried as its text (the image's alt), which signatureToPdf re-resolves to the artwork.
function sigColsFromElement(el) {
  try {
    const fromData = JSON.parse(el.getAttribute('data-pdfmake') || '{}').__sig
    if (Array.isArray(fromData) && fromData.length) return fromData
  } catch { /* fall through to structural parsing */ }
  const scriptOf = (scope) => {
    const img = scope && scope.querySelector('.scr img')
    if (img) return img.getAttribute('alt') || ''
    const scr = scope && scope.querySelector('.scr')
    return scr && !scr.querySelector('img') ? (scr.textContent || '').trim() : ''
  }
  const txt = (n) => (n ? (n.textContent || '').trim() : '')
  // Earlier borderless table: <thead><th>name</th></thead><tbody><td>label</td></tbody>.
  const ths = [...el.querySelectorAll('thead th')]
  if (ths.length) {
    const tds = [...el.querySelectorAll('tbody td')]
    return ths.map((th, i) => ({ label: txt(tds[i]), name: txt(th.querySelector('.signm')), script: scriptOf(th) }))
  }
  // Original flex version: div.sig > div.col with .signm / .lbl / .scr.
  const flexCols = [...el.querySelectorAll(':scope > .col')]
  if (flexCols.length) {
    return flexCols.map((col) => ({ label: txt(col.querySelector('.lbl')), name: txt(col.querySelector('.signm')), script: scriptOf(col) }))
  }
  return []
}

// Pull the structural blocks html-to-pdfmake can't reproduce (the signature strip and the two-column
// reference/date row) out of the HTML before conversion, leaving a text marker in each one's place;
// pdfDocument rebuilds them from data afterwards with the same builders the fresh PDF uses. Text
// blocks (paragraphs, headings, lists, the Schedule A table) still flow through html-to-pdfmake.
function extractStructured(html) {
  try {
    const tpl = document.createElement('template')
    tpl.innerHTML = String(html || '')
    const items = []
    // Structural blocks html-to-pdfmake can't reproduce from CSS: table.sig / div.sig (signature) and
    // table.drow (reference/date row) — flex/canvas layouts it can't build — plus div.pb (a `divider`
    // page break it ignores, which let Schedule A ride up onto the previous page). Each is rebuilt
    // from data with the same builders the fresh PDF uses. (The compensation table stays editable and
    // renders through html-to-pdfmake via inline styles — see docHtml.js — so it is NOT extracted.)
    tpl.content.querySelectorAll('table.sig, div.sig, table.drow, div.pb').forEach((el) => {
      let item
      if (el.tagName === 'DIV' && el.classList.contains('pb')) {
        item = { kind: 'divider' }
      } else if (el.tagName === 'TABLE' && el.classList.contains('drow')) {
        let row = null
        try { row = JSON.parse(el.getAttribute('data-pdfmake') || '{}').__row } catch { row = null }
        item = { kind: 'row', row }
      } else {
        item = { kind: 'sig', cols: sigColsFromElement(el) }
      }
      const marker = document.createElement('p')
      marker.textContent = SIG_MARKER(items.length)
      el.replaceWith(marker)
      items.push(item)
    })
    return { html: tpl.innerHTML, items }
  } catch {
    return { html: String(html || ''), items: [] }
  }
}

// The plain text of a pdfmake text node, whether it is a string or an array of runs.
const nodeText = (t) => (typeof t === 'string' ? t : Array.isArray(t) ? t.map((r) => (typeof r === 'string' ? r : r?.text || '')).join('') : '')

// Build the pdfmake node for one extracted structural item, with the SAME builders the fresh PDF
// uses — a signature strip, or a reference/date row (blockToPdf handles the 'row' block).
function _buildStructured(item) {
  if (!item) return { text: '' }
  if (item.kind === 'divider') return { text: '', pageBreak: 'after' }
  if (item.kind === 'row') {
    return item.row ? blockToPdf({ type: 'row', left: item.row.left || [], right: item.row.right || [] }) : { text: '' }
  }
  return signatureToPdf({ columns: item.cols || [] })
}

/** pdfmake rejects a table row that has fewer cells than the table has columns ("a cell is
 *  undefined"). That happens when a spanning cell lost its colspan — e.g. the compensation table's
 *  "Important Points" note (one cell meant to span both columns) saved before colspan was allowed
 *  through the sanitiser. Make any short row span the full width so the PDF renders instead of
 *  throwing. A no-op when html-to-pdfmake already produced full-width rows. */
function fixTableColSpans(node) {
  if (Array.isArray(node)) { node.forEach(fixTableColSpans); return }
  if (!node || typeof node !== 'object') return
  const t = node.table
  if (t && Array.isArray(t.body) && t.body.length) {
    // Column count is the widest row's ARRAY length — each entry is one column (a colSpan:N cell is
    // one entry followed by N-1 placeholder entries, so summing colSpans would double-count). A row
    // shorter than that lost a spanning cell's fillers: make its last cell span the gap and pad it.
    let colCount = 0
    t.body.forEach((row) => { if (Array.isArray(row) && row.length > colCount) colCount = row.length })
    t.body.forEach((row) => {
      if (!Array.isArray(row) || !row.length) return
      const deficit = colCount - row.length
      if (deficit > 0) {
        const last = row[row.length - 1]
        if (last && typeof last === 'object') last.colSpan = ((last.colSpan) || 1) + deficit
        for (let k = 0; k < deficit; k += 1) row.push({})
      }
    })
  }
  for (const k of Object.keys(node)) {
    if (node[k] && typeof node[k] === 'object') fixTableColSpans(node[k])
  }
}

function replaceStructuredMarkers(node, items) {
  const RE = /^@@SIGNATURE_(\d+)@@$/
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const el = node[i]
      const m = el && typeof el === 'object' && RE.exec(nodeText(el.text).trim())
      if (m) node[i] = _buildStructured(items[Number(m[1])])
      else replaceStructuredMarkers(el, items)
    }
    return
  }
  if (!node || typeof node !== 'object') return
  for (const k of Object.keys(node)) {
    const v = node[k]
    const m = v && typeof v === 'object' && RE.exec(nodeText(v.text).trim())
    if (m) node[k] = _buildStructured(items[Number(m[1])])
    else if (v && typeof v === 'object') replaceStructuredMarkers(v, items)
  }
}

/** A divider is built as an empty node carrying `pageBreak:'after'`. If that empty node happens to
 *  land at the top of a fresh page (because the block before it filled the previous page), pdfmake
 *  gives it a page to itself — a blank sheet before the next section. Fold each such break onto the
 *  FOLLOWING block as `pageBreak:'before'` and drop the empty node, so the next section still starts
 *  on a new page but no blank page is left behind. Operates on the top-level content array. */
function foldPageBreaks(content) {
  if (!Array.isArray(content)) return
  for (let i = 0; i < content.length; i += 1) {
    const el = content[i]
    const isDivider = el && typeof el === 'object' && el.pageBreak === 'after'
      && (el.text === '' || el.text == null) && !el.table && !el.stack && !el.columns && !el.image && !el.canvas
    if (!isDivider) continue
    const next = content[i + 1]
    if (next && typeof next === 'object') next.pageBreak = 'before'
    content.splice(i, 1)
    i -= 1
  }
}

/** The full pdfmake document definition — one builder shared by the emailed attachment, the
 *  page-by-page preview and any future export, so they cannot diverge. */
async function buildDefinition(doc, bodyFont) {
  metaGreen = doc.entity !== 'AEZ'
  let content
  if (doc.content_html) {
    // A hand-edited letter: its blocks are stale, the edited HTML is the document. Convert it so
    // the preview and the emailed copy carry the edits.
    //
    // html-to-pdfmake applies its OWN heading sizes by default — h1 24pt, h2 22pt, h3 18pt, all
    // left-aligned. Our blocks render headings at 10.5–11.5pt, centered. Without overriding these,
    // simply opening a document in the editor and saving (even with no change) blew every heading
    // up two-to-three times its size and shoved centered titles to the left — the "font increases /
    // formatting breaks every time I edit" bug. These defaultStyles mirror headingStyle() and the
    // block renderers so an edited document renders identically to an un-edited one.
    const { default: htmlToPdfmake } = await import('html-to-pdfmake')
    const { html: structuredHtml, items: structuredItems } = extractStructured(inlineClassStyles(doc.content_html))
    content = htmlToPdfmake(structuredHtml, {
      window,
      defaultStyles: {
        h1: { fontSize: 11.5, bold: true, alignment: 'center', characterSpacing: 0.4, margin: [0, 10, 0, 6] },
        h2: { fontSize: 10.5, bold: true, margin: [0, 8, 0, 4] },
        h3: { fontSize: 10.5, bold: true, alignment: 'center', margin: [0, 6, 0, 5] },
        h4: { fontSize: 10.5, bold: true, margin: [0, 6, 0, 4] },
        h5: { fontSize: 10.5, bold: true, margin: [0, 6, 0, 4] },
        h6: { fontSize: 10.5, bold: true, margin: [0, 6, 0, 4] },
        p: { fontSize: 10.5, margin: [0, 3, 0, 3], lineHeight: 1.3 },
        ul: { fontSize: 10.5, margin: [0, 2, 0, 4] },
        ol: { fontSize: 10.5, margin: [0, 2, 0, 4] },
        li: { fontSize: 10.5, margin: [0, 1, 0, 1], lineHeight: 1.25 },
        table: { fontSize: 9.5, margin: [0, 6, 0, 6] },
        th: { bold: true, fontSize: 9, fillColor: '#f4f6f9', margin: [4, 3, 4, 3] },
        td: { fontSize: 9.5, margin: [4, 2, 4, 2] },
        a: { color: C.ink, decoration: null },
        b: { bold: true },
        strong: { bold: true },
        u: { decoration: 'underline' },
        i: { italics: true },
        em: { italics: true },
      },
    })
    replaceStructuredMarkers(content, structuredItems)
    fixTableColSpans(content)
  } else {
    const blocks = Array.isArray(doc.blocks) ? doc.blocks : []
    content = blocks.length
      ? blocks.map(blockToPdf).filter(Boolean)
      : [{ text: doc.content || '', fontSize: 10.5, lineHeight: 1.3 }]
  }
  foldPageBreaks(content)
  return {
    pageSize: 'A4',
    // 19mm sides / 31mm top / 17mm bottom — the print window's @page box.
    pageMargins: [54, 88, 54, 48],
    header: letterhead(doc.entity, doc.brandName),
    background: pageBackground(),
    info: { title: doc.title || 'Document' },
    defaultStyle: { font: bodyFont, fontSize: 10.5, color: C.ink, lineHeight: 1.3 },
    content,
  }
}

let fontsRegistered = false

async function makePdf(doc) {
  // pdfmake 0.3 API: fonts are registered on the module via addVirtualFileSystem/addFonts
  // (property assignment is ignored), and the output getters return promises.
  const [{ default: pdfMake }, vfsModule] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  const robotoVfs = vfsModule.default?.pdfMake?.vfs || vfsModule.pdfMake?.vfs || vfsModule.default || vfsModule

  let bodyFont = 'Roboto'
  if (!fontsRegistered) {
    pdfMake.addVirtualFileSystem(robotoVfs)
    const ROBOTO = {
      normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf',
    }
    try {
      pdfMake.addVirtualFileSystem(await loadPoppins())
      pdfMake.addFonts({
        Roboto: ROBOTO,
        // Exo 2: the face every source document is set in (user-confirmed).
        Exo2: {
          normal: 'Exo2-Regular.ttf', bold: 'Exo2-Bold.ttf',
          italics: 'Exo2-Italic.ttf', bolditalics: 'Exo2-BoldItalic.ttf',
        },
        GreatVibes: {
          normal: 'GreatVibes-Regular.ttf', bold: 'GreatVibes-Regular.ttf',
          italics: 'GreatVibes-Regular.ttf', bolditalics: 'GreatVibes-Regular.ttf',
        },
      })
    } catch {
      // Font fetch failed: register a set where every referenced family resolves to Roboto, so
      // the render degrades instead of hanging on an unregistered face.
      pdfMake.addFonts({
        Roboto: ROBOTO,
        Exo2: ROBOTO,
        GreatVibes: {
          normal: 'Roboto-Italic.ttf', bold: 'Roboto-Italic.ttf',
          italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-Italic.ttf',
        },
      })
    }
    fontsRegistered = true
  }
  bodyFont = 'Exo2'  // every source document is set in Exo 2; maps to Roboto if unloaded

  return pdfMake.createPdf(await buildDefinition(doc, bodyFont))
}

/** The document as base64 (no data: prefix), for the send-email endpoint. */
export async function documentToPdfBase64(doc) {
  const pdf = await makePdf(doc)
  return pdf.getBase64()
}

/** The document as an object URL, for the page-by-page preview iframe. Caller revokes it. */
export async function documentToPdfBlobUrl(doc) {
  const pdf = await makePdf(doc)
  const blob = await pdf.getBlob()
  return URL.createObjectURL(blob)
}
