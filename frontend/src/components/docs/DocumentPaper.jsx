import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bold, Underline, Heading2, Heading3, Pilcrow, List, ListOrdered, Eraser } from 'lucide-react'
import { documentBodyHtml } from './docHtml'
import { letterheadHtml, accentsHtml, chromeCss } from './letterhead'
import { documentToPdfBlobUrl } from './pdfDocument'

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

// Page-by-page preview: the ACTUAL PDF (same builder as the emailed attachment and print),
// rendered in the browser's PDF viewer — discrete A4 pages, letterhead and edge bars repeating
// on every page, exactly as the issued document. There is nothing to drift because it is not a
// reproduction; it is the document.
function PdfPreview({ doc }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    let objectUrl = null
    setUrl(null); setErr('')
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('The document is taking too long to render. Close this preview and try again; if it keeps happening, use Edit letter and report it.')), 45000)
    })
    Promise.race([documentToPdfBlobUrl(doc), timeout])
      .then((u) => {
        objectUrl = u
        if (alive) setUrl(u)
        else URL.revokeObjectURL(u)
      })
      .catch((e) => {
        if (!alive) return
        // The PDF builder is a lazy chunk, so this is what a tab left open across a deploy hits:
        // it asks for last release's filename, which no longer exists. Nothing is wrong with the
        // document — the page is just running old code.
        const stale = /dynamically imported module|Importing a module script failed/i.test(String(e.message || ''))
        setErr(stale ? 'STALE' : (e.message || 'Could not render the PDF'))
      })
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.content_html, doc.status])

  if (err === 'STALE') {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p>This page is running an older version of the app. Reload to pick up the current one — nothing is wrong with the document.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition duration-150 ease-snappy hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
        >
          Reload the page
        </button>
      </div>
    )
  }
  if (err) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{err}</div>
  }
  if (!url) {
    return (
      <div className="flex h-[70vh] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
        Preparing the document…
      </div>
    )
  }
  return (
    <iframe
      src={url}
      title={doc.title || 'Document preview'}
      className="h-[74vh] w-full rounded-lg border border-slate-200 bg-slate-100"
    />
  )
}

// A4 at the CSS reference resolution — browsers resolve mm against 96dpi, so this is exact.
const PAGE_PX = (297 * 96) / 25.4

export default function DocumentPaper({ doc, editable = false, editorRef }) {
  const paperRef = useRef(null)
  const [pages, setPages] = useState(1)

  // The editing surface is one continuous column — HTML cannot paginate a contentEditable — so
  // draw the page chrome for as many A4 pages as the text currently fills. The edge bars live in
  // the margins, so they repeat safely; the letterhead does not repeat, because it would land on
  // top of the writing. Each boundary is ruled and numbered instead, and the issued PDF (Preview)
  // is where the letterhead genuinely repeats.
  useLayoutEffect(() => {
    const el = paperRef.current
    if (!editable || !el) return undefined
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setPages(Math.max(1, Math.ceil(el.scrollHeight / PAGE_PX))))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const mo = new MutationObserver(measure)
    mo.observe(el, { subtree: true, childList: true, characterData: true })
    measure()
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect() }
  }, [editable, doc.id])

  if (!editable) return <PdfPreview doc={doc} />
  return (
    <div
      ref={paperRef}
      className={`doc-paper relative mx-auto w-[210mm] max-w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${doc.entity === 'AEZ' ? '' : 'doc-font-ez'}`}
      style={{ minHeight: `${pages * 297}mm` }}
    >
      <style>{chromeCss('screen').replaceAll('\n  .', '\n  .doc-paper .')}</style>
      {Array.from({ length: pages }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0"
          style={{ top: `${i * 297}mm`, height: '297mm' }}
        >
          <div dangerouslySetInnerHTML={{ __html: (i === 0 ? letterheadHtml(doc.entity, doc.brandName) : '') + accentsHtml() }} />
          {i > 0 && (
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-300">
              <span className="absolute right-[8mm] top-1 text-[9px] font-medium tabular-nums text-slate-400">Page {i + 1}</span>
            </div>
          )}
        </div>
      ))}
      <div className="relative px-[18mm] pb-[14mm] pt-[30mm]">
        <EditableBody doc={doc} editorRef={editorRef} />
      </div>
    </div>
  )
}
