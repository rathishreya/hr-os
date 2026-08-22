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

// Letterhead per legal entity — mirrors printDocument.js so the emailed copy matches the printed one.
const ENTITY = {
  EZ: {
    name: 'EZ Lab Private Limited',
    addr: 'Technology and Innovation Hub: EZ, Sector-62, Gurugram, Haryana - 122102. INDIA',
    web: 'www.ez.works',
  },
  AEZ: {
    name: 'ArabEasy LLC',
    addr: 'Registered Office: 10, Level 1, Sharjah Media City, Sharjah, UAE',
    web: 'www.ez.works',
  },
}

const NAVY = '#1f3b5c'
const INK = '#1f2937'
const MUTED = '#6b7280'
const RULE = '#9aa7b8'

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
  if (level === 1) return { fontSize: 12.5, bold: true, alignment: 'center', margin: [0, 10, 0, 6], characterSpacing: 0.4 }
  if (level === 3) return { fontSize: 11, bold: true, alignment: 'center', margin: [0, 6, 0, 5] }
  return { fontSize: 11, bold: true, margin: [0, 8, 0, 4] }
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
        fontSize: 9.5,
        alignment: b.align === 'right' ? 'right' : 'justify',
        color: b.muted ? MUTED : INK,
        margin: [0, 0, 0, 5],
        lineHeight: 1.25,
      }
      if (prefix && !text.startsWith(prefix)) {
        return { text: [{ text: `${prefix}: `, bold: true }, ...[].concat(runs(text).text ?? runs(text))], ...style }
      }
      return runs(text, style)
    }
    case 'list':
      return {
        [b.ordered ? 'ol' : 'ul']: (b.items || []).map((i) => runs(i)),
        fontSize: 9.5,
        color: INK,
        margin: [8, 0, 0, 6],
        lineHeight: 1.25,
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
    case 'comp':
      return {
        stack: [
          {
            table: {
              widths: ['*', 90],
              headerRows: 1,
              body: [
                [
                  { text: 'Component', bold: true, fontSize: 9, fillColor: '#e9eef5', margin: [4, 3, 4, 3] },
                  { text: 'INR', bold: true, fontSize: 9, fillColor: '#e9eef5', alignment: 'right', margin: [4, 3, 4, 3] },
                ],
                ...(b.rows || []).map((r) => [
                  { text: r.label || '', fontSize: 9, bold: !!r.emphasis, fillColor: r.emphasis ? '#f4f6f9' : undefined, margin: [4, 3, 4, 3] },
                  { text: r.value || '', fontSize: 9, bold: !!r.emphasis, fillColor: r.emphasis ? '#f4f6f9' : undefined, alignment: 'right', margin: [4, 3, 4, 3] },
                ]),
              ],
            },
            layout: { hLineColor: () => RULE, vLineColor: () => RULE, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
          },
          ...((b.notes || []).length
            ? [{
                stack: [
                  { text: 'Important Points', fontSize: 7.5, bold: true, color: MUTED, margin: [0, 6, 0, 2] },
                  { ul: b.notes.map((n) => ({ text: n, fontSize: 7.5, color: MUTED, italics: true })), margin: [4, 0, 0, 0] },
                ],
              }]
            : []),
        ],
        margin: [0, 4, 0, 8],
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
    case 'signature':
      return {
        columns: (b.columns || []).map((c) => ({
          width: '*',
          stack: [
            { text: c.name || ' ', fontSize: 9.5, bold: true, margin: [0, 14, 0, 2] },
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

/** The repeating letterhead drawn into the top margin of every page. */
function letterhead(entityKey) {
  const e = ENTITY[entityKey] || ENTITY.EZ
  return () => ({
    margin: [42, 22, 42, 0],
    columns: [
      {
        width: '*',
        stack: [
          { text: 'EZ', fontSize: 15, bold: true, color: '#6ba43a' },
          { text: e === ENTITY.AEZ ? 'ArabEasy' : 'EZ Lab Private Limited', fontSize: 9, bold: true, color: '#4b7a2c' },
          { text: 'ISO 27001:2022   ISO 9001:2015', fontSize: 6.5, bold: true, color: '#374151', margin: [0, 3, 0, 0] },
        ],
      },
      {
        width: 'auto',
        alignment: 'right',
        stack: [
          { text: e.name, fontSize: 8.5, bold: true, color: '#111827' },
          { text: e.addr, fontSize: 6.5, color: '#374151', margin: [0, 2, 0, 0] },
          { text: e.web, fontSize: 6.5, bold: true, color: NAVY, margin: [0, 2, 0, 0] },
        ],
      },
    ],
  })
}

/**
 * Render a document to a PDF and resolve with its base64 payload (no data: prefix), ready to be
 * posted to the send-email endpoint.
 */
export async function documentToPdfBase64(doc) {
  const [{ default: pdfMake }, vfs] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  pdfMake.vfs = vfs.default?.pdfMake?.vfs || vfs.pdfMake?.vfs || vfs.default || vfs

  const blocks = Array.isArray(doc.blocks) ? doc.blocks : []
  const content = blocks.length
    ? blocks.map(blockToPdf).filter(Boolean)
    : [{ text: doc.content || '', fontSize: 9.5, lineHeight: 1.25 }]

  const definition = {
    pageSize: 'A4',
    pageMargins: [42, 78, 42, 45],
    header: letterhead(doc.entity),
    footer: (page, total) => ({
      text: `${page} / ${total}`,
      alignment: 'center',
      fontSize: 7.5,
      color: MUTED,
      margin: [0, 12, 0, 0],
    }),
    info: { title: doc.title || 'Document' },
    defaultStyle: { fontSize: 9.5, color: INK, lineHeight: 1.25 },
    content,
  }

  return new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(definition).getBase64((data) => resolve(data))
    } catch (err) {
      reject(err)
    }
  })
}
