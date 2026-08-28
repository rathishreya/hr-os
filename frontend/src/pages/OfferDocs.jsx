import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, ArrowRightCircle, Building2, Check, ChevronDown, Copy, Eye, FilePlus2,
  FileText, Lock, Mail, MoreHorizontal, PenLine, Printer, RefreshCw, Rocket, RotateCcw, Search, Upload,
} from 'lucide-react'
import { api } from '../api'
import {
  Badge, Button, Card, EmptyState, Field, IconButton, Modal, PageHeader, Skeleton, Spinner,
  cx, focusRing, inputClass,
} from '../ui'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'
import { ColumnFilter, distinctValues, useColumnFilters } from '../components/tableFilters'
import DocumentPaper from '../components/docs/DocumentPaper'
import { documentToPdfBlobUrl } from '../components/docs/pdfDocument'
import { sanitizeHtml } from '../components/docs/docHtml'
import EmailDocumentModal from '../components/docs/EmailDocumentModal'

// doc_type -> label, the FALLBACK only. A document drafted from a template shows the template's
// own name, because doc_type cannot tell an Offer Letter from a Traineeship Offer Letter — three
// such rows read as duplicates of each other.
const DOC_LABEL = {
  offer: 'Offer letter',
  contract: 'Contract',
  nda: 'NDA / Confidentiality',
  'nda-tech': 'NDA - Tech',
  employment_agreement: 'Employment agreement',
  contractor_agreement: 'Contractor agreement',
}

// ── Where a document sits in the issuance pipeline ──────────────────────────────────────────
// Four facts read INDEPENDENTLY off the record — progress is not guaranteed to be monotonic,
// because /send-email is not gated on status, so "emailed but never approved" is a real row.
const STAGES = ['Drafted', 'Approved', 'Sent', 'Signed']
const stageFlags = (d) => [true, d.status === 'approved', !!d.email_sent_at, !!d.has_upload]

/** The single next step this document is waiting on. Everything else stays reachable. */
function nextStep(d) {
  if (d.move_to_onboarding) return 'locked'
  if (d.has_upload) return 'done'
  if (d.email_sent_at) return 'upload'
  if (d.status === 'approved') return 'send'
  return 'approve'
}

// Whose move it is.
const TURN = { approve: 'ours', send: 'ours', upload: 'theirs', done: 'done', locked: 'locked' }

// An earlier stage left undone while a later one is done.
const skippedAt = (d) => {
  const f = stageFlags(d)
  return f.map((v, i) => !v && f.slice(i + 1).some(Boolean))
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
function DocFormModal({ doc, mode, templates, onClose, onDone }) {
  const { toast } = useToast()
  const [templateKey, setTemplateKey] = useState(
    mode === 'new' ? '' : doc.template_key || '',  // '' -> the effect below picks the entity's first
  )
  const [entity, setEntity] = useState(doc.entity || 'EZ')
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
          <Field label="Entity">
            <select className={inputClass} value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="EZ">EZ — EZ Lab Private Limited</option>
              <option value="AEZ">AEZ — ArabEasy LLC</option>
            </select>
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
const TH = 'sticky top-0 z-10 h-9 border-b border-slate-200 bg-slate-50 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-slate-500'
const CHECKBOX = cx('h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-slate-300 accent-brand-600', focusRing)
const B1 = 'flex h-7 min-w-0 items-center gap-1.5'                // band 1 — 28px, the height of Button size="sm"
const B2 = 'mt-0.5 flex h-[18px] min-w-0 items-center gap-1.5'    // band 2 — 18px, the height of Badge size="sm"
const cellOf = (row, extra) => cx(
  'align-top border-b px-3',
  row.first ? 'pt-2.5 pb-1.5' : 'py-1.5',
  row.last ? 'border-slate-200' : 'border-slate-100',
  extra,
)

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
    const W = 232
    const h = Math.max(8, items.reduce((acc, it) => acc + (it.sep ? 9 : 26), 8))
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

  const ITEM = 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none'
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
          className="menu-in z-[120] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
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
                  {it.icon}{it.label}
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
                  {it.icon}{it.label}
                  {it.note && <span className="ml-auto min-w-0 truncate text-xs text-slate-400">{it.note}</span>}
                </button>
              )
          ))}
        </div>,
        document.body,
      )}
    </>
  )
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
    <>
      <div className={B1}>
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
            'h-7 w-full rounded-md border bg-transparent px-2 text-sm text-slate-800 outline-none',
            'transition-colors duration-150 ease-snappy placeholder:text-slate-500',
            'hover:border-slate-300 hover:bg-white focus:border-brand-500 focus:bg-white',
            'disabled:cursor-not-allowed disabled:opacity-60', focusRing,
            differs ? 'border-dashed border-amber-500 placeholder:text-amber-700'
              : val ? 'border-transparent' : 'border-dashed border-slate-400',
          )}
        />
      </div>
      <div className={cx(B2, 'text-xs')}>
        {note && (
          <span id={noteId} className={cx('min-w-0 truncate', note.cls)}>
            {note.text}
            {differs && <span className="sr-only">. This candidate’s letters hold different values. Typing here sets all of them.</span>}
          </span>
        )}
      </div>
    </>
  )
}

// ── One document ────────────────────────────────────────────────────────────────────────────
function DocRow({ row, index, name, templateBacked, selected, onToggleSelect, onMerge, onPreview,
  onEditLetter, onEmail, onDetails, onApprove, onEntity, onAskOnboard, onAddDoc, onOpenOnboarding }) {
  const { d, p, first } = row
  const { toast } = useToast()
  const locked = !!d.move_to_onboarding
  const step = nextStep(d)
  const isDraft = d.status !== 'approved'
  const flags = stageFlags(d)
  const skipped = skippedAt(d)
  const age = ageOf(d)
  const unapproved = !locked && isDraft && (!!d.email_sent_at || !!d.has_upload)
  const [approving, setApproving] = useState(false)
  const { inputRef, busy: uploading, onFile: onUploadFile, pick: pickFile } = useUpload(d, onMerge)

  async function runApprove() {
    setApproving(true)
    try { await onApprove(d) } finally { setApproving(false) }
  }

  // The word is the stage; the dots decorate it, and are never the only carrier.
  const word = locked ? 'In onboarding'
    : unapproved ? 'Unapproved'
      : d.has_upload ? 'Signed'
        : d.email_sent_at ? 'Sent'
          : d.status === 'approved' ? 'Approved'
            : 'Drafted'
  const [verb, when] = d.email_sent_at ? ['Sent', d.email_sent_at]
    : (d.status === 'approved' && d.approved_at) ? ['Approved', d.approved_at]
      : ['Drafted', d.created_at]
  const caption = (verb === word ? '' : `${verb} `) + fmtShort(when)

  const current = flags.lastIndexOf(true) + 1
  const turn = TURN[step]
  const dotClass = (i) => {
    if (flags[i]) return 'bg-emerald-600'
    if (skipped[i]) return 'bg-white ring-2 ring-inset ring-amber-600'
    if (i === current && turn === 'ours') return 'bg-amber-600'
    if (i === current && turn === 'theirs') return 'bg-sky-600'
    return 'bg-slate-300'
  }
  const spoken = [
    STAGES.map((s, i) => `${s}: ${flags[i] ? 'done' : skipped[i] ? 'skipped' : 'not yet'}.`).join(' '),
    `${word}. ${caption}.`,
    age != null && age >= 1 ? `Waiting on the candidate for ${age} day${age === 1 ? '' : 's'}.` : '',
    unapproved ? 'This document went out without being approved.' : '',
    d.status === 'approved' && d.approved_by ? `Approved by ${d.approved_by}.` : '',
  ].filter(Boolean).join(' ')

  // What the Next-action column offers. A locked-and-signed row keeps its file link: the executed
  // PDF is the only thing an archived row is good for, and the Stage word already says "locked".
  const ctl = step === 'locked' ? (d.has_upload ? 'file' : 'none') : step === 'done' ? 'file' : step

  const entityTitle = templateBacked
    ? `${ENTITY_LEGAL[d.entity] || d.entity} — set by the ${name} template`
    : `${ENTITY_LEGAL[d.entity] || d.entity} — change it from this row’s menu`

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
      href: api.documentUploadUrl(d.id), title: d.upload_filename,
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
    !locked && !templateBacked && {
      label: `Switch entity to ${d.entity === 'EZ' ? 'AEZ' : 'EZ'}`,
      icon: <Building2 className="h-3.5 w-3.5 text-slate-400" />,
      onClick: () => onEntity(d, d.entity === 'EZ' ? 'AEZ' : 'EZ'),
    },
  ].filter(Boolean)

  const personItems = [
    p.appDoc && { label: 'Add document…', icon: <FilePlus2 className="h-3.5 w-3.5 text-slate-400" />, onClick: () => onAddDoc(p) },
    !p.anyMoved && p.appDoc && { label: 'Send to onboarding…', icon: <ArrowRightCircle className="h-3.5 w-3.5 text-slate-400" />, onClick: () => onAskOnboard(p) },
    p.anyMoved && { label: 'Open in Onboarding', icon: <Rocket className="h-3.5 w-3.5 text-slate-400" />, onClick: onOpenOnboarding },
    { sep: true },
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
    <tr className={cx('transition-colors duration-150 ease-snappy', selected ? 'bg-brand-50/60 hover:bg-brand-50' : 'hover:bg-slate-50')}>
      {/* 1 — select */}
      <td className={cellOf(row, 'px-0')}>
        <div className={cx(B1, 'justify-center')}>
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggleSelect(d.id, index, e)}
            aria-label={`Select the ${name} for ${p.name}`}
            className={CHECKBOX}
          />
        </div>
      </td>

      {/* 2 — the candidate, printed once per block; their name is their menu */}
      <td className={cellOf(row)}>
        {first ? (
          <>
            <div className={B1}>
              <RowMenu label={`${p.name} — candidate actions`} items={personItems} text={p.name} />
            </div>
            <div className={B2}>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600" title={p.email}>{p.email || '—'}</span>
              {p.anyMoved ? (
                <Badge size="sm" tone="gray" className="shrink-0"><Rocket className="mr-1 h-3 w-3" aria-hidden />In onboarding</Badge>
              ) : p.allSigned ? (
                <button
                  type="button"
                  onClick={() => onAskOnboard(p)}
                  title={`Send ${p.name} to onboarding — every document is signed`}
                  aria-label={`Send ${p.name} to onboarding — every document is signed`}
                  className={cx('inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 text-xs font-medium text-emerald-700 transition-colors duration-150 ease-snappy hover:border-emerald-300 hover:bg-emerald-100', focusRing)}
                >
                  Ready <ArrowRight className="h-3 w-3" aria-hidden />
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <span className="sr-only">{p.name}, another of their documents</span>
        )}
      </td>

      {/* 3 — what this document is: one left edge on every row */}
      <td className={cellOf(row)}>
        <div className={B1}>
          <button
            type="button"
            onClick={() => onPreview(d)}
            title={name}
            className={cx('min-w-0 flex-1 truncate rounded text-left text-sm font-medium text-slate-800 underline-offset-2 hover:text-brand-700 hover:underline', focusRing)}
          >
            {name}
          </button>
          {d.content_html && (
            <Badge size="sm" tone="violet" className="shrink-0"><PenLine className="mr-1 h-3 w-3" aria-hidden />Edited</Badge>
          )}
        </div>
        <div className={cx(B2, 'text-xs text-slate-500')}>
          <Badge size="sm" tone="gray" className="shrink-0" title={entityTitle}>{d.entity}</Badge>
          <span className="sr-only">{entityTitle}</span>
          {d.created_at && (
            <>
              <span aria-hidden>·</span>
              <time dateTime={d.created_at} title={fmtLong(d.created_at)} className="shrink-0 tabular-nums">
                {fmtShort(d.created_at)}{p.twin(d) ? `, ${fmtTime(d.created_at)}` : ''}
              </time>
            </>
          )}
        </div>
      </td>

      {/* 4 — the stage, in a word, with the pipeline beneath it */}
      <td className={cellOf(row)}>
        <div className={B1}>
          {unapproved && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />}
          <span className={cx('min-w-0 truncate text-sm', unapproved ? 'font-medium text-amber-700' : locked ? 'text-slate-600' : 'text-slate-800')}>
            {word}
          </span>
        </div>
        <div className={cx(B2, 'text-xs')}>
          <span className="flex shrink-0 items-center" aria-hidden="true">
            {STAGES.map((s, i) => (
              <span key={s} className="flex items-center">
                {i > 0 && <span className={cx('h-px w-2.5', flags[i - 1] && flags[i] ? 'bg-emerald-400' : 'bg-slate-200')} />}
                <span className={cx('h-2 w-2 rounded-full', dotClass(i))} />
              </span>
            ))}
          </span>
          <span className="min-w-0 truncate text-slate-500">{caption}</span>
          {age != null && age >= 1 && (
            <span className={cx('shrink-0 tabular-nums', ageClass(age))} title={`${age} days since the covering email was sent`}>· {age}d</span>
          )}
          <span className="sr-only">{spoken}</span>
        </div>
      </td>

      {/* 5 & 6 — the candidate's shared facts, printed on their first row */}
      <td className={cellOf(row)}>
        {first
          ? <PersonField person={p} field="personal_email" label="Personal email" placeholder="name@gmail.com"
              note={p.anySent ? 'Went out to the work email' : ''} onSaved={onMerge} />
          : p.differs('personal_email') && (
            <div className={cx(B1, 'px-2')}>
              <span className="min-w-0 truncate text-sm text-slate-500" title={d.personal_email}>{d.personal_email || '—'}</span>
            </div>
          )}
      </td>
      <td className={cellOf(row)}>
        {first
          ? <PersonField person={p} field="joining_date" label="Joining date" placeholder="1 July 2026"
              note={p.drafts.length ? 'Needed before sending' : ''} onSaved={onMerge} />
          : p.differs('joining_date') && (
            <div className={cx(B1, 'px-2')}>
              <span className="min-w-0 truncate text-sm text-slate-500" title={d.joining_date}>{d.joining_date || '—'}</span>
            </div>
          )}
      </td>

      {/* 7 — the one thing this document is waiting on */}
      <td className={cellOf(row)}>
        <div className={B1}>
          {ctl === 'approve' && (
            <Button variant="ghost" size="sm" className="h-7 w-full" onClick={runApprove} disabled={approving}
              aria-label={`Approve the ${name} for ${p.name}`}>
              {approving ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              {approving ? 'Approving…' : 'Approve'}
            </Button>
          )}
          {ctl === 'send' && (
            <Button variant="ghost" size="sm" className="h-7 w-full" onClick={() => onEmail(d)}
              aria-label={`Review and send the covering email for the ${name}`}>
              <Mail className="h-3.5 w-3.5" /> Send email
            </Button>
          )}
          {ctl === 'upload' && (
            <Button variant="ghost" size="sm" className="h-7 w-full" onClick={pickFile} disabled={uploading}
              aria-label={`Upload the signed copy of the ${name}`}>
              {uploading ? <Spinner className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          )}
          {ctl === 'file' && (
            <a href={api.documentUploadUrl(d.id)} target="_blank" rel="noreferrer" title={d.upload_filename || 'Signed copy'}
              className={cx('flex h-7 min-w-0 items-center gap-1.5 rounded px-2.5 text-xs font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:decoration-emerald-700', focusRing)}>
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{d.upload_filename || 'Signed copy'}</span>
            </a>
          )}
          {ctl === 'none' && <span className="flex h-7 items-center px-2.5 text-xs text-slate-500">No signed copy</span>}
        </div>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only"
          tabIndex={-1} aria-hidden="true" onChange={onUploadFile} />
      </td>

      {/* 8 — preview stays out; everything else is one click deeper */}
      <td className={cellOf(row)}>
        <div className={cx(B1, 'justify-end gap-1')}>
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

// ── The triage chips: what is waiting on you, and the way to see only that ───────────────────
const STEP_PRED = {
  approve: (d) => nextStep(d) === 'approve',
  send: (d) => nextStep(d) === 'send',
  upload: (d) => nextStep(d) === 'upload',
  done: (d) => nextStep(d) === 'done',
  locked: (d) => nextStep(d) === 'locked',
  unapproved: (d) => !d.move_to_onboarding && d.status !== 'approved' && (!!d.email_sent_at || !!d.has_upload),
}
const STEP_CHIPS = [
  { key: 'approve', label: 'To approve', dot: 'bg-amber-600' },
  { key: 'send', label: 'Ready to send', dot: 'bg-amber-600' },
  { key: 'upload', label: 'Awaiting signature', dot: 'bg-sky-600' },
  { key: 'unapproved', label: 'Unapproved', dot: 'bg-white ring-2 ring-inset ring-amber-600' },
  { key: 'done', label: 'Signed', dot: 'bg-emerald-600' },
  { key: 'locked', label: 'In onboarding', dot: 'bg-slate-400' },
]

function Chip({ chipKey, label, dot, n, active, onPick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={chipKey !== null && !n}
      onClick={() => onPick(chipKey === null ? null : active ? null : chipKey)}
      className={cx(
        'inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition duration-150 ease-snappy', focusRing,
        active ? 'border-brand-300 bg-brand-50 text-brand-700'
          : n ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            : 'cursor-default border-slate-200/70 bg-white text-slate-500',
      )}
    >
      {dot && <span aria-hidden className={cx('h-2 w-2 rounded-full', n ? dot : 'bg-slate-300')} />}
      {label}<span className="tabular-nums">{n}</span>
    </button>
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
  const [stage, setStage] = useState(null)          // a STEP_PRED key, or null for everything
  const [sortKey, setSortKey] = useState('recent')
  const [selected, setSelected] = useState(() => new Set())
  const [confirm, setConfirm] = useState(null)      // { kind, body, cta, Icon, p? }
  const [barBusy, setBarBusy] = useState(false)
  const colFilters = useColumnFilters()
  const lastIdx = useRef(null)
  const allRef = useRef(null)

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
  const nameOf = useMemo(() => (d) => tplByKey.get(d.template_key)?.label || DOC_LABEL[d.doc_type] || d.doc_type, [tplByKey])
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

  const docValues = useMemo(() => distinctValues(docs || [], nameOf), [docs, nameOf])
  const faceted = useMemo(() => colFilters.apply(searched, { document: nameOf }), [searched, colFilters, nameOf])

  // Counts answer "what would this chip give me", so they honour search and the column filter but
  // not the stage itself.
  const counts = useMemo(() => {
    const m = { approve: 0, send: 0, upload: 0, done: 0, locked: 0, unapproved: 0 }
    for (const d of faceted) { m[nextStep(d)] += 1; if (STEP_PRED.unapproved(d)) m.unapproved += 1 }
    return m
  }, [faceted])

  const filteredDocs = useMemo(() => (stage ? faceted.filter(STEP_PRED[stage]) : faceted), [faceted, stage])

  // Which documents to draw and in what order. The API returns newest-first GLOBALLY, so without
  // regrouping a candidate's letters are scattered and their name prints over and over.
  const rows = useMemo(() => {
    const blocks = new Map()
    for (const d of filteredDocs) {
      const k = personKey(d)
      if (!blocks.has(k)) blocks.set(k, [])
      blocks.get(k).push(d)
    }
    const list = [...blocks.entries()].map(([k, shown]) => ({ p: people.get(k), shown })).filter((b) => b.p)
    const cmp = {
      recent: (a, b) => b.p.newest - a.p.newest,
      waiting: (a, b) => b.p.waiting - a.p.waiting || b.p.drafts.length - a.p.drafts.length,
      name: (a, b) => a.p.name.localeCompare(b.p.name),
    }[sortKey]
    list.sort(cmp)
    const out = []
    for (const { p, shown } of list) {
      const ordered = [...shown].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      ordered.forEach((d, i) => out.push({ d, p, first: i === 0, last: i === ordered.length - 1 }))
    }
    return out
  }, [filteredDocs, people, sortKey])

  // Selection is read through the visible rows, so a filter change can never leave you acting on
  // documents you cannot see — and there is no state to prune.
  const selCount = rows.reduce((n, r) => n + (selected.has(r.d.id) ? 1 : 0), 0)
  const allChecked = rows.length > 0 && selCount === rows.length
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = selCount > 0 && selCount < rows.length
  }, [selCount, rows.length])

  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.d.id)))
  const toggleRow = (id, index, e) => {
    const shift = e?.nativeEvent?.shiftKey
    const anchor = lastIdx.current
    setSelected((s) => {
      const n = new Set(s)
      if (shift && anchor != null) {
        const [a, b] = [anchor, index].sort((x, y) => x - y)
        for (let i = a; i <= b; i += 1) n.add(rows[i].d.id)
      } else if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
    lastIdx.current = index
  }

  const selDrafts = rows
    .filter((r) => selected.has(r.d.id) && r.d.status !== 'approved' && !r.d.move_to_onboarding)
    .map((r) => r.d)

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
    kind: 'onboard', p, Icon: ArrowRightCircle, cta: 'Send to onboarding',
    body: `Send ${p.name} to onboarding? This creates their onboarding tracker; the document used to do it is locked from further edits. There is no undo from this screen.`,
  })

  async function runConfirm() {
    setBarBusy(true)
    try {
      if (confirm.kind === 'bulk') {
        const res = await Promise.allSettled(selDrafts.map((d) => api.approveDocument(d.id)))
        res.forEach((r) => r.status === 'fulfilled' && mergeDoc(r.value))
        const failed = res.filter((r) => r.status === 'rejected').length
        toast(failed ? `${selDrafts.length - failed} approved, ${failed} failed` : `${selDrafts.length} approved`, failed ? 'error' : undefined)
        setSelected(new Set())
      } else {
        mergeDoc(await api.moveDocumentToOnboarding(confirm.p.appDoc.id, true))
        toast('Sent to onboarding')
      }
      setConfirm(null)
    } catch (e) { toast(e.message, 'error') } finally { setBarBusy(false) }
  }

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

  const clearAll = () => { setQ(''); setStage(null); colFilters.clear() }
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
            <Chip chipKey={null} label="All" dot={null} n={faceted.length} active={stage === null} onPick={setStage} />
            {STEP_CHIPS.map((c) => (
              <Chip key={c.key} chipKey={c.key} label={c.label} dot={c.dot} n={counts[c.key] || 0} active={stage === c.key} onPick={setStage} />
            ))}
            <div className="ml-auto flex items-center gap-2">
              <label className="sr-only" htmlFor="od-sort">Sort candidates</label>
              <select id="od-sort" value={sortKey} onChange={(e) => setSortKey(e.target.value)} className={TOOLBAR}>
                <option value="recent">Recent first</option>
                <option value="waiting">Longest waiting</option>
                <option value="name">Candidate A–Z</option>
              </select>
              <label className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
                <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search candidates and documents"
                  placeholder="Search candidate or document…" className={cx(TOOLBAR, 'w-56 pl-8')} />
              </label>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nothing matches these filters"
              description="No document matches what you’re narrowing by."
              action={<Button variant="ghost" onClick={clearAll}>Clear filters</Button>}
            />
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 300px)', minHeight: '20rem' }}>
                <table className="w-full min-w-[1280px] table-fixed border-separate border-spacing-0 text-sm">
                  <caption className="sr-only">
                    One row per document, grouped by candidate. A candidate’s name, personal email and
                    joining date are printed on the first of their documents and apply to all of them.
                  </caption>
                  <colgroup>
                    <col className="w-[3%]" />
                    <col className="w-[15.5%]" />
                    <col className="w-[17%]" />
                    <col className="w-[15.5%]" />
                    <col className="w-[17.5%]" />
                    <col className="w-[12.5%]" />
                    <col className="w-[12%]" />
                    <col className="w-[7%]" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className={cx(TH, 'px-0 text-center')}>
                        <input type="checkbox" ref={allRef} checked={allChecked} onChange={toggleAll}
                          aria-label={`Select all ${rows.length} documents`} className={CHECKBOX} />
                      </th>
                      <th scope="col" className={TH}>Candidate</th>
                      <th scope="col" className={TH}>
                        <span className="inline-flex items-center gap-1">
                          Document
                          <ColumnFilter label="Document" values={docValues}
                            excluded={colFilters.filters.document || []}
                            onChange={(a) => colFilters.setFilter('document', a)} />
                        </span>
                      </th>
                      <th scope="col" className={TH}>Stage</th>
                      <th scope="col" className={TH}>Personal email</th>
                      <th scope="col" className={TH}>Joining date</th>
                      <th scope="col" className={TH}>Next action</th>
                      <th scope="col" className={cx(TH, 'text-right')}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <DocRow
                        key={row.d.id}
                        row={row}
                        index={i}
                        name={nameOf(row.d)}
                        templateBacked={tplByKey.has(row.d.template_key)}
                        selected={selected.has(row.d.id)}
                        onToggleSelect={toggleRow}
                        onMerge={mergeDoc}
                        onPreview={openView}
                        onEditLetter={openEditor}
                        onEmail={setEmailing}
                        onDetails={(d) => setForm({ doc: d, mode: 'edit' })}
                        onApprove={approveDoc}
                        onEntity={setEntity}
                        onAskOnboard={askOnboard}
                        onAddDoc={(p) => setForm({ doc: p.appDoc, mode: 'new' })}
                        onOpenOnboarding={() => navigate('/onboarding')}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* One confirm surface, in the Card's footer: showing it grows the card downward and
                  never shoves a single row. */}
              {(confirm || selCount > 0) && (
                <div className="flex min-h-12 flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
                  {confirm ? (
                    <>
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                      <p role="status" className="min-w-0 text-xs text-slate-700">{confirm.body}</p>
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={barBusy}>Cancel</Button>
                        <Button size="sm" onClick={runConfirm} disabled={barBusy}>
                          {barBusy ? <Spinner className="h-3.5 w-3.5" /> : <confirm.Icon className="h-3.5 w-3.5" />} {confirm.cta}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p role="status" className="text-xs font-medium tabular-nums text-slate-700">{selCount} selected</p>
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
                        <Button
                          size="sm"
                          disabled={!selDrafts.length}
                          title={selDrafts.length ? undefined : 'Nothing in this selection is a draft'}
                          onClick={() => setConfirm({
                            kind: 'bulk', Icon: Check, cta: `Approve ${selDrafts.length}`,
                            body: `Approve ${selDrafts.length} draft${selDrafts.length === 1 ? '' : 's'} without opening ${selDrafts.length === 1 ? 'it' : 'them'}? An approved document can no longer be regenerated from its template.`,
                          })}
                        >
                          <Check className="h-3.5 w-3.5" /> Approve {selDrafts.length}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
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
          key={`${form.mode}-${form.doc.id}`}
          doc={form.doc}
          mode={form.mode}
          templates={templates}
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
