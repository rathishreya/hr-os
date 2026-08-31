import { useEffect, useRef, useState } from 'react'
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

// ── Page geometry, in CSS pixels ─────────────────────────────────────────────────────────────
// Browsers resolve mm against a 96dpi reference, so these are exact rather than approximate.
const MM = 96 / 25.4
const PAGE_H = 297 * MM          // A4 height
const M_TOP = 30 * MM            // the letterhead band
const M_BOTTOM = 14 * MM
const GAP = 26                   // the space between two sheets
const PITCH = PAGE_H + GAP
const CONTENT_H = PAGE_H - M_TOP - M_BOTTOM

/** Push any block that would straddle a page boundary onto the next sheet.
 *  Returns how many pages the letter now runs to. */
function paginate(el) {
  if (!el) return 1
  el.querySelectorAll('[data-pagebreak]').forEach((n) => n.remove())
  let page = 0
  // Live list: inserting a spacer reflows everything after it, so re-read offsets as we go.
  for (let i = 0; i < el.children.length; i += 1) {
    const kid = el.children[i]
    if (kid.hasAttribute('data-pagebreak')) continue
    const top = kid.offsetTop
    const height = kid.offsetHeight
    if (!height) continue
    // A block taller than a page cannot be helped; let it run and carry on from where it ends.
    while (top >= (page + 1) * PITCH && page < 200) page += 1
    if (height <= CONTENT_H && top + height > page * PITCH + CONTENT_H) {
      const spacer = document.createElement('div')
      spacer.setAttribute('data-pagebreak', '')
      spacer.setAttribute('contenteditable', 'false')
      spacer.setAttribute('aria-hidden', 'true')
      spacer.style.height = `${Math.max(0, (page + 1) * PITCH - top)}px`
      spacer.style.pointerEvents = 'none'
      el.insertBefore(spacer, kid)
      page += 1
      i += 1   // step over the spacer we just added
    }
  }
  return Math.max(1, Math.ceil(el.scrollHeight / PITCH))
}

/** The letter's HTML without the spacers we injected for layout. */
function cleanHtml(el) {
  if (!el) return ''
  const clone = el.cloneNode(true)
  clone.querySelectorAll('[data-pagebreak]').forEach((n) => n.remove())
  return clone.innerHTML
}

// The editable letter body: a contentEditable region seeded from the document's HTML, with a
// sticky formatting toolbar. Exposes editorRef.current.getHtml() so the parent can read + save it.
function EditableBody({ doc, editorRef, onPages }) {
  const ref = useRef(null)
  const busy = useRef(false)

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = documentBodyHtml(doc)
    if (editorRef) editorRef.current = { getHtml: () => cleanHtml(ref.current) }
    // Emit tag-based marks (<b>/<u>) not inline styles, so the server's allow-list sanitizer (which
    // drops style attrs) never loses bold/underline.
    try { document.execCommand('styleWithCSS', false, false) } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id])

  // Re-flow after the text changes, on a short delay so it never fights the caret mid-word. The
  // busy flag keeps our own spacer insertions from re-triggering the observer.
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    let timer = 0
    const run = () => {
      if (busy.current) return
      busy.current = true
      onPages(paginate(el))
      busy.current = false
    }
    const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 180) }
    const mo = new MutationObserver(schedule)
    mo.observe(el, { subtree: true, childList: true, characterData: true })
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    // Fonts land after first paint and change every measurement, so re-flow once they have.
    const fonts = document.fonts?.ready
    if (fonts) fonts.then(schedule)
    run()
    return () => { clearTimeout(timer); mo.disconnect(); ro.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id])

  const Sep = () => <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" />
  return (
    <>
      <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1.5 py-1 shadow-sm">
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
    </>
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
  const [pages, setPages] = useState(1)

  // Viewing is the real paginated PDF — discrete A4 pages with the letterhead, the ISO lines and
  // the coloured edge pattern on every one, because it IS the issued document.
  if (!editable) return <PdfPreview doc={doc} />

  // Editing is the same document, page by page: a stack of A4 sheets with a gap between them,
  // each carrying its own letterhead and side pattern, and the text flowed across them by
  // paginate() rather than running off the bottom of one endless page.
  return (
    <div className="doc-paper relative mx-auto w-[210mm] max-w-full" style={{ height: pages * PITCH - GAP }}>
      <style>{chromeCss('screen').replaceAll('\n  .', '\n  .doc-paper .')}</style>
      {Array.from({ length: pages }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${doc.entity === 'AEZ' ? '' : 'doc-font-ez'}`}
          style={{ top: i * PITCH, height: PAGE_H }}
          dangerouslySetInnerHTML={{ __html: letterheadHtml(doc.entity, doc.brandName) + accentsHtml() }}
        />
      ))}
      <div
        className={`absolute inset-x-0 ${doc.entity === 'AEZ' ? '' : 'doc-font-ez'}`}
        style={{ top: M_TOP, paddingLeft: 18 * MM, paddingRight: 18 * MM }}
      >
        <EditableBody doc={doc} editorRef={editorRef} onPages={setPages} />
      </div>
    </div>
  )
}
