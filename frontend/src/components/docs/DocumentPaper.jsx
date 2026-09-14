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

// ── Page geometry, in CSS pixels — derived from pdfmake's OWN page box so the editor's sheets are
// the exact size the saved PDF uses (A4 841.89pt, pageMargins [54,88,54,48]; 1pt = 96/72 px). With
// the same page height, margins and line-height (index.css), the on-screen pages break where the PDF
// does — the editor IS the letter, page by page, editable in place. ─────────────────────────────
const PT = 96 / 72
const MM = 96 / 25.4
const PAGE_H = 841.89 * PT
const M_TOP = 88 * PT             // the letterhead band
const M_BOTTOM = 48 * PT
const GAP = 26                    // the on-screen gap between two sheets
const PITCH = PAGE_H + GAP
const CONTENT_H = PAGE_H - M_TOP - M_BOTTOM

const SPLIT_ATTR = 'data-tbl-split'   // a table continuation (chunk 2+) points at its origin id
let _splitSeq = 0

// A table taller than a page is broken into row-chunks that each fit — separate <table> siblings
// pagination pushes onto their own pages, exactly as pdfmake flows a long table. Rows are MOVED (not
// cloned), so a caret inside a cell rides along and editing is never interrupted.
function _makeContinuation(table, originId) {
  const cont = document.createElement('table')
  cont.className = table.className
  cont.setAttribute(SPLIT_ATTR, originId)
  if (table.tHead) {
    const th = table.tHead.cloneNode(true)
    th.setAttribute('data-repeated', '')
    cont.appendChild(th)
  }
  cont.appendChild(document.createElement('tbody'))
  return cont
}

/** Merge every continuation chunk's rows back into its origin table, then drop the continuations —
 *  run before re-paginating (to measure the real table) and inside cleanHtml. */
function unsplitTables(root) {
  root.querySelectorAll(`table[${SPLIT_ATTR}]`).forEach((cont) => {
    const origin = root.querySelector(`table[data-tbl-origin="${cont.getAttribute(SPLIT_ATTR)}"]`)
    if (origin) {
      const ob = origin.tBodies[0]
      cont.querySelectorAll(':scope > tbody > tr').forEach((tr) => ob && ob.appendChild(tr))
    }
    cont.remove()
  })
  root.querySelectorAll('table[data-tbl-origin]').forEach((t) => t.removeAttribute('data-tbl-origin'))
}

const MIN_ROOM = 120   // need at least a header + a row of space to start a table chunk here

function _spacer(height) {
  const spacer = document.createElement('div')
  spacer.setAttribute('data-pagebreak', '')
  spacer.setAttribute('contenteditable', 'false')
  spacer.setAttribute('aria-hidden', 'true')
  spacer.style.height = `${Math.max(0, height)}px`
  spacer.style.pointerEvents = 'none'
  return spacer
}

/** Move the rows that don't fit in `remaining` px into a continuation table after `table`, keeping
 *  the rows that DO fit. Returns the continuation, or null if not even one row fits. */
function _splitTableToFit(el, table, remaining) {
  const rows = [...table.tBodies[0].rows]
  const headH = table.tHead ? table.tHead.offsetHeight : 0
  let acc = headH
  let cut = -1
  for (let i = 0; i < rows.length; i += 1) {
    const rh = rows[i].offsetHeight
    if (i > 0 && acc + rh > remaining) { cut = i; break }
    acc += rh
  }
  if (cut <= 0) return null
  const originId = table.getAttribute('data-tbl-origin') || `t${(_splitSeq += 1)}`
  table.setAttribute('data-tbl-origin', originId)
  const cont = _makeContinuation(table, originId)
  el.insertBefore(cont, table.nextSibling)
  const cb = cont.tBodies[0]
  for (let j = cut; j < rows.length; j += 1) cb.appendChild(rows[j])
  return cont
}

/** Lay the letter onto sheets: push a block that would straddle a page onto the next one, and flow a
 *  table taller than a page across pages FILLING each (first chunk takes the space left, the rest
 *  continues), as pdfmake does. Returns the page count. */
function paginate(el) {
  if (!el) return 1
  el.querySelectorAll('[data-pagebreak]').forEach((n) => n.remove())
  unsplitTables(el)

  let page = 0
  for (let i = 0; i < el.children.length; i += 1) {
    const kid = el.children[i]
    if (kid.hasAttribute && kid.hasAttribute('data-pagebreak')) continue
    const top = kid.offsetTop
    const height = kid.offsetHeight
    while (top >= (page + 1) * PITCH && page < 400) page += 1
    const pageBottom = page * PITCH + CONTENT_H
    if (kid.classList && kid.classList.contains('pb')) {   // an explicit divider page break
      kid.style.height = `${Math.max(0, (page + 1) * PITCH - top)}px`
      page += 1
      continue
    }
    if (!height) continue
    // A content table that runs past the bottom of this page: split it so the first chunk FILLS the
    // page and the rest flows onto the next, exactly as the PDF does. The old code only split tables
    // taller than a whole page; a table that merely didn't fit in the space LEFT got shoved down
    // whole, leaving a half-blank page — the reported "blank page while editing". Now any oversized
    // table is split. The signature is never split (small, structural — it moves as one block).
    const splittable = kid.tagName === 'TABLE' && kid.tBodies[0]
      && kid.tBodies[0].rows.length >= 2 && !kid.classList.contains('sig')
    if (splittable && top + height > pageBottom + 1) {
      const remaining = pageBottom - top
      const cont = remaining >= MIN_ROOM ? _splitTableToFit(el, kid, remaining) : null
      if (cont) {
        const kidBottom = kid.offsetTop + kid.offsetHeight
        el.insertBefore(_spacer((page + 1) * PITCH - kidBottom), cont)
        page += 1
        i += 1
        continue
      }
      // Not even one row fits in the space left. If moving to a fresh page gains room, do that and
      // re-measure the whole table there (it will then split to fill it). If we're already at a page
      // top and still can't split, let it overflow rather than loop forever.
      if (remaining < CONTENT_H - 1) {
        el.insertBefore(_spacer((page + 1) * PITCH - top), kid)
        page += 1
        continue
      }
    }
    if (height <= CONTENT_H && top + height > pageBottom + 1) {
      el.insertBefore(_spacer((page + 1) * PITCH - top), kid)
      page += 1
      i += 1
    }
  }
  return Math.max(1, Math.ceil(el.scrollHeight / PITCH))
}

/** The letter's HTML, cleaned for saving: drop any leftover page spacers and re-merge tables that an
 *  older paginated edit had split, so the stored document is clean and single-table. */
function cleanHtml(el) {
  if (!el) return ''
  const clone = el.cloneNode(true)
  clone.querySelectorAll('[data-pagebreak]').forEach((n) => n.remove())
  unsplitTables(clone)
  clone.querySelectorAll('thead[data-repeated]').forEach((n) => n.remove())
  return clone.innerHTML
}

// The editable letter body: a contentEditable seeded from the document, with a sticky toolbar,
// flowed across A4 sheets by paginate(). Exposes getHtml() for saving.
function EditableBody({ doc, editorRef, onPages }) {
  const ref = useRef(null)
  const busy = useRef(false)

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = documentBodyHtml(doc)
    if (editorRef) editorRef.current = { getHtml: () => cleanHtml(ref.current) }
    try { document.execCommand('styleWithCSS', false, false) } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id])

  // Re-flow after typing pauses, preserving the caret and the scroll so editing never jumps.
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    let timer = 0
    const scrollParent = () => {
      let n = el.parentElement
      while (n) {
        const oy = getComputedStyle(n).overflowY
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n
        n = n.parentElement
      }
      return document.scrollingElement || document.documentElement
    }
    const run = () => {
      if (busy.current) return
      busy.current = true
      const sel = window.getSelection()
      const hasSel = sel && sel.rangeCount && el.contains(sel.anchorNode)
      const aNode = hasSel ? sel.anchorNode : null
      const aOff = hasSel ? sel.anchorOffset : 0
      const sp = scrollParent()
      const top = sp ? sp.scrollTop : 0
      try {
        onPages(paginate(el))
      } finally {
        if (aNode && el.contains(aNode)) {
          try {
            const max = aNode.nodeType === 3 ? aNode.length : aNode.childNodes.length
            const r = document.createRange()
            r.setStart(aNode, Math.min(aOff, max))
            r.collapse(true)
            sel.removeAllRanges()
            sel.addRange(r)
          } catch { /* selection gone — leave it */ }
        }
        if (sp && Math.abs(sp.scrollTop - top) > 1) sp.scrollTop = top
        busy.current = false
      }
    }
    const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 450) }
    const mo = new MutationObserver(schedule)
    mo.observe(el, { subtree: true, childList: true, characterData: true })
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    const fonts = document.fonts && document.fonts.ready
    if (fonts) fonts.then(schedule)
    run()
    return () => { clearTimeout(timer); mo.disconnect(); ro.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id])

  const Sep = () => <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" />
  return (
    <>
      <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1.5 py-1 shadow-sm">
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

  // Viewing is the real paginated PDF — discrete A4 pages with the letterhead and coloured edge bars
  // on every one, because it IS the issued document.
  if (!editable) return <PdfPreview doc={doc} />

  // Editing is the document page by page: a stack of A4 sheets, each with its own letterhead, text
  // flowed across them by paginate(). The sheet size, margins and line-height match the PDF's, so the
  // page breaks land where the PDF's do and what you edit is what the PDF shows.
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
