/** The document page chrome — letterhead, logos, icon chips and the colored edge bars — exactly
 *  as the source PDFs set them, shared by the on-screen preview (DocumentPaper) and the print
 *  window (printDocument) so the two can never drift apart. The emailed PDF (pdfDocument) draws
 *  the same geometry with pdfmake primitives.
 *
 *  All measurements are in mm against an A4 page (210 x 297): browsers resolve mm on screen too,
 *  so the preview paper is literally A4-proportioned and WYSIWYG with print.
 */
import { esc } from './docHtml'
import { LOGO_EZ_IMG, LOGO_AEZ_IMG, LOGO_MARK_IMG } from './logoAssets'

// Brand colors lifted from the source letterheads.
export const C = {
  // Sampled off the source pages at 300 DPI rather than eyeballed.
  yellow: '#F1B715',
  navy: '#0E2949',
  maroon: '#901918',
  ezGreen: '#6BA43A',
  ezGreenDark: '#4F7F2E',
  aeBlue: '#29ABE2',
  aeOrange: '#F7941D',
  ink: '#1F2430',
  gray: '#4B5563',
  chip: '#D8D8D8',
}

export const ENTITY = {
  EZ: {
    name: 'EZ Lab Private Limited',
    // Two lines, broken where the source breaks them. Left as a wrapping string, each renderer
    // would find its own break point and the two would disagree.
    addr: [
      'Technology and Innovation Hub: EZ, 5th Floor, Imperia Mindspace, Golf Course',
      'Extension, Sector 62, Gurugram, Haryana – 122413, INDIA',
    ],
    web: 'www.ez.works',
  },
  AEZ: {
    name: 'ArabEasy LLC',
    addr: ['Registered Office: 10, Level 1, Sharjah Media City, Sharjah, UAE'],
    web: 'www.ez.works',
  },
}

// ── Logos ───────────────────────────────────────────────────────────────────────────────────
// The real artwork, extracted from the letterhead rasters embedded in the source PDFs — the
// stylized epsilon-Z glyph, not a typeface approximation. Sized to the sources: ~9.5mm tall.
// Position and size come from chromeCss (.lh img), which carries the source's own measurements.
const LOGO_EZ = `<img src="${LOGO_EZ_IMG}" alt="EZ Lab Private Limited"/>`

const LOGO_AEZ = `<img src="${LOGO_AEZ_IMG}" alt="ArabEasy LLC"/>`

// Compact single mark (used by the JD, which shows a brandName instead of the legal entity).
const LOGO_MARK = `<img src="${LOGO_MARK_IMG}" alt="EZ"/>`

// The sources set two gray pills at the letterhead's right edge, rounded on the left and running
// flat into the color bars: the first holds a dark map pin beside the address, the second is empty.
const PIN_CHIP = `
<span class="lh-chip lh-chip1"><svg width="11.2" height="14.2" viewBox="0 0 24 24" fill="#242628" style="height:5mm;width:auto"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg></span>`
const GLOBE_CHIP = `<span class="lh-chip lh-chip2"></span>`

export function logoSvg(entityKey, brandName) {
  if (brandName) return LOGO_MARK
  return entityKey === 'AEZ' ? LOGO_AEZ : LOGO_EZ
}

/** The same artwork as a bare data URI, for pdfmake's `image` element. */
export function logoImage(entityKey, brandName) {
  if (brandName) return LOGO_MARK_IMG
  return entityKey === 'AEZ' ? LOGO_AEZ_IMG : LOGO_EZ_IMG
}

/** The letterhead: logo + ISO badge lines at the left, company identity and the two gray chips
 *  at the right. Every piece is placed at the millimetre coordinate the source PDFs place it at
 *  — measured off the originals at 300 DPI, the same figures pdfDocument.LH carries — so the
 *  editor paper, the print window and the emailed PDF are the same letterhead. */
export function letterheadHtml(entityKey, brandName) {
  const e = ENTITY[entityKey] || ENTITY.EZ
  return `
  <div class="lh">
    ${logoSvg(entityKey, brandName)}
    <div class="lh-iso lh-iso1">ISO 27001:2022</div>
    <div class="lh-iso lh-iso2">ISO 9001:2015</div>
    <div class="lh-co">${esc(brandName || e.name)}</div>
    <div class="lh-ad">${e.addr.map(esc).join('<br/>')}</div>
    <div class="lh-web">${esc(e.web)}</div>
    ${PIN_CHIP}
    ${GLOBE_CHIP}
  </div>`
}

/** The colored edge accents. Measured off the source pages at 300 DPI: 6.35mm bars in three
 *  37.15mm bands, and a 0.15mm navy hairline that runs the artwork's full 218mm alongside them
 *  to a 2.6mm square at the far end. The left side is the exact 180-degree mirror of the right. */
export function accentsHtml() {
  const bar = 6.35, band = 37.15, ruleX = 6.58, sqX = 5.35
  const side = (s) => `
    <span class="acc-bar" style="${s}:0;top:${s === 'right' ? 0 : 181.8}mm;height:${band}mm;background:${s === 'right' ? C.yellow : C.maroon};width:${bar}mm"></span>
    <span class="acc-bar" style="${s}:0;top:${(s === 'right' ? 0 : 181.8) + band}mm;height:${band}mm;background:${C.navy};width:${bar}mm"></span>
    <span class="acc-bar" style="${s}:0;top:${(s === 'right' ? 0 : 181.8) + band * 2}mm;height:${band}mm;background:${s === 'right' ? C.maroon : C.yellow};width:${bar}mm"></span>
    <span class="acc-rule" style="${s}:${ruleX}mm;top:${s === 'right' ? 0.4 : 77}mm;height:215.7mm"></span>
    <span class="acc-sq" style="${s}:${sqX}mm;top:${s === 'right' ? 216.1 : 74.5}mm"></span>`
  return `<div class="acc" aria-hidden="true">${side('right')}${side('left')}</div>`
}

/** Chrome CSS. mode 'print' pins the letterhead + accents with position:fixed so they repeat on
 *  every printed page; mode 'screen' uses absolute positioning inside the .paper container. */
export function chromeCss(mode) {
  const pos = mode === 'print' ? 'fixed' : 'absolute'
  return `
  .lh{ position:${pos}; top:0; left:0; right:0; height:30mm;
       font-family:Exo2, Arial, sans-serif; color:#000; }
  .lh > *{ position:${pos}; }
  .lh img{ left:12.70mm; top:6.28mm; height:9.45mm; width:auto; }
  .lh-iso{ left:12.70mm; font-size:9.7pt; line-height:1; }
  .lh-iso1{ top:17.06mm; }  .lh-iso2{ top:22.36mm; }
  .lh-co{ right:18.84mm; top:6.53mm; font-size:8.97pt; font-weight:700; line-height:1; }
  /* The address runs to two lines, so it starts higher than the source's single-line y and
     the pair sits in the same band. Leading is tight to keep line two clear of www.ez.works. */
  .lh-ad{ right:18.59mm; top:10.05mm; text-align:right; font-size:9.07pt; line-height:1.20; }
  .lh-web{ right:18.42mm; top:18.10mm; font-size:9.76pt; font-weight:700; line-height:1; }
  .lh-chip{ right:7.06mm; width:9.53mm; background:${C.chip};
            border-radius:3.6mm 0 0 3.6mm; display:flex; align-items:center; padding-left:2.2mm; }
  .lh-chip1{ top:6.60mm; height:7.20mm; }  .lh-chip2{ top:16.26mm; height:6.95mm; }
  .acc-bar{ position:${pos}; display:block; }
  .acc-sq{ position:${pos}; width:2.6mm; height:2.5mm; background:${C.navy}; display:block; }
  .acc-rule{ position:${pos}; width:0.15mm; background:${C.navy}; display:block; }`
}
