import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, ArrowRightCircle, Building2, Check, ChevronDown, ChevronRight, Copy, Eye, FilePlus2,
  FileText, Link as LinkIcon, Lock, Mail, MoreHorizontal, PenLine, Printer, RefreshCw, Rocket, RotateCcw,
  Search, Trash2, Upload, X,
} from 'lucide-react'
import { api } from '../api'
import {
  Badge, Button, Card, EmptyState, Field, IconButton, Modal, PageHeader, Skeleton, Spinner,
  cx, focusRing, inputClass,
} from '../ui'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'
import { ColumnFilter, distinctValues, useColumnFilters } from '../components/tableFilters'
import { EMPTY, ROW, ROW_GROUP, ROW_HOVER, TABLE_SCROLL, TABLE_WRAP, TD, TH, THEAD, THEAD_ROW } from '../components/tableStyles'
import DocumentPaper from '../components/docs/DocumentPaper'
import { documentToPdfBlobUrl } from '../components/docs/pdfDocument'
import { sanitizeHtml } from '../components/docs/docHtml'
import EmailDocumentModal from '../components/docs/EmailDocumentModal'

// doc_type -> label, the FALLBACK only. A document drafted from a template shows the template's
// own name, because doc_type cannot tell an Offer Letter from a Traineeship Offer Letter — three
// such rows read as duplicates of each other.
// Legacy documents carry no template, so the last resort is their raw type ('offer_letter').
// Print that as a name.
const prettify = (k) => String(k || '').replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()).trim()

const DOC_LABEL = {
  offer: 'Offer letter',
  contract: 'Contract',
  nda: 'NDA / Confidentiality',
  'nda-tech': 'NDA - Tech',
  employment_agreement: 'Employment agreement',
  contractor_agreement: 'Contractor agreement',
}


/** The single next step this document is waiting on. Everything else stays reachable. */
function nextStep(d) {
  if (d.move_to_onboarding) return 'locked'
  if (d.has_upload) return 'done'
  if (d.email_sent_at) return 'upload'
  if (d.status === 'approved') return 'send'
  return 'approve'
}



const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null)
// How long the candidate has been sitting on it. Only meaningful while we're waiting on them.
const ageOf = (d) => (nextStep(d) === 'upload' ? daysSince(d.email_sent_at) : null)
const ageClass = (n) => (n >= 14 ? 'font-medium text-rose-700' : n >= 7 ? 'font-medium text-amber-700' : 'text-slate-500')

// created_at / email_sent_at / approved_at are ISO. joining_date is FREE TEXT ("1 July 2026").
const fmtShort = (iso) => {
  if (!iso) return ''
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  const s = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return dt.getFullYear() === new Date().getFullYear() ? s : `${s} ${String(dt.getFullYear()).slice(2)}`
}
const fmtTime = (iso) => {
  const dt = new Date(iso)
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
const fmtLong = (iso) => {
  if (!iso) return ''
  const dt = new Date(iso)
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleString()
}

const ENTITY_LEGAL = { EZ: 'EZ Lab Private Limited', AEZ: 'ArabEasy LLC' }

// Which company's paper the letter is on. Its own column now, so it reads down the table.
const EntityChip = ({ value, title }) => (
  <span title={title || ENTITY_LEGAL[value] || value}
    className="inline-flex shrink-0 items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-px text-[11px] font-medium text-slate-600">
    {value}
  </span>
)

// A date column: the day, with the time underneath only when it is needed to tell two rows apart.
const DateCell = ({ iso, withTime = false }) => {
  if (!iso) return <span className={cx('text-sm', EMPTY)}>—</span>
  return (
    <time dateTime={iso} title={fmtLong(iso)} className="block leading-tight">
      <span className="block text-xs tabular-nums text-slate-600">{fmtShort(iso)}</span>
      {withTime && <span className="block text-[11px] tabular-nums text-slate-400">{fmtTime(iso)}</span>}
    </time>
  )
}

// One person, however their documents are linked. The name|email fallback keeps a candidate with
// no candidate_id from splitting into two blocks.
const personKey = (d) => (d.candidate_id != null ? `c${d.candidate_id}` : `n:${d.candidate_name}|${d.email}`)

// Simple text term fields shown in the generate/edit form; keys match the backend template context.
const TERM_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'contact', label: 'Contact number' },
  { key: 'designation', label: 'Designation' },
  { key: 'department', label: 'Department' },
  { key: 'annual_ctc', label: 'Compensation (CTC)', placeholder: 'e.g. 9 LPA or 900000' },
  { key: 'location', label: 'Location' },
  { key: 'start_date', label: 'Joining date', placeholder: '1 July 2026' },
  { key: 'manager', label: 'Reporting manager' },
  { key: 'manager_role', label: "Reporting manager's position" },
  { key: 'approving_manager', label: 'Approving manager' },
  { key: 'approving_manager_role', label: "Approving manager's position" },
  { key: 'notice_period', label: 'Notice period' },
  { key: 'validity_date', label: 'Offer valid till' },
  { key: 'address', label: 'Candidate address' },
]

function prefillTerms(doc) {
  const t = doc.terms || {}
  return {
    name: doc.candidate_name || '',
    email: doc.email || '',
    contact: doc.contact || '',
    designation: doc.position || '',
    department: doc.department || '',
    annual_ctc: doc.compensation || '',
    location: doc.location || '',
    start_date: doc.joining_date || '',
    manager: doc.reporting_manager || '',
    manager_role: t.manager_role || '',
    approving_manager: doc.approving_manager || '',
    approving_manager_role: t.approving_manager_role || '',
    notice_period: t.notice_period || '',
    validity_date: t.validity_date || '',
    address: t.address || '',
  }
}

// Keyed per doc.id so state initializes from the doc without an effect. mode: 'edit' regenerates
// the same document; 'new' generates an additional document for the same candidate/application.
function DocFormModal({ doc, mode, templates, lockedEntity, onClose, onDone }) {
  const { toast } = useToast()
  const [templateKey, setTemplateKey] = useState(
    mode === 'new' ? '' : doc.template_key || '',  // '' -> the effect below picks the entity's first
  )
  const [entity, setEntity] = useState(lockedEntity || doc.entity || 'EZ')
  const [terms, setTerms] = useState(prefillTerms(doc))
  const [resp, setResp] = useState(
    Array.isArray(doc.terms?.responsibilities) ? doc.terms.responsibilities.join('\n') : '',
  )
  const [busy, setBusy] = useState(false)

  // Templates the recruiter can pick, narrowed to the letters the selected entity actually
  // issues. Each template is tagged entity / party_type / contract_type / doc_type; only entity
  // is filtered on here — the other axes are available for a cascading picker later.
  const options = templates.filter((t) => !t.entity || t.entity === entity)
  const noTemplates = options.length === 0

  // Switching entity can strand a template the new entity doesn't issue — fall back to its first.
  useEffect(() => {
    if (options.length && !options.some((t) => t.key === templateKey)) setTemplateKey(options[0].key)
  }, [entity, templates]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true)
    try {
      const responsibilities = resp.split('\n').map((s) => s.trim()).filter(Boolean)
      const payload = { entity, ...terms, responsibilities }
      const up =
        mode === 'new'
          ? await api.generateDocument({ application_id: doc.application_id, doc_type: templateKey, template_key: templateKey, terms: payload })
          : await api.regenerateDocument(doc.id, { template_key: templateKey, terms: payload })
      toast(mode === 'new' ? 'Document generated' : 'Document regenerated')
      onDone(up, mode)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const isNew = mode === 'new'
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'Generate a new document' : 'Edit & regenerate this document'}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || noTemplates} variant={isNew ? 'primary' : 'ghost'}>
            {busy ? <Spinner /> : isNew ? <><FilePlus2 className="h-4 w-4" /> Generate document</> : <><RefreshCw className="h-4 w-4" /> Regenerate in place</>}
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className={cx(
          'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-relaxed',
          isNew ? 'border-brand-200 bg-brand-50/60 text-brand-800' : 'border-amber-200 bg-amber-50/60 text-amber-800',
        )}>
          {isNew ? <FilePlus2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> : <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
          <span>
            {isNew
              ? <>This creates an <strong>additional</strong> document for {doc.candidate_name || 'this candidate'} — your existing documents are kept. The template starts at Offer letter; change it below.</>
              : <>This <strong>replaces</strong> the current draft of this document in place with your edits. Only drafts can be regenerated; approved documents are locked.</>}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Entity"
            hint={lockedEntity
              ? 'Settled by this candidate\u2019s first document — a candidate holds documents from one entity only.'
              : 'This is the first document for this candidate, so it settles which entity they are on.'}
          >
            {lockedEntity ? (
              <div className={cx(inputClass, 'flex items-center gap-2 bg-slate-50 text-slate-600')}>
                <EntityChip value={lockedEntity} />
                <span className="min-w-0 truncate">{ENTITY_LEGAL[lockedEntity] || lockedEntity}</span>
                <Lock className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              </div>
            ) : (
              <select className={inputClass} value={entity} onChange={(e) => setEntity(e.target.value)}>
                <option value="EZ">EZ — EZ Lab Private Limited</option>
                <option value="AEZ">AEZ — ArabEasy LLC</option>
              </select>
            )}
          </Field>
          <Field
            label="Document to generate"
            hint={noTemplates ? `No templates are configured for ${entity} yet.` : undefined}
          >
            <select
              className={inputClass}
              value={templateKey}
              disabled={noTemplates}
              onChange={(e) => setTemplateKey(e.target.value)}
            >
              {noTemplates
                ? <option value="">— none available —</option>
                : options.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TERM_FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <input className={inputClass} value={terms[f.key] || ''} placeholder={f.placeholder}
                onChange={(e) => setTerms((p) => ({ ...p, [f.key]: e.target.value }))} />
            </Field>
          ))}
        </div>
        <Field label="Responsibilities (one per line)" hint="Defaults to the role's job description when left blank.">
          <textarea className={`${inputClass} h-24 resize-y`} value={resp} onChange={(e) => setResp(e.target.value)}
            placeholder={'Design and operate high-throughput APIs\nMentor junior engineers'} />
        </Field>
        <p className="text-xs leading-relaxed text-slate-500">
          Autofilled from the candidate &amp; role — edit anything. The compensation table is computed from the CTC; leave a field blank to use the template default.
        </p>
      </div>
    </Modal>
  )
}

// ── Table geometry ──────────────────────────────────────────────────────────────────────────
// One grid, declared once. Every cell obeys a two-band vertical rhythm and nothing else, which is
// what keeps every row reading as the same shape all the way down the page.
// The same header, padding and hover DataTable and JobsListTable use, so this table reads as
// part of the app rather than as its own thing.
// The app's one table vocabulary — see components/tableStyles.js.
// Every cell is one 28px line. Nothing stacks, so a row is a row.
const B1 = 'flex h-7 min-w-0 items-center gap-2'
// A document's status is not a column anyone can write: each state is the trace of a real event
// — approving it, emailing it, filing the signed copy back, moving the candidate to onboarding.
// So the dropdown reads as a status and behaves as the control that performs the next event.
const STATUS = [
  { key: 'draft', label: 'Draft', tone: 'text-amber-700' },
  { key: 'approved', label: 'Approved', tone: 'text-amber-700' },
  { key: 'sent', label: 'Sent for signature', tone: 'text-sky-700' },
  { key: 'signed', label: 'Signed', tone: 'text-emerald-700' },
  { key: 'onboarding', label: 'In onboarding', tone: 'text-slate-500' },
]
// One tone per state, carried by the chip, its dot and its caret together — so status is legible
// as a colour at a glance and still reads as a control you can open.
const TONE = {
  draft: { dot: 'bg-slate-400', chip: 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50' },
  approved: { dot: 'bg-amber-500', chip: 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100' },
  sent: { dot: 'bg-sky-500', chip: 'border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-300 hover:bg-sky-100' },
  signed: { dot: 'bg-emerald-500', chip: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100' },
  onboarding: { dot: 'bg-slate-400', chip: 'border-slate-200 bg-slate-100 text-slate-600' },
}
const statusOf = (d) => (d.move_to_onboarding ? 'onboarding'
  : d.has_upload ? 'signed'
    : d.email_sent_at ? 'sent'
      : d.status === 'approved' ? 'approved' : 'draft')

function StatusSelect({ doc: d, person: p, busy, title, onApprove, onEmail, onUpload, onOnboard }) {
  const now = statusOf(d)
  const locked = !!d.move_to_onboarding
  const tone = TONE[now] || TONE.draft

  // What each option would actually do. Anything with no honest action behind it is disabled
  // rather than silently doing nothing.
  const run = {
    draft: null,                                   // nothing un-approves a document
    approved: !locked && d.status !== 'approved' ? () => onApprove(d) : null,
    sent: !locked ? () => onEmail(d) : null,
    signed: !locked ? onUpload : null,
    onboarding: !locked && p.appDoc?.id ? () => onOnboard(p) : null,
  }
  const why = {
    draft: 'A document cannot be moved back to draft',
    approved: locked ? 'Locked — the candidate is in onboarding' : 'Already approved',
    sent: 'Locked — the candidate is in onboarding',
    signed: 'Locked — the candidate is in onboarding',
    onboarding: locked ? 'Already in onboarding' : 'This candidate has no linked application',
  }

  return (
    <span title={title || undefined} className="relative inline-flex min-w-0 max-w-[10.5rem] flex-1 items-center">
      <span aria-hidden className={cx('pointer-events-none absolute left-2.5 h-1.5 w-1.5 rounded-full', tone.dot)} />
      <select
        value={now}
        disabled={busy || locked}
        aria-label={`Status of this document for ${p.name}`}
        onChange={(e) => run[e.target.value]?.()}
        className={cx(
          'h-7 w-full min-w-0 appearance-none truncate rounded-full border py-0 pl-6 pr-7 text-xs font-medium outline-none',
          'transition-colors duration-150 ease-snappy disabled:cursor-not-allowed disabled:opacity-80',
          focusRing, tone.chip,
        )}
      >
        {STATUS.map((o) => (
          <option key={o.key} value={o.key} disabled={o.key !== now && !run[o.key]} title={run[o.key] ? undefined : why[o.key]}>
            {o.label}
          </option>
        ))}
      </select>
      {!locked && <ChevronDown aria-hidden className="pointer-events-none absolute right-2 h-3 w-3 opacity-60" />}
    </span>
  )
}


// One vertical rhythm for every cell: a 28px band for the control, an 18px band for its note.
// A candidate's first row opens with a little more air and their last closes with a firmer rule,
// so a person's letters read as one block without a tinted band drawing a box round them.


// ── The overflow menu ───────────────────────────────────────────────────────────────────────
// Portal + fixed positioning: the table lives in an overflow-auto scroller, so an in-flow dropdown
// would be clipped. Same machinery as ColumnFilter.
function RowMenu({ items, label, text }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const W = 264
    // py-1.5 (12) + one text-sm line (20) = 32; a note adds a text-[11px] line (16). A separator
    // is my-1 + h-px = 9. The +8 is the list's own py-1.
    const h = Math.max(8, items.reduce((acc, it) => acc + (it.sep ? 9 : it.note ? 48 : 32), 8))
    setPos({
      top: Math.min(r.bottom + 6, Math.max(8, window.innerHeight - h - 12)),
      left: Math.min(Math.max(8, r.right - W), window.innerWidth - W - 8),
      width: W,
    })
  }, [open, items])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() } }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  // Roving focus, so the menu is usable without a mouse.
  function onMenuKey(e) {
    const nodes = [...(popRef.current?.querySelectorAll('[role="menuitem"]') || [])]
    if (!nodes.length) return
    const at = nodes.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); nodes[(at + 1) % nodes.length].focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); nodes[(at - 1 + nodes.length) % nodes.length].focus() }
    else if (e.key === 'Home') { e.preventDefault(); nodes[0].focus() }
    else if (e.key === 'End') { e.preventDefault(); nodes[nodes.length - 1].focus() }
    else if (e.key === 'Tab') setOpen(false)
  }

  const ITEM = cx(
    'flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm text-slate-700',
    'transition-colors duration-150 ease-snappy hover:bg-slate-50 focus-visible:bg-slate-50',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/50',
  )

  // The label owns its line and truncates; anything secondary sits underneath it, in full.
  const body = (it) => (
    <>
      <span className="mt-0.5 shrink-0">{it.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate leading-5">{it.label}</span>
        {it.note && (
          <span className="block truncate text-[11px] leading-4 text-slate-400" title={it.note}>{it.note}</span>
        )}
      </span>
    </>
  )
  return (
    <>
      {text ? (
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          onClick={() => setOpen((v) => !v)}
          className={cx('flex min-w-0 items-center gap-1 rounded text-left', focusRing)}
        >
          <span className="min-w-0 truncate text-sm font-semibold text-slate-900" title={text}>{text}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
        </button>
      ) : (
        <IconButton
          ref={btnRef}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          title={label}
          onClick={() => setOpen((v) => !v)}
          className={cx('h-7 w-7 shrink-0 p-0', open && 'bg-slate-100 text-slate-800')}
        >
          <MoreHorizontal className="h-4 w-4" />
        </IconButton>
      )}
      {open && pos && createPortal(
        <div
          ref={popRef}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="menu-in z-[120] origin-top-right overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
        >
          {items.map((it, i) => (
            it.sep ? <div key={`sep${i}`} role="separator" className="my-1 h-px bg-slate-100" />
              : it.href ? (
                <a
                  key={it.label}
                  role="menuitem"
                  href={it.href}
                  target="_blank"
                  rel="noreferrer"
                  title={it.title}
                  onClick={() => setOpen(false)}
                  className={ITEM}
                >
                  {body(it)}
                </a>
              ) : (
                <button
                  key={it.label}
                  role="menuitem"
                  type="button"
                  title={it.title}
                  onClick={() => { setOpen(false); it.onClick() }}
                  className={ITEM}
                >
                  {body(it)}
                </button>
              )
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

// Opening the copy that was filed back. The route is behind the Bearer auth gate, so a plain
// <a href> navigation (no Authorization header) is answered with a 401 — fetch it as an
// authenticated Blob and open that, the same way Assessments opens its files.
async function openSignedCopy(doc, toast) {
  let url = ''
  try {
    url = URL.createObjectURL(await api.fetchDocumentUploadFile(doc.id))
    if (!window.open(url, '_blank', 'noopener')) {
      // Pop-up blocked: fall back to a same-gesture download so the file still reaches them.
      const a = document.createElement('a')
      a.href = url; a.download = doc.upload_filename || 'signed-copy.pdf'
      document.body.appendChild(a); a.click(); a.remove()
    }
  } catch (err) {
    toast(err.message, 'error')
  } finally {
    // Give the new tab time to load the blob before the URL is revoked.
    if (url) setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}

// Filing the signed & countersigned copy back. One file input per row, driven by whichever control
// is currently offering it — never duplicated.
function useUpload(doc, onUploaded) {
  const { toast } = useToast()
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      onUploaded(await api.uploadDocumentFile(doc.id, fd))
      toast('Countersigned copy filed')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
      e.target.value = ''   // re-filing the same filename must fire change again
    }
  }
  return { inputRef: ref, busy, onFile, pick: () => ref.current?.click() }
}

// A fact that belongs to the PERSON, not to one letter: the covering email goes to
// personal_email || email, and joining_date renders into every letter's body. The backend stores
// both per document, so a commit fans out across that candidate's unlocked documents — and always
// across ALL of them, never merely the ones a filter happens to be showing.
function PersonField({ person, field, label, placeholder, note: extraNote, onSaved }) {
  const { toast } = useToast()
  const targets = person.all.filter((d) => !d.move_to_onboarding)
  const values = [...new Set(targets.map((d) => d[field] || ''))]
  const shared = values.length <= 1 ? values[0] || '' : ''
  const differs = values.length > 1
  const [val, setVal] = useState(shared)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const noteId = useId()
  useEffect(() => { setVal(shared); setDirty(false) }, [shared])

  async function commit() {
    // `dirty` matters: when the letters disagree the input starts empty, so without it merely
    // tabbing through would PATCH "" onto every one of them.
    if (!dirty || busy || !targets.length) return
    const next = val.trim()
    if (!differs && next === shared) { setDirty(false); return }
    setBusy(true)
    setErr('')
    const res = await Promise.allSettled(targets.map((d) => api.updateDocumentFields(d.id, { [field]: next })))
    res.forEach((r) => r.status === 'fulfilled' && onSaved(r.value))
    const failed = res.filter((r) => r.status === 'rejected').length
    if (failed) {
      setErr(`${failed} of ${targets.length} didn’t save`)
      toast(`${failed} of ${targets.length} documents didn’t save — they still show the old value.`, 'error')
    }
    setBusy(false)
    setDirty(false)
  }

  if (!targets.length) {
    const value = person.all[0]?.[field] || ''
    return (
      <span className={cx(B1, 'px-2 text-sm text-slate-700')}>
        <span className="min-w-0 truncate" title={value}>{value || '—'}</span>
        <Lock className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
        <span className="sr-only">Locked — every document for {person.name} has moved to onboarding.</span>
      </span>
    )
  }

  const note = err ? { text: err, cls: 'text-rose-700' }
    : busy ? { text: 'Saving…', cls: 'text-slate-500' }
      : differs ? { text: 'Differs — sets all', cls: 'text-amber-700' }
        : !val && extraNote ? { text: extraNote, cls: 'text-amber-700' }
          : null

  return (
    <div className={B1}>
      {/* pulled left by the cell's own padding so the value sits on the same line as every
          other cell's text, while the hover state still has room to breathe */}
      <div className="-ml-2 min-w-0 flex-1">
        <input
          type="text"
          value={val}
          disabled={busy}
          placeholder={differs ? 'Several values' : placeholder}
          aria-label={`${label} for ${person.name}`}
          aria-describedby={note ? noteId : undefined}
          title={differs
            ? `${person.name}’s letters hold different values. Typing here sets all ${targets.length}.`
            : `Applies to all ${targets.length} unlocked document${targets.length === 1 ? '' : 's'} for ${person.name}.`}
          onChange={(e) => { setDirty(true); setVal(e.target.value) }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { setVal(shared); setDirty(false); e.currentTarget.blur() }
          }}
          className={cx(
            'h-7 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-slate-800 outline-none',
            'transition-colors duration-150 ease-snappy',
            'hover:border-slate-300 hover:bg-white focus:border-brand-500 focus:bg-white',
            'disabled:cursor-not-allowed disabled:opacity-60', focusRing,
            differs ? 'placeholder:text-amber-700' : 'placeholder:text-slate-500',
          )}
        />
      </div>
      {note && (
        <span id={noteId} title={note.text} className={cx('shrink-0 cursor-help', note.cls)}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">{note.text}</span>
        </span>
      )}
    </div>
  )
}

// A column heading with its filter attached. Every column has one: on a table that groups
// twenty candidates' letters together, narrowing by hand is the only way to find anything.
function FilterHead({ label, colKey, values, filters, onFilter, align }) {
  return (
    <th scope="col" className={cx(TH, align === 'right' && 'text-right')}>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {label}
        <ColumnFilter label={label} values={values} excluded={filters[colKey] || []} onChange={onFilter(colKey)} />
      </span>
    </th>
  )
}

// ── One document ────────────────────────────────────────────────────────────────────────────
function DocRow({ doc: d, person: p, name, templateBacked, onMerge, onPreview, onAskDelete,
  onEditLetter, onEmail, onDetails, onApprove, onEntity, onAskOnboard }) {
  const { toast } = useToast()
  const locked = !!d.move_to_onboarding
  const step = nextStep(d)
  const isDraft = d.status !== 'approved'
  const age = ageOf(d)
  const [approving, setApproving] = useState(false)
  const { inputRef, busy: uploading, onFile: onUploadFile, pick: pickFile } = useUpload(d, onMerge)

  async function runApprove() {
    setApproving(true)
    try { await onApprove(d) } finally { setApproving(false) }
  }

  // When this status was reached. It rides on the control as a tooltip rather than as a chip
  // beside it: Created and Updated are columns of their own now, so a third inline date read as
  // noise and cost the status label the width it needed.
  const reached = d.email_sent_at ? `Sent ${fmtLong(d.email_sent_at)}`
    : d.status === 'approved' && d.approved_at ? `Approved ${fmtLong(d.approved_at)}`
      : ''

  const entityTitle = templateBacked
    ? `${ENTITY_LEGAL[d.entity] || d.entity} — set by the ${name} template`
    : p.all.length === 1
      ? `${ENTITY_LEGAL[d.entity] || d.entity} — change it from this row’s menu while it is ${p.name}’s only document`
      : `${ENTITY_LEGAL[d.entity] || d.entity} — settled: ${p.name} holds documents on this entity`

  const menuItems = [
    !locked && isDraft && step !== 'approve' && {
      label: 'Approve now', icon: <Check className="h-3.5 w-3.5 text-slate-400" />, onClick: runApprove,
    },
    !locked && isDraft && { label: 'Edit the wording…', icon: <PenLine className="h-3.5 w-3.5 text-slate-400" />, onClick: () => onEditLetter(d) },
    !locked && isDraft && templateBacked && d.application_id && {
      label: 'Details & template…', icon: <RefreshCw className="h-3.5 w-3.5 text-slate-400" />, onClick: () => onDetails(d),
    },
    !locked && step !== 'send' && {
      label: d.email_sent_at ? 'Email again…' : 'Email now…', icon: <Mail className="h-3.5 w-3.5 text-slate-400" />, onClick: () => onEmail(d),
    },
    !locked && step !== 'upload' && {
      label: d.has_upload ? 'Replace signed copy' : 'Upload signed copy',
      icon: <Upload className="h-3.5 w-3.5 text-slate-400" />, onClick: pickFile,
    },
    d.has_upload && {
      label: 'View signed copy', icon: <FileText className="h-3.5 w-3.5 text-slate-400" />,
      title: d.upload_filename, onClick: () => openSignedCopy(d, toast),
    },
    { sep: true },
    {
      label: 'Print / PDF', icon: <Printer className="h-3.5 w-3.5 text-slate-400" />,
      onClick: () => documentToPdfBlobUrl(d)
        .then((u) => { if (!window.open(u, '_blank')) toast('Allow pop-ups to open the PDF', 'error') })
        .catch((e) => toast(e.message, 'error')),
    },
    {
      label: 'Copy letter text', icon: <Copy className="h-3.5 w-3.5 text-slate-400" />,
      onClick: () => { navigator.clipboard.writeText(d.content || ''); toast('Copied to clipboard') },
    },
    !locked && !templateBacked && p.all.length === 1 && {
      label: `Switch entity to ${d.entity === 'EZ' ? 'AEZ' : 'EZ'}`,
      icon: <Building2 className="h-3.5 w-3.5 text-slate-400" />,
      onClick: () => onEntity(d, d.entity === 'EZ' ? 'AEZ' : 'EZ'),
    },
    !locked && !d.has_upload && { sep: true },
    !locked && !d.has_upload && {
      label: 'Delete this document', icon: <Trash2 className="h-3.5 w-3.5 text-rose-500" />,
      note: d.email_sent_at ? 'already emailed' : undefined,
      onClick: () => onAskDelete(d),
    },
  ].filter(Boolean)


  return (
    <tr
      onClick={(e) => { if (!e.target.closest('button,a,input,select,label,[role="menu"]')) onPreview(d) }}
      className={cx('group/row cursor-pointer', ROW, ROW_HOVER)}
    >
      {/* 1 — the candidate owns this column; a letter sits under their heading */}
      <td className={TD} />

      {/* 2 — which letter */}
      <td className={cx(TD, 'pl-6')}>
        <div className={B1}>
          <button
            type="button"
            onClick={() => onPreview(d)}
            title={name}
            className={cx('min-w-0 shrink truncate rounded text-left text-sm font-medium text-slate-800 underline-offset-2 hover:text-brand-700 hover:underline', focusRing)}
          >
            {name}
          </button>
          {d.content_html && (
            <Badge size="sm" tone="violet" className="shrink-0"><PenLine className="mr-1 h-3 w-3" aria-hidden />Edited</Badge>
          )}
        </div>
      </td>

      {/* 3 — whose paper it is on */}
      <td className={TD}><EntityChip value={d.entity} title={entityTitle} /></td>

      {/* 4 — where it has got to, and the control that moves it on */}
      <td className={TD}>
        <div className={B1}>
          <StatusSelect
            doc={d}
            person={p}
            title={reached}
            busy={approving || uploading}
            onApprove={onApprove}
            onEmail={onEmail}
            onUpload={pickFile}
            onOnboard={onAskOnboard}
          />
          {age != null && age >= 1 && (
            <span className={cx('shrink-0 text-xs tabular-nums', ageClass(age))} title={`${age} days since the covering email was sent`}>{age}d</span>
          )}
        </div>
      </td>

      {/* 5 & 6 — inherited from the candidate, so the row is never half empty */}
      <td className={TD}>
        <span className="block truncate text-sm text-slate-400" title={d.joining_date}>{d.joining_date || '—'}</span>
      </td>
      <td className={TD}>
        <span className="block truncate text-sm text-slate-400" title={d.personal_email || p.email}>
          {d.personal_email || p.email || '—'}
        </span>
      </td>

      {/* 7 & 8 — when it was drafted, and when it last moved. The time shows only on the
          rows that would otherwise read as duplicates of each other. */}
      <td className={TD}><DateCell iso={d.created_at} withTime={p.twin(d)} /></td>
      <td className={TD}><DateCell iso={d.updated_at || ''} /></td>

      {/* 9 — preview stays out; everything else is one click deeper */}
      <td className={TD}>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only"
          tabIndex={-1} aria-hidden="true" onChange={onUploadFile} />
        <div className={cx(B1, 'justify-end gap-1 text-slate-400 opacity-70 transition-opacity duration-150 ease-snappy',
          'group-hover/row:opacity-100 group-focus-within/row:opacity-100')}>
          <IconButton onClick={() => onPreview(d)} className="h-7 w-7 shrink-0 p-0"
            aria-label={`Preview the ${name} for ${p.name}`} title={`Preview the ${name}`}>
            <Eye className="h-4 w-4" />
          </IconButton>
          <RowMenu label={`More actions for the ${name} for ${p.name}`} items={menuItems} />
        </div>
      </td>
    </tr>
  )
}

// A candidate: click the row to open or close their letters. Their joining date and personal
// email live here rather than on every letter, because they belong to the person — editing one
// writes to all of their unlocked documents.
function CandidateRow({ person: p, shown, open, onToggle, onMerge, onAskOnboard, onAddDoc, onOpenOnboarding }) {
  const { toast } = useToast()
  const count = shown.length
  // Counted over the rows on screen, not over every document the candidate has — otherwise a
  // filtered block reads "2 documents" beside a tally of five.
  const summary = useMemo(() => {
    const by = {}
    for (const d of shown) { const k = statusOf(d); by[k] = (by[k] || 0) + 1 }
    return STATUS.filter((o) => by[o.key]).map((o) => `${by[o.key]} ${o.label.toLowerCase()}`).join(' · ')
  }, [shown])


  const items = [
    p.appDoc && { label: 'Add document…', icon: <FilePlus2 className="h-3.5 w-3.5 text-slate-400" />, onClick: () => onAddDoc(p) },
    !p.anyMoved && p.appDoc?.id && { label: 'Send to onboarding…', icon: <ArrowRightCircle className="h-3.5 w-3.5 text-slate-400" />, onClick: () => onAskOnboard(p) },
    p.anyMoved && { label: 'Open in Onboarding', icon: <Rocket className="h-3.5 w-3.5 text-slate-400" />, onClick: onOpenOnboarding },
    { sep: true },
    p.appDoc?.candidate_id && {
      label: 'Copy onboarding form link', icon: <LinkIcon className="h-3.5 w-3.5 text-slate-400" />,
      note: 'their own, prefilled',
      onClick: async () => {
        try {
          const { url } = await api.onboardingFormLink(p.appDoc.candidate_id)
          navigator.clipboard.writeText(url)
          toast('Onboarding form link copied')
        } catch (e) { toast(e.message, 'error') }
      },
    },
    {
      label: 'Copy work email', icon: <Copy className="h-3.5 w-3.5 text-slate-400" />, note: p.email,
      onClick: () => { navigator.clipboard.writeText(p.email || ''); toast('Work email copied') },
    },
    p.contact && {
      label: 'Copy phone', icon: <Copy className="h-3.5 w-3.5 text-slate-400" />, note: p.contact,
      onClick: () => { navigator.clipboard.writeText(p.contact); toast('Phone number copied') },
    },
  ].filter(Boolean)

  return (
    <tr
      onClick={(e) => { if (!e.target.closest('button,a,input,select,label,[role="menu"]')) onToggle() }}
      className={cx('cursor-pointer bg-slate-50/70', ROW_GROUP, ROW_HOVER)}
    >
      <td className={TD} colSpan={2}>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} ${p.name}’s documents`}
            onClick={onToggle}
            className={cx('inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200/70 hover:text-slate-600',
              focusRing)}
          >
            <ChevronRight className={cx('h-4 w-4 transition-transform duration-150 ease-snappy', open && 'rotate-90')} />
          </button>
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">
            {(p.name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-900">{p.name}</span>
            <span className="block truncate text-xs text-slate-500" title={p.email}>
              {p.email || '—'}
              <span className="text-slate-400"> · <span className="tabular-nums">{count}</span> {count === 1 ? 'document' : 'documents'}</span>
            </span>
          </span>
        </div>
      </td>
      <td className={TD}>
        <div className="flex min-w-0 items-center gap-1">
          {p.entity
            ? <EntityChip value={p.entity} />
            : <span className={cx('text-sm', EMPTY)}>—</span>}
          {p.entityConflict && (
            <span
              className="shrink-0 cursor-help text-amber-700"
              title={`${p.name} has documents on more than one entity (${p.entityConflict.join(', ')}). A candidate should hold documents from one entity only — the odd letter needs deleting or re-drafting.`}
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Documents on more than one entity</span>
            </span>
          )}
        </div>
      </td>
      <td className={TD}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-xs text-slate-500">{summary}</span>
          {p.anyMoved ? (
            <Badge size="sm" tone="gray" className="shrink-0"><Rocket className="mr-1 h-3 w-3" aria-hidden />Onboarding</Badge>
          ) : p.allSigned ? (
            <button
              type="button"
              onClick={() => onAskOnboard(p)}
              title={`Send ${p.name} to onboarding — every document is signed`}
              className={cx('inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 transition-colors duration-150 ease-snappy hover:border-emerald-300 hover:bg-emerald-100', focusRing)}
            >
              Ready <ArrowRight className="h-3 w-3" aria-hidden />
            </button>
          ) : null}
        </div>
      </td>
      <td className={TD}>
        <PersonField person={p} field="joining_date" label="Joining date" placeholder="Add date"
          note={p.drafts.length ? 'Needed before sending' : ''} onSaved={onMerge} />
      </td>
      <td className={TD}>
        <PersonField person={p} field="personal_email" label="Email" placeholder="Add personal email"
          note={p.anySent ? 'Went out to the work email' : ''} onSaved={onMerge} />
      </td>
      <td className={TD} title="When their first document was drafted"><DateCell iso={p.firstAt} /></td>
      <td className={TD} title="When anything on their documents last moved"><DateCell iso={p.lastAt} /></td>
      <td className={TD}>
        <div className="flex items-center justify-end">
          <RowMenu label={`${p.name} — candidate actions`} items={items} />
        </div>
      </td>
    </tr>
  )
}

export default function OfferDocs() {
  usePageTitle('Offer & Docs')
  const { toast } = useToast()
  const navigate = useNavigate()
  const [docs, setDocs] = useState(null)
  const [templates, setTemplates] = useState([])
  const [view, setView] = useState(null)
  const [editing, setEditing] = useState(false)     // rich-editor mode for the viewed document
  const editorRef = useRef(null)
  const [form, setForm] = useState(null)            // { doc, mode }
  const [emailing, setEmailing] = useState(null)    // the document whose covering mail is being reviewed
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState('recent')
  const [page, setPage] = useState(0)
  // Candidates open by default — everything is visible on arrival; clicking a name folds it away.
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [confirm, setConfirm] = useState(null)      // { p, body } — sending someone to onboarding
  const [barBusy, setBarBusy] = useState(false)
  const colFilters = useColumnFilters()

  const openView = (d) => { setEditing(false); setView(d) }
  const openEditor = (d) => { setView(d); setEditing(true) }
  const closeView = () => { setEditing(false); setView(null) }

  const load = () => api.listAllDocuments().then(setDocs).catch(() => setDocs([]))
  useEffect(() => { load() }, [])
  useEffect(() => { api.listDocumentTemplates().then(setTemplates).catch(() => setTemplates([])) }, [])

  const mergeDoc = (up) => {
    setDocs((list) => (list || []).map((x) => (x.id === up.id ? { ...x, ...up } : x)))
    setView((v) => (v && v.id === up.id ? { ...v, ...up } : v))
  }

  const tplByKey = useMemo(() => new Map(templates.map((t) => [t.key, t])), [templates])
  const nameOf = useMemo(() => (d) => tplByKey.get(d.template_key)?.label || DOC_LABEL[d.doc_type] || prettify(d.doc_type), [tplByKey])
  const identOf = useMemo(() => (d) => `${nameOf(d)}|${d.entity}|${fmtShort(d.created_at)}`, [nameOf])

  // Every candidate-scoped fact comes from the UNFILTERED set, so narrowing the table stays purely
  // presentational: a stage chip can't make "all signed" appear, and typing a joining date can't
  // write to only the rows that happen to be visible.
  const people = useMemo(() => {
    const m = new Map()
    for (const d of docs || []) {
      const k = personKey(d)
      let p = m.get(k)
      if (!p) m.set(k, (p = { key: k, name: d.candidate_name || 'Candidate', email: d.email || '', contact: d.contact || '', all: [] }))
      p.all.push(d)
    }
    for (const p of m.values()) {
      p.live = p.all.filter((x) => !x.move_to_onboarding)
      p.drafts = p.live.filter((x) => x.status !== 'approved')
      p.anyMoved = p.all.some((x) => x.move_to_onboarding)
      p.allSigned = p.live.length > 0 && p.live.every((x) => x.has_upload)
      p.anySent = p.all.some((x) => x.email_sent_at)
      p.appDoc = p.all.find((x) => x.application_id)
      p.newest = p.all.reduce((t, x) => Math.max(t, +new Date(x.created_at) || 0), 0)
      // A candidate belongs to ONE operating entity. Their first document establishes it;
      // everything after must be issued on the same paper.
      const inOrder = [...p.all].sort((a, b) => a.id - b.id)
      p.entity = inOrder[0]?.entity || ''
      // Documents that predate the rule can still disagree. Say so rather than picking one and
      // pretending — the odd letter is on the wrong company's paper and somebody must decide.
      const spread = [...new Set(p.all.map((x) => x.entity).filter(Boolean))]
      p.entityConflict = spread.length > 1 ? spread : null
      // Their block's own span: when the first letter was drafted, and when anything last moved.
      // updated_at is NULL on documents drafted before the column existed, so created_at stands in.
      const made = p.all.map((x) => +new Date(x.created_at) || 0).filter(Boolean)
      const touched = p.all.map((x) => +new Date(x.updated_at || x.created_at) || 0).filter(Boolean)
      p.firstAt = made.length ? new Date(Math.min(...made)).toISOString() : ''
      p.lastTouch = touched.length ? Math.max(...touched) : 0
      p.lastAt = p.lastTouch ? new Date(p.lastTouch).toISOString() : ''
      p.waiting = p.all.reduce((t, x) => Math.max(t, ageOf(x) ?? -1), -1)
      p.differs = (f) => new Set(p.live.map((x) => x[f] || '')).size > 1
      const seen = new Map()
      for (const x of p.all) { const i = identOf(x); seen.set(i, (seen.get(i) || 0) + 1) }
      p.twin = (x) => seen.get(identOf(x)) > 1
    }
    return m
  }, [docs, identOf])

  const searched = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return docs || []
    return (docs || []).filter((d) => [
      d.candidate_name, d.email, d.personal_email, d.contact, nameOf(d), d.entity, d.joining_date, d.upload_filename,
    ].some((v) => String(v || '').toLowerCase().includes(n)))
  }, [docs, nameOf, q])

  // What each column filters ON. These read the DISPLAYED value, so what a recruiter ticks in
  // the dropdown is exactly what they can see in the column.
  const accessors = useMemo(() => ({
    candidate: (d) => d.candidate_name || '',
    document: nameOf,
    entity: (d) => d.entity || '',
    status: (d) => STATUS.find((o) => o.key === statusOf(d))?.label || '',
    joining: (d) => d.joining_date || '',
    email: (d) => d.personal_email || d.email || '',
    created: (d) => fmtShort(d.created_at),
    updated: (d) => fmtShort(d.updated_at || ''),
  }), [nameOf])

  // Date columns are listed newest-first rather than alphabetically: sorted as text, "24 Aug"
  // lands before "8 Aug", which is nonsense in a list of dates.
  const colValues = useMemo(() => {
    const all = docs || []
    const byDate = (iso) => {
      const seen = new Map()
      for (const d of all) { const t = iso(d); seen.set(fmtShort(t) || '', +new Date(t) || 0) }
      return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label)
    }
    return {
      candidate: distinctValues(all, accessors.candidate),
      document: distinctValues(all, accessors.document),
      entity: distinctValues(all, accessors.entity),
      status: distinctValues(all, accessors.status),
      joining: distinctValues(all, accessors.joining),
      email: distinctValues(all, accessors.email),
      created: byDate((d) => d.created_at),
      updated: byDate((d) => d.updated_at || ''),
    }
  }, [docs, accessors])

  const onFilter = useCallback(
    (key) => (excluded) => { colFilters.setFilter(key, excluded); setPage(0) },
    [colFilters],
  )

  const filteredDocs = useMemo(() => colFilters.apply(searched, accessors), [searched, colFilters, accessors])

  // Which documents to draw and in what order. The API returns newest-first GLOBALLY, so without
  // regrouping a candidate's letters are scattered and their name prints over and over.
  const groups = useMemo(() => {
    const blocks = new Map()
    for (const d of filteredDocs) {
      const k = personKey(d)
      if (!blocks.has(k)) blocks.set(k, [])
      blocks.get(k).push(d)
    }
    const list = [...blocks.entries()].map(([k, shown]) => ({ p: people.get(k), shown })).filter((b) => b.p)
    const cmp = {
      recent: (a, b) => b.p.newest - a.p.newest,
      updated: (a, b) => b.p.lastTouch - a.p.lastTouch,
      waiting: (a, b) => b.p.waiting - a.p.waiting || b.p.drafts.length - a.p.drafts.length,
      name: (a, b) => a.p.name.localeCompare(b.p.name),
    }[sortKey]
    list.sort(cmp)
    return list.map(({ p, shown }) => ({
      p,
      rows: [...shown].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    }))
  }, [filteredDocs, people, sortKey])

  // A page holds whole candidates: splitting someone's letters across a page break would leave
  // their name, joining date and email on one page and the rest of their documents on the next.
  const PER_PAGE = 25
  const pages = useMemo(() => {
    const out = []
    let cur = []
    let n = 0
    for (const g of groups) {
      // A candidate heading occupies a line whether or not it has letters under it, so a page
      // full of hired-but-undrafted candidates fills up like any other.
      const height = Math.max(1, g.rows.length)
      if (n && n + height > PER_PAGE) { out.push(cur); cur = []; n = 0 }
      cur.push(g)
      n += height
    }
    if (cur.length) out.push(cur)
    return out.length ? out : [[]]
  }, [groups])
  const pageIdx = Math.min(page, pages.length - 1)
  // Alternate candidates onto a faint ground: a person's letters read as one block without a
  // header band boxing them in, and without leaving cells empty to mark the seam.
  const rows = useMemo(() => pages[pageIdx].flatMap(
    (g, gi) => g.rows.map((d, i) => ({ d, p: g.p, first: i === 0, last: i === g.rows.length - 1, band: gi % 2 === 1 })),
  ), [pages, pageIdx])
  const total = groups.reduce((n, g) => n + g.rows.length, 0)
  const from = pages.slice(0, pageIdx).reduce((n, gs) => n + gs.reduce((m, g) => m + g.rows.length, 0), 0)


  async function approveDoc(d) {
    try {
      const up = await api.approveDocument(d.id)
      mergeDoc(up)
      toast('Document approved')
      return up
    } catch (e) { toast(e.message, 'error'); throw e }
  }

  async function setEntity(d, entity) {
    try { mergeDoc(await api.updateDocumentFields(d.id, { entity })); toast(`Entity set to ${entity}`) }
    catch (e) { toast(e.message, 'error') }
  }

  const askOnboard = (p) => setConfirm({
    p,
    body: `Send ${p.name} to onboarding? This creates their onboarding tracker; the document used to do it is locked from further edits. There is no undo from this screen.`,
  })

  async function runConfirm() {
    setBarBusy(true)
    try {
      if (confirm.kind === 'delete') {
        await api.deleteDocument(confirm.doc.id)
        setDocs((list) => (list || []).filter((x) => x.id !== confirm.doc.id))
        toast('Document deleted')
      } else {
        mergeDoc(await api.moveDocumentToOnboarding(confirm.p.appDoc.id, true))
        toast('Sent to onboarding')
      }
      setConfirm(null)
    } catch (e) { toast(e.message, 'error') } finally { setBarBusy(false) }
  }

  const askDelete = (d) => setConfirm({
    kind: 'delete',
    doc: d,
    title: `Delete the ${nameOf(d)}?`,
    body: `This removes the ${nameOf(d)} for ${d.candidate_name || 'this candidate'}${d.email_sent_at ? ', which has already been emailed' : ''}. There is no undo.`,
  })

  async function copy(d) {
    await navigator.clipboard.writeText(d.content || '')
    toast('Copied to clipboard')
  }

  async function saveLetter() {
    setBusy(true)
    try {
      const html = sanitizeHtml(editorRef.current?.getHtml() || '')
      mergeDoc(await api.saveDocumentContent(view.id, { content_html: html }))
      setEditing(false)
      toast('Letter saved')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  async function revertLetter() {
    if (!window.confirm('Discard your manual edits and revert to the generated template?')) return
    setBusy(true)
    try {
      mergeDoc(await api.saveDocumentContent(view.id, { content_html: '' }))
      setEditing(false)
      toast('Reverted to the generated template')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  function onFormDone(up, mode) {
    setForm(null)
    if (mode === 'edit') setView((v) => (v && v.id === up.id ? { ...v, ...up } : v))
    load()
  }

  const toggleGroup = (key) => setCollapsed((c) => {
    const n = new Set(c)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  })

  // Which entity the form may NOT change. A candidate's first document settles their entity, so
  // it is only unlocked while that first document is the one being drafted or re-drafted.
  const entityLockFor = (f) => {
    if (!f) return ''
    const p = people.get(personKey(f.doc))
    if (!p) return ''
    const others = f.mode === 'edit' ? p.all.filter((d) => d.id !== f.doc.id) : p.all
    if (!others.length) return ''
    return [...others].sort((a, b) => a.id - b.id)[0]?.entity || ''
  }

  const clearAll = () => { setQ(''); colFilters.clear(); setPage(0) }
  const TOOLBAR = cx('h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none',
    'transition-colors duration-150 ease-snappy hover:border-slate-300 focus:border-brand-500', focusRing)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Offer & Docs"
        subtitle="Every letter you owe a candidate, and the one thing each is waiting on. Fill their details once, preview, email for signature, then file the signed copy back."
      />

      {docs === null ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-8 w-28 rounded-lg" />)}
          </div>
          <Card className="overflow-hidden p-0">
            <div className="space-y-3 p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="ml-auto h-7 w-28 rounded-lg" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Documents show up here once generated — automatically when a candidate is marked Hired, or from a candidate’s Offer tab."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {/* Search leads: it is the control reached for first, so it sits where reading starts. */}
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} aria-label="Search candidates and documents"
                placeholder="Search candidate or document…" className={cx(TOOLBAR, 'w-64 pl-8')} />
              {q && (
                <button type="button" onClick={() => { setQ(''); setPage(0) }} aria-label="Clear the search"
                  className={cx('absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600', focusRing)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
            <p className="text-sm text-slate-500">
              <span className="font-medium tabular-nums text-slate-700">{total}</span>
              {total === 1 ? ' document' : ' documents'}
              {pages.length > 1 && <span className="tabular-nums"> · showing {from + 1}–{from + rows.length}</span>}
            </p>
            {colFilters.active > 0 && (
              <button
                type="button"
                onClick={() => { colFilters.clear(); setPage(0) }}
                className={cx('inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 transition-colors duration-150 ease-snappy hover:border-brand-300 hover:bg-brand-100', focusRing)}
              >
                <span className="tabular-nums">{colFilters.active}</span>
                {colFilters.active === 1 ? ' column filtered' : ' columns filtered'}
                <X className="h-3 w-3" aria-hidden />
                <span className="sr-only">Clear every column filter</span>
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <label className="sr-only" htmlFor="od-sort">Sort candidates</label>
              <select id="od-sort" value={sortKey} onChange={(e) => { setSortKey(e.target.value); setPage(0) }} className={TOOLBAR}>
                <option value="recent">Recent first</option>
                <option value="updated">Recently updated</option>
                <option value="waiting">Longest waiting</option>
                <option value="name">Candidate A–Z</option>
              </select>
            </div>
          </div>

          {pages[pageIdx].length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nothing matches these filters"
              description="No document matches what you’re narrowing by."
              action={<Button variant="ghost" onClick={clearAll}>Clear filters</Button>}
            />
          ) : (
            <div className={TABLE_WRAP}>
              <div className={TABLE_SCROLL} style={{ maxHeight: 'calc(100vh - 320px)' }}>
                <table className="w-full min-w-[1240px] table-fixed border-collapse text-left text-sm">
                  <caption className="sr-only">
                    One row per document, grouped under the candidate they belong to. The candidate’s
                    row carries their personal email and joining date, which apply to all of their
                    documents; its date columns span the whole block.
                  </caption>
                  <colgroup>
                    <col className="w-[13%]" />
                    <col className="w-[18%]" />
                    <col className="w-[8%]" />
                    <col className="w-[18%]" />
                    <col className="w-[10%]" />
                    <col className="w-[13%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[6%]" />
                  </colgroup>
                  <thead className={cx(THEAD, 'sticky top-0 z-10')}>
                    <tr className={THEAD_ROW}>
                      <FilterHead label="Candidate" colKey="candidate" values={colValues.candidate} filters={colFilters.filters} onFilter={onFilter} />
                      <FilterHead label="Document" colKey="document" values={colValues.document} filters={colFilters.filters} onFilter={onFilter} />
                      <FilterHead label="Entity" colKey="entity" values={colValues.entity} filters={colFilters.filters} onFilter={onFilter} />
                      <FilterHead label="Status" colKey="status" values={colValues.status} filters={colFilters.filters} onFilter={onFilter} />
                      <FilterHead label="Joining date" colKey="joining" values={colValues.joining} filters={colFilters.filters} onFilter={onFilter} />
                      <FilterHead label="Email" colKey="email" values={colValues.email} filters={colFilters.filters} onFilter={onFilter} />
                      <FilterHead label="Created" colKey="created" values={colValues.created} filters={colFilters.filters} onFilter={onFilter} />
                      <FilterHead label="Updated" colKey="updated" values={colValues.updated} filters={colFilters.filters} onFilter={onFilter} />
                      <th scope="col" className={cx(TH, 'text-right')}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages[pageIdx].map((g) => (
                      <Fragment key={g.p.key}>
                        <CandidateRow
                          person={g.p}
                          shown={g.rows}
                          open={!collapsed.has(g.p.key)}
                          onToggle={() => toggleGroup(g.p.key)}
                          onMerge={mergeDoc}
                          onAskOnboard={askOnboard}
                          onAddDoc={(person) => setForm({ doc: person.appDoc, mode: 'new' })}
                          onOpenOnboarding={() => navigate('/onboarding')}
                        />
                        {!collapsed.has(g.p.key) && g.rows.map((doc) => (
                          <DocRow
                            key={doc.id}
                            doc={doc}
                            person={g.p}
                            name={nameOf(doc)}
                            templateBacked={tplByKey.has(doc.template_key)}
                            onMerge={mergeDoc}
                            onPreview={openView}
                            onEditLetter={openEditor}
                            onEmail={setEmailing}
                            onDetails={(x) => setForm({ doc: x, mode: 'edit' })}
                            onApprove={approveDoc}
                            onEntity={setEntity}
                            onAskOnboard={askOnboard}
                            onAskDelete={askDelete}
                          />
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {pages.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs text-slate-600">
                  <span className="tabular-nums">Page {pageIdx + 1} of {pages.length}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pageIdx === 0}
                      onClick={() => setPage(pageIdx - 1)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 transition-[background-color,transform] duration-150 ease-snappy hover:bg-slate-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-40 disabled:active:scale-100"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={pageIdx >= pages.length - 1}
                      onClick={() => setPage(pageIdx + 1)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 transition-[background-color,transform] duration-150 ease-snappy hover:bg-slate-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-40 disabled:active:scale-100"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {/* The one confirm this page needs, in the Card's footer: showing it grows the card
                  downward and never shoves a row. */}
              {confirm && (
                <div className="flex min-h-12 flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  <p role="status" className="min-w-0 flex-1 text-xs text-slate-700">{confirm.body}</p>
                  <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={barBusy}>Cancel</Button>
                  <Button size="sm" onClick={runConfirm} disabled={barBusy}>
                    {barBusy ? <Spinner className="h-3.5 w-3.5" />
                      : confirm.kind === 'delete' ? <Trash2 className="h-3.5 w-3.5" />
                        : <ArrowRightCircle className="h-3.5 w-3.5" />}
                    {confirm.kind === 'delete' ? 'Delete document' : 'Send to onboarding'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Modal
        open={!!view}
        onClose={closeView}
        size="doc"
        title={view ? (
          <span className="inline-flex items-center gap-2">
            {nameOf(view)} — {view.candidate_name || 'Candidate'}
            {view.content_html && <Badge tone="violet"><PenLine className="mr-1 h-3 w-3" /> Edited</Badge>}
          </span>
        ) : ''}
        footer={view && (
          editing ? (
            <>
              {view.content_html && (
                <Button variant="ghost" onClick={revertLetter} disabled={busy} className="mr-auto text-slate-500"><RotateCcw className="h-4 w-4" /> Revert to template</Button>
              )}
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
              <Button onClick={saveLetter} disabled={busy}>{busy ? <Spinner /> : <><Check className="h-4 w-4" /> Save letter</>}</Button>
            </>
          ) : (
            <>
              {view.status === 'approved' && view.approved_by && (
                <p className="mr-auto text-xs text-slate-500">Approved by {view.approved_by}{view.approved_at ? ` · ${fmtLong(view.approved_at)}` : ''}</p>
              )}
              <Button variant="ghost" onClick={() => { documentToPdfBlobUrl(view).then((u) => { if (!window.open(u, '_blank')) toast('Allow pop-ups to open the PDF', 'error') }).catch((e) => toast(e.message, 'error')) }}><Printer className="h-4 w-4" /> Print / PDF</Button>
              <Button variant="ghost" onClick={() => copy(view)}><Copy className="h-4 w-4" /> Copy</Button>
              {view.status !== 'approved' && !view.move_to_onboarding && (
                <Button variant="ghost" onClick={() => setEditing(true)} title="Type directly on the letter"><PenLine className="h-4 w-4" /> Edit letter</Button>
              )}
              {view.status !== 'approved'
                ? <Button onClick={() => approveDoc(view)} disabled={busy}>{busy ? <Spinner /> : <><Check className="h-4 w-4" /> Approve</>}</Button>
                : <Badge tone="green">Approved</Badge>}
            </>
          )
        )}
      >
        {view && (
          <>
            {editing && (
              <p className="mb-2 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-brand-800">
                Editing the letter directly. Click any line to change the wording, use the toolbar to format, then <strong>Save</strong>. This overrides the template until you Revert.
              </p>
            )}
            <DocumentPaper doc={view} editable={editing} editorRef={editorRef} />
          </>
        )}
      </Modal>

      {form && (
        <DocFormModal
          key={`${form.mode}-${form.doc.id ?? 'new-' + form.doc.application_id}`}
          doc={form.doc}
          mode={form.mode}
          templates={templates}
          lockedEntity={entityLockFor(form)}
          onClose={() => setForm(null)}
          onDone={onFormDone}
        />
      )}
      {emailing && (
        <EmailDocumentModal
          key={`email-${emailing.id}`}
          doc={emailing}
          onClose={() => setEmailing(null)}
          onSent={() => load()}
        />
      )}
    </div>
  )
}
