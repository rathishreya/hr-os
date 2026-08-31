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
        [b.ordered ? 'ol' : 'ul']: items.map((i) => runs(i)),
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
        table: { widths: ['*', 90], headerRows: 1, body },
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
      return {
        columns: (b.columns || []).map((c) => ({
          width: '*',
          stack: [
            ...(c.script
              ? [signImageFor(c.script)
                  ? { image: signImageFor(c.script), fit: [95, 26], margin: [0, 6, 0, 0] }
                  : { text: c.script, font: 'GreatVibes', fontSize: 17, lineHeight: 1, margin: [0, 6, 0, 0] }]
              : []),
            { text: c.name || ' ', fontSize: 10.5, bold: true, margin: [0, c.script ? 2 : 14, 0, 2] },
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7, lineColor: '#6b7280' }] },
            { text: c.label || '', fontSize: 7.5, bold: true, color: MUTED, margin: [0, 3, 0, 0] },
          ],
          margin: [0, 0, 16, 0],
        })),
        columnGap: 16,
        margin: [0, 8, 0, 10],
      }
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
  addr: { inset: 52.7, y: 30.26, size: 9.07 },           // ink: right 543.3, w 332.4, y 31.9
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
      right(LH.addr.inset, LH.addr.y, e.addr, LH.addr.size),
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

/** The full pdfmake document definition — one builder shared by the emailed attachment, the
 *  page-by-page preview and any future export, so they cannot diverge. */
async function buildDefinition(doc, bodyFont) {
  metaGreen = doc.entity !== 'AEZ'
  let content
  if (doc.content_html) {
    // A hand-edited letter: its blocks are stale, the edited HTML is the document. Convert it so
    // the preview and the emailed copy carry the edits.
    const { default: htmlToPdfmake } = await import('html-to-pdfmake')
    content = htmlToPdfmake(doc.content_html, { window, defaultStyles: { p: { margin: [0, 3, 0, 3] } } })
  } else {
    const blocks = Array.isArray(doc.blocks) ? doc.blocks : []
    content = blocks.length
      ? blocks.map(blockToPdf).filter(Boolean)
      : [{ text: doc.content || '', fontSize: 10.5, lineHeight: 1.3 }]
  }
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
