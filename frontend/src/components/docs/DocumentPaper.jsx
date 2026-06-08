import DocumentBlocks from './DocumentBlocks'

// Letterhead preview that mirrors what Print / PDF produces (logo, ISO badges, address, accents).
const ENTITY = {
  EZ: { name: 'EZ Lab Private Limited', addr: 'Technology and Innovation Hub: EZ, Sector-62, Gurugram, Haryana - 122102. INDIA', web: 'www.ez.works' },
  AEZ: { name: 'AEZ Private Limited', addr: 'Sector-62, Gurugram, Haryana, INDIA', web: 'www.ez.works' },
}

function EZLogo() {
  return (
    <svg width="148" height="44" viewBox="0 0 156 46" aria-label="EZ Lab">
      <rect x="2" y="7" width="34" height="32" rx="8" fill="none" stroke="#6ba43a" strokeWidth="2.4" />
      <text x="19" y="30" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="17" fill="#6ba43a" textAnchor="middle">EZ</text>
      <text x="44" y="22" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="16" fill="#4b7a2c">EZ Lab</text>
      <text x="44" y="38" fontFamily="Arial, sans-serif" fontWeight="600" fontSize="11" fill="#6b7280">Private Limited</text>
    </svg>
  )
}

export default function DocumentPaper({ doc }) {
  const e = ENTITY[doc.entity] || ENTITY.EZ
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* brand edge accents */}
      <span className="pointer-events-none absolute right-0 top-16 h-24 w-1.5 bg-[#1f3b5c]" />
      <span className="pointer-events-none absolute right-0 top-44 h-20 w-1.5 bg-[#84202f]" />
      <span className="pointer-events-none absolute bottom-0 left-0 h-16 w-1.5 bg-[#efa31d]" />

      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 pb-3 pt-4">
        <div className="flex flex-col gap-1.5">
          <EZLogo />
          <div className="font-sans text-[8px] font-bold leading-tight tracking-[0.15em] text-slate-600">ISO 27001:2022<br />ISO 9001:2015</div>
        </div>
        <div className="text-right">
          <div className="font-sans text-[11px] font-bold text-slate-900">{e.name}</div>
          <div className="mt-0.5 font-sans text-[8px] leading-snug text-slate-500">{e.addr}</div>
          <div className="font-sans text-[8px] text-slate-500">{e.web}</div>
        </div>
      </div>

      <div className="px-6 py-4 font-serif">
        <DocumentBlocks blocks={doc.blocks} content={doc.content} />
      </div>
    </div>
  )
}
