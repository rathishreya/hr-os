import { useEffect, useRef, useState } from 'react'
import { Bold, Underline, Heading2, Heading3, Pilcrow, List, ListOrdered, Eraser } from 'lucide-react'
import { documentBodyHtml } from './docHtml'
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

export default function DocumentPaper({ doc, editable = false, editorRef }) {
  // Viewing is the real paginated PDF — discrete A4 pages, letterhead, ISO lines and the coloured
  // edge pattern on every one of them, because it IS the issued document.
  //
  // Editing cannot be that. HTML does not paginate a contentEditable, so any page frame drawn
  // around live text is a guess that the next keystroke invalidates, and a letterhead repeated
  // down it would sit on top of what you are writing. So editing does not pretend to be a page:
  // it is a plain writing surface, and Preview is one click away for the real thing.
  if (!editable) return <PdfPreview doc={doc} />
  return (
    <div className="mx-auto w-full max-w-[210mm]">
      <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
        You are editing the wording only. The letterhead, the side pattern and the page breaks are
        applied to every page when the letter is issued — close this and use <strong>Preview</strong> to see them.
      </p>
      <div className={`rounded-lg border border-slate-200 bg-white px-8 py-7 shadow-sm ${doc.entity === 'AEZ' ? '' : 'doc-font-ez'}`}>
        <EditableBody doc={doc} editorRef={editorRef} />
      </div>
    </div>
  )
}
