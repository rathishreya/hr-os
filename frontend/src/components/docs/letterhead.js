/** The document page chrome — letterhead, logos, icon chips and the colored edge bars — exactly
 *  as the source PDFs set them, shared by the on-screen preview (DocumentPaper) and the print
 *  window (printDocument) so the two can never drift apart. The emailed PDF (pdfDocument) draws
 *  the same geometry with pdfmake primitives.
 *
 *  All measurements are in mm against an A4 page (210 x 297): browsers resolve mm on screen too,
 *  so the preview paper is literally A4-proportioned and WYSIWYG with print.
 */
import { esc } from './docHtml'

// Brand colors lifted from the source letterheads.
export const C = {
  yellow: '#F0B41C',
  navy: '#1E3A5F',
  maroon: '#9C2A2F',
  ezGreen: '#6BA43A',
  ezGreenDark: '#4F7F2E',
  aeBlue: '#29ABE2',
  aeOrange: '#F7941D',
  ink: '#1F2430',
  gray: '#4B5563',
  chip: '#E9ECEF',
}

export const ENTITY = {
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

// ── Logos ───────────────────────────────────────────────────────────────────────────────────
// EZ Lab: green rounded-square mark + "EZ Lab / Private Limited" wordmark.
// ArabEasy: orange rounded-square mark + light-blue "ArabEasy" wordmark.
// The source glyph is a stylized epsilon-Z; "EZ" is used so every renderer (including the PDF's
// embedded font) has the glyphs.
const LOGO_EZ = `
<svg width="150" height="42" viewBox="0 0 158 44" xmlns="http://www.w3.org/2000/svg" aria-label="EZ Lab Private Limited">
  <rect x="1.5" y="4" width="36" height="36" rx="9" fill="none" stroke="${C.ezGreen}" stroke-width="2.6"/>
  <text x="19.5" y="29" font-family="Exo2, Arial, sans-serif" font-weight="600" font-size="16" fill="${C.ezGreen}" text-anchor="middle">EZ</text>
  <text x="46" y="20" font-family="Exo2, Arial, sans-serif" font-weight="600" font-size="15.5" fill="${C.ezGreenDark}">EZ Lab</text>
  <text x="46" y="36" font-family="Exo2, Arial, sans-serif" font-weight="500" font-size="11.5" fill="#6B7280">Private Limited</text>
</svg>`

const LOGO_AEZ = `
<svg width="150" height="42" viewBox="0 0 158 44" xmlns="http://www.w3.org/2000/svg" aria-label="ArabEasy LLC">
  <rect x="1.5" y="4" width="36" height="36" rx="9" fill="none" stroke="${C.aeOrange}" stroke-width="2.6"/>
  <text x="19.5" y="29" font-family="Exo2, Arial, sans-serif" font-weight="600" font-size="16" fill="${C.aeOrange}" text-anchor="middle">EZ</text>
  <text x="46" y="30" font-family="Exo2, Arial, sans-serif" font-weight="600" font-size="17" fill="${C.aeBlue}">ArabEasy</text>
</svg>`

// Compact single mark (used by the JD, which shows a brandName instead of the legal entity).
const LOGO_MARK = `
<svg width="42" height="42" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" aria-label="EZ">
  <rect x="3" y="3" width="36" height="36" rx="9" fill="none" stroke="${C.ezGreen}" stroke-width="2.6"/>
  <text x="21" y="28" font-family="Exo2, Arial, sans-serif" font-weight="600" font-size="16" fill="${C.ezGreen}" text-anchor="middle">EZ</text>
</svg>`

// Icon chips at the right edge of the letterhead: a red map pin beside the address, a globe
// beside the web address, each in a gray rounded pill bleeding to the page edge.
const PIN_CHIP = `
<span class="lh-chip"><svg width="12" height="12" viewBox="0 0 24 24" fill="#C4302B"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg></span>`
const GLOBE_CHIP = `
<span class="lh-chip"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18"/></svg></span>`

export function logoSvg(entityKey, brandName) {
  if (brandName) return LOGO_MARK
  return entityKey === 'AEZ' ? LOGO_AEZ : LOGO_EZ
}

/** The letterhead row: logo + ISO badges left, company identity right with the icon chips. */
export function letterheadHtml(entityKey, brandName) {
  const e = ENTITY[entityKey] || ENTITY.EZ
  return `
  <div class="lh">
    <div class="lh-l">
      ${logoSvg(entityKey, brandName)}
      <div class="lh-iso">ISO 27001:2022<br/>ISO 9001:2015</div>
    </div>
    <div class="lh-r">
      <div class="lh-row">
        <div class="lh-txt">
          <div class="lh-co">${esc(brandName || e.name)}</div>
          <div class="lh-ad">${esc(e.addr)}</div>
        </div>
        ${PIN_CHIP}
      </div>
      <div class="lh-row">
        <div class="lh-txt"><div class="lh-web">${esc(e.web)}</div></div>
        ${GLOBE_CHIP}
      </div>
    </div>
  </div>`
}

/** The colored edge accents, one continuous mirrored element per side as the sources set them:
 *  LEFT  - small navy square at 30mm, thin rule hanging to 180mm, then maroon -> navy -> yellow
 *          bars filling to the page bottom;
 *  RIGHT - yellow -> navy -> maroon bars filling from the top, then a thin rule dropping to a
 *          small navy square near the page bottom. */
export function accentsHtml() {
  return `
  <div class="acc" aria-hidden="true">
    <span class="acc-bar" style="right:0;top:0;height:21.5mm;background:${C.yellow}"></span>
    <span class="acc-bar" style="right:0;top:21.5mm;height:31.5mm;background:${C.navy}"></span>
    <span class="acc-bar" style="right:0;top:53mm;height:31.5mm;background:${C.maroon}"></span>
    <span class="acc-rule" style="right:5.75mm;top:84.5mm;height:130.5mm"></span>
    <span class="acc-sq" style="right:4.6mm;top:215mm"></span>
    <span class="acc-sq" style="left:4.6mm;top:79.4mm"></span>
    <span class="acc-rule" style="left:5.85mm;top:82mm;height:130.5mm"></span>
    <span class="acc-bar" style="left:0;top:212.5mm;height:31.5mm;background:${C.maroon}"></span>
    <span class="acc-bar" style="left:0;top:244mm;height:31.5mm;background:${C.navy}"></span>
    <span class="acc-bar" style="left:0;top:275.5mm;height:21.5mm;background:${C.yellow}"></span>
  </div>`
}

/** Chrome CSS. mode 'print' pins the letterhead + accents with position:fixed so they repeat on
 *  every printed page; mode 'screen' uses absolute positioning inside the .paper container. */
export function chromeCss(mode) {
  const pos = mode === 'print' ? 'fixed' : 'absolute'
  return `
  .lh{ position:${pos}; top:0; left:0; right:0; height:27mm; padding:5mm 6mm 0 8mm;
       display:flex; justify-content:space-between; align-items:flex-start; }
  .lh-l{ display:flex; flex-direction:column; gap:1.2mm; }
  .lh-iso{ font-family:Exo2, Arial, sans-serif; font-weight:600; font-size:7.5px;
           letter-spacing:2.2px; color:#374151; line-height:1.65; }
  .lh-r{ display:flex; flex-direction:column; align-items:flex-end; gap:1.4mm; padding-top:1mm; }
  .lh-row{ display:flex; align-items:center; gap:2mm; }
  .lh-txt{ text-align:right; }
  .lh-co{ font-family:Exo2, Arial, sans-serif; font-weight:600; font-size:10.5px; color:${C.ink}; }
  .lh-ad{ font-family:Exo2, Arial, sans-serif; font-size:7.5px; color:#4B5563; margin-top:0.8mm; }
  .lh-web{ font-family:Exo2, Arial, sans-serif; font-weight:600; font-size:8px; color:${C.ink}; }
  .lh-chip{ display:inline-flex; align-items:center; justify-content:center; width:9mm; height:5.5mm;
            background:${C.chip}; border-radius:3mm 0 0 3mm; margin-right:-6mm; }
  .acc-bar{ position:${pos}; width:6mm; display:block; }
  .acc-sq{ position:${pos}; width:2.6mm; height:2.6mm; background:${C.navy}; display:block; }
  .acc-rule{ position:${pos}; width:0.15mm; background:${C.navy}; display:block; }`
}
