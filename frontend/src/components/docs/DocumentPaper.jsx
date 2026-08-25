import { useEffect, useRef, useState } from 'react'
import { Bold, Underline, Heading2, Heading3, Pilcrow, List, ListOrdered, Eraser } from 'lucide-react'
import DocumentBlocks from './DocumentBlocks'
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
      .catch((e) => { if (alive) setErr(e.message || 'Could not render the PDF') })
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.content_html, doc.status])

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
  // Viewing is the real paginated PDF; editing keeps the A4 letterhead sheet around a
  // contentEditable body (a PDF cannot be edited in place).
  if (!editable) return <PdfPreview doc={doc} />
  return (
    <div className={`doc-paper relative mx-auto w-[210mm] max-w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${doc.entity === 'AEZ' ? '' : 'doc-font-ez'}`}>
      <style>{'.doc-paper{ min-height:120mm; }' + chromeCss('screen').replaceAll('\n  .', '\n  .doc-paper .')}</style>
      <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: letterheadHtml(doc.entity, doc.brandName) + accentsHtml() }} />
      <div className="relative px-[18mm] pb-[14mm] pt-[30mm]">
        {editable
          ? <EditableBody doc={doc} editorRef={editorRef} />
          : doc.content_html
            ? <div className="doc-html" dangerouslySetInnerHTML={{ __html: doc.content_html }} />
            : <DocumentBlocks blocks={doc.blocks} content={doc.content} />}
      </div>
    </div>
  )
}
