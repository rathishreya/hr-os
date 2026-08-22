import { useEffect, useRef } from 'react'
import { Bold, Underline, Heading2, Heading3, Pilcrow, List, ListOrdered, Eraser } from 'lucide-react'
import DocumentBlocks from './DocumentBlocks'
import { documentBodyHtml } from './docHtml'

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

const exec = (cmd, val) => { try { document.execCommand(cmd, false, val) } catch { /* noop */ } }

function ToolBtn({ title, onClick, children }) {
  // onMouseDown + preventDefault keeps the editor's text selection while the toolbar is clicked.
  return (
    <button type="button" title={title} aria-label={title}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
      {children}
    </button>
  )
}

// The editable letter body: a contentEditable region seeded from the document's HTML, with a
// sticky formatting toolbar. Exposes editorRef.current.getHtml() so the parent can read + save it.
function EditableBody({ doc, editorRef }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = documentBodyHtml(doc)
    if (editorRef) editorRef.current = { getHtml: () => ref.current?.innerHTML || '' }
    // Emit tag-based marks (<b>/<u>) not inline styles, so the server's allow-list sanitizer (which
    // drops style attrs) never loses bold/underline.
    try { document.execCommand('styleWithCSS', false, false) } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id])
  const Sep = () => <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" />
  return (
    <div>
      <div className="sticky top-0 z-10 -mx-2 mb-3 flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 px-1.5 py-1 shadow-sm backdrop-blur">
        <ToolBtn title="Bold" onClick={() => exec('bold')}><Bold className="h-4 w-4" /></ToolBtn>
        <ToolBtn title="Underline" onClick={() => exec('underline')}><Underline className="h-4 w-4" /></ToolBtn>
        <Sep />
        <ToolBtn title="Heading" onClick={() => exec('formatBlock', 'H2')}><Heading2 className="h-4 w-4" /></ToolBtn>
        <ToolBtn title="Sub-heading" onClick={() => exec('formatBlock', 'H3')}><Heading3 className="h-4 w-4" /></ToolBtn>
        <ToolBtn title="Normal text" onClick={() => exec('formatBlock', 'P')}><Pilcrow className="h-4 w-4" /></ToolBtn>
        <Sep />
        <ToolBtn title="Bulleted list" onClick={() => exec('insertUnorderedList')}><List className="h-4 w-4" /></ToolBtn>
        <ToolBtn title="Numbered list" onClick={() => exec('insertOrderedList')}><ListOrdered className="h-4 w-4" /></ToolBtn>
        <Sep />
        <ToolBtn title="Clear formatting" onClick={() => exec('removeFormat')}><Eraser className="h-4 w-4" /></ToolBtn>
      </div>
      <div ref={ref} className="doc-html" contentEditable suppressContentEditableWarning spellCheck />
    </div>
  )
}

export default function DocumentPaper({ doc, editable = false, editorRef }) {
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
        {editable
          ? <EditableBody doc={doc} editorRef={editorRef} />
          : doc.content_html
            ? <div className="doc-html" dangerouslySetInnerHTML={{ __html: doc.content_html }} />
            : <DocumentBlocks blocks={doc.blocks} content={doc.content} />}
      </div>
    </div>
  )
}
