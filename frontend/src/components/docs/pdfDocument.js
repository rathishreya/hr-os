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
import { ENTITY, C, logoSvg } from './letterhead'

// ── Poppins, embedded so the attached PDF sets the same face as the preview and print paths.
// Fetched once from the app's own /fonts (they ship in the build) and cached; if the fetch
// fails the PDF falls back to pdfmake's bundled Roboto rather than failing the send.
let poppinsVfs = null
async function loadPoppins() {
  if (poppinsVfs) return poppinsVfs
  const files = [
    'Poppins-Regular', 'Poppins-SemiBold', 'Poppins-Italic', 'Poppins-SemiBoldItalic',
    'Arimo-Regular', 'Arimo-Bold', 'Arimo-Italic', 'Arimo-BoldItalic',
    'GreatVibes-Regular',
  ]
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

/** One document block -> pdfmake content node(s). Mirrors DocumentBlocks.jsx case for case. */
function blockToPdf(b) {
  switch (b?.type) {
    case 'heading': {
      const node = runs((b.text || '').toUpperCase(), headingStyle(b.level))
      if (b.underline) node.decoration = 'underline'
      return node
    }
    case 'para': {
      const prefix = b.strong_prefix
      const text = b.text || ''
      const style = {
        fontSize: 10.5,
        alignment: b.align === 'right' ? 'right' : 'left',
        color: b.muted ? MUTED : INK,
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
          cell('Component', { bold: true, fillColor: '#e9eef5' }),
          cell('INR', { bold: true, fillColor: '#e9eef5', alignment: 'right' }),
        ],
        ...(b.rows || []).map((r) => [
          cell(r.label || '', { bold: !!r.emphasis, fillColor: r.emphasis ? '#f4f6f9' : undefined }),
          cell(r.value || '', { bold: !!r.emphasis, fillColor: r.emphasis ? '#f4f6f9' : undefined, alignment: 'right' }),
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
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 1 : 0.5),
          vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length ? 1 : 0.5),
          hLineColor: (i, node) => (i === 0 || i === node.table.body.length ? '#333333' : '#b3b3b3'),
          vLineColor: (i, node) => (i === 0 || i === node.table.widths.length ? '#333333' : '#b3b3b3'),
        },
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
    case 'script':
      return { text: b.text || '', font: 'GreatVibes', fontSize: 20, lineHeight: 1, margin: [0, 4, 0, 2] }
    case 'signature':
      return {
        columns: (b.columns || []).map((c) => ({
          width: '*',
          stack: [
            ...(c.script ? [{ text: c.script, font: 'GreatVibes', fontSize: 17, lineHeight: 1, margin: [0, 6, 0, 0] }] : []),
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

/** The repeating letterhead drawn into the top margin of every page — the same logo, ISO badge
 *  lines and company block the preview and print window render (letterhead.js). */
function letterhead(entityKey, brandName) {
  const e = ENTITY[entityKey] || ENTITY.EZ
  return () => ({
    margin: [54, 14, 17, 0],
    columns: [
      {
        width: '*',
        stack: [
          { svg: logoSvg(entityKey, brandName), width: 128 },
          { text: 'ISO 27001:2022', fontSize: 6.2, bold: true, characterSpacing: 1.6, color: '#374151', margin: [0, 4, 0, 0] },
          { text: 'ISO 9001:2015', fontSize: 6.2, bold: true, characterSpacing: 1.6, color: '#374151', margin: [0, 1.5, 0, 0] },
        ],
      },
      {
        width: 'auto',
        alignment: 'right',
        stack: [
          {
            columns: [
              { width: '*', stack: [
                { text: brandName || e.name, fontSize: 8.5, bold: true, color: C.ink, alignment: 'right' },
                { text: e.addr, fontSize: 6.4, color: '#4B5563', alignment: 'right', margin: [0, 2, 0, 0] },
              ] },
              { width: 24, svg: PIN_SVG, margin: [4, 2, 0, 0] },
            ],
          },
          {
            columns: [
              { width: '*', text: e.web, fontSize: 6.6, bold: true, color: C.ink, alignment: 'right', margin: [0, 3, 0, 0] },
              { width: 24, svg: GLOBE_SVG, margin: [4, 1, 0, 0] },
            ],
          },
        ],
        margin: [0, 2, 0, 0],
      },
    ],
    columnGap: 12,
  })
}

/** The colored edge bars, drawn on every page behind the content — geometry matches
 *  letterhead.accentsHtml (mm figures converted to pt). */
function pageBackground() {
  const bar = (x, yMm, hMm, color, wMm = 6) => ({
    type: 'rect', x, y: yMm * MM, w: wMm * MM, h: hMm * MM, color,
  })
  // Both edges carry the SAME element, rotated 180 degrees: square -> rule -> three bars,
  // the rule meeting the maroon block's edge with no gap.
  // Left reads top-to-bottom, right reads bottom-to-top. Identical heights, rule and gap.
  const R = PAGE_W - 6 * MM
  const axisL = 6 * MM      // the maroon bar's inner edge
  const axisR = PAGE_W - 6 * MM
  return () => ({
    canvas: [
      // Right (mirror of left): bars from the top, then rule down to the square.
      bar(R, 0, 29, C.yellow),
      bar(R, 29, 47, C.navy),
      bar(R, 76, 39, C.maroon),
      { type: 'rect', x: axisR, y: 115 * MM, w: 0.25 * MM, h: 149.4 * MM, color: C.navy },
      { type: 'rect', x: axisR - 1.175 * MM, y: 264.4 * MM, w: 2.6 * MM, h: 2.6 * MM, color: C.navy },
      // Left: square, rule, gap, bars to the page bottom.
      { type: 'rect', x: axisL - 1.425 * MM, y: 30 * MM, w: 2.6 * MM, h: 2.6 * MM, color: C.navy },
      { type: 'rect', x: axisL - 0.25 * MM, y: 32.6 * MM, w: 0.25 * MM, h: 149.4 * MM, color: C.navy },
      bar(0, 182, 39, C.maroon),
      bar(0, 221, 47, C.navy),
      bar(0, 268, 29, C.yellow),
    ],
  })
}

const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="15" viewBox="0 0 24 15"><rect x="0" y="0" width="24" height="15" rx="7.5" fill="#E9ECEF"/><path transform="translate(8.4,2.2) scale(0.44)" d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="#C4302B"/></svg>`
const GLOBE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="15" viewBox="0 0 24 15"><rect x="0" y="0" width="24" height="15" rx="7.5" fill="#E9ECEF"/><g transform="translate(8.4,2.2) scale(0.44)" fill="none" stroke="#6B7280" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18"/></g></svg>`

/** The full pdfmake document definition — one builder shared by the emailed attachment, the
 *  page-by-page preview and any future export, so they cannot diverge. */
async function buildDefinition(doc, bodyFont) {
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
        Poppins: {
          normal: 'Poppins-Regular.ttf', bold: 'Poppins-SemiBold.ttf',
          italics: 'Poppins-Italic.ttf', bolditalics: 'Poppins-SemiBoldItalic.ttf',
        },
        // Arimo is metrically identical to Arial -- the face the EZ Lab source documents are
        // actually set in (the ArabEasy sources are the Poppins ones).
        Arimo: {
          normal: 'Arimo-Regular.ttf', bold: 'Arimo-Bold.ttf',
          italics: 'Arimo-Italic.ttf', bolditalics: 'Arimo-BoldItalic.ttf',
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
        Poppins: ROBOTO,
        Arimo: ROBOTO,
        GreatVibes: {
          normal: 'Roboto-Italic.ttf', bold: 'Roboto-Italic.ttf',
          italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-Italic.ttf',
        },
      })
    }
    fontsRegistered = true
  }
  // The EZ Lab sources are set in Arial (Arimo carries its exact metrics); the ArabEasy sources
  // in Poppins. In the fallback set both names map to Roboto, so either is safe unloaded.
  bodyFont = doc.entity === 'AEZ' ? 'Poppins' : 'Arimo'

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
