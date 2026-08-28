import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Check, Copy, Eye, FilePlus2, RefreshCw, Printer, Upload, ArrowRightCircle, ChevronRight, Rocket, Lock, PenLine, RotateCcw, Mail, MoreHorizontal, Search } from 'lucide-react'
import { api } from '../api'
import { Card, Badge, Button, Spinner, EmptyState, PageHeader, Modal, Field, Avatar, inputClass, cx, focusRing } from '../ui'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'
import DocumentPaper from '../components/docs/DocumentPaper'
import { documentToPdfBlobUrl } from '../components/docs/pdfDocument'
import { sanitizeHtml } from '../components/docs/docHtml'
import EmailDocumentModal from '../components/docs/EmailDocumentModal'

// doc_type -> label for the documents table. Keys match registry.DOC_TYPES. This is the fallback:
// a document drafted from a template shows the TEMPLATE's name instead, because doc_type alone
// cannot tell an Offer Letter from a Traineeship Offer Letter — three such rows read as duplicates.
const DOC_LABEL = {
  offer: 'Offer letter',
  contract: 'Contract',
  nda: 'NDA / Confidentiality',
  'nda-tech': 'NDA - Tech',
  employment_agreement: 'Employment agreement',
  contractor_agreement: 'Contractor agreement',
}

/** What this document actually is, as specifically as we can name it. */
function docName(doc, templates) {
  const t = templates?.find((x) => x.key === doc.template_key)
  return t?.label || DOC_LABEL[doc.doc_type] || doc.doc_type
}

// ── Where a document sits in the issuance pipeline ──────────────────────────────────────────
// Four facts read INDEPENDENTLY off the record — progress is not guaranteed to be monotonic,
// because /send-email is not gated on status, so "emailed but never approved" is a real row.
const STAGES = ['Drafted', 'Approved', 'Sent', 'Signed']
const stageFlags = (d) => [true, d.status === 'approved', !!d.email_sent_at, !!d.has_upload]

/** The single next step this document is waiting on. Every other action stays reachable. */
function nextStep(d) {
  if (d.move_to_onboarding) return 'locked'
  if (d.has_upload) return 'done'
  if (d.email_sent_at) return 'upload'
  if (d.status === 'approved') return 'send'
  return 'approve'
}

// Whose move it is — the one thing the master row needs to say.
const TURN = { approve: 'ours', send: 'ours', upload: 'theirs', done: 'done', locked: 'locked' }

// An earlier stage left undone while a later one is done — worth flagging, never guessed.
const skippedAt = (d) => {
  const f = stageFlags(d)
  return f.map((v, i) => !v && f.slice(i + 1).some(Boolean))
}

const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null)
// How long the candidate has been sitting on it. Only meaningful while we're waiting on them.
const ageOf = (d) => (nextStep(d) === 'upload' ? daysSince(d.email_sent_at) : null)
const ageClass = (n) => (n >= 14 ? 'font-medium text-rose-700' : n >= 7 ? 'font-medium text-amber-700' : 'text-slate-500')

// created_at / email_sent_at are ISO. joining_date is FREE TEXT ("1 July 2026") — never parse it.
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

// The one named action per row. Tinted rather than solid: five solid violet buttons stacked would
// be the loudest thing on the page, and the solid fill is reserved for "Add document".
const PRIMARY =
  'inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 text-xs font-medium text-brand-700 transition duration-150 ease-snappy hover:border-brand-300 hover:bg-brand-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:cursor-not-allowed disabled:opacity-50'
const PRIMARY_STATIC = 'inline-flex h-8 w-full items-center justify-center gap-1.5 px-1 text-xs font-medium'

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
        <p className="text-[11px] leading-relaxed text-slate-400">
          Autofilled from the candidate &amp; role — edit anything. The compensation table is computed from the CTC; leave a field blank to use the template default.
        </p>
      </div>
    </Modal>
  )
}

// Group documents into one entry per candidate (so each person shows a single row).
function groupByCandidate(docs) {
  const map = new Map()
  for (const d of docs) {
    const key = d.candidate_id != null ? `c${d.candidate_id}` : `n:${d.candidate_name}|${d.email}`
    if (!map.has(key)) {
      map.set(key, { key, name: d.candidate_name || 'Candidate', email: d.email || '', contact: d.contact || '', docs: [] })
    }
    map.get(key).docs.push(d)
  }
  return [...map.values()]
}

// Uniform 32px icon-button styles so every row action lines up and reads as one set.
const ROW_ICON = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 ring-1 ring-slate-200 transition duration-150 ease-snappy hover:bg-brand-50/60 hover:text-brand-600 hover:ring-brand-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:cursor-not-allowed disabled:opacity-40'
// Row actions are peers and all share ROW_ICON. The brand-filled variant is reserved for
// candidate-level actions in the group header ("Add document"), where it is the only accent —
// inside a document row it made two of five buttons shout for no reason.
const ROW_ICON_BRAND = 'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white transition duration-150 ease-snappy hover:bg-brand-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:cursor-not-allowed disabled:opacity-40'
// Inline, save-on-blur editor for a fact that belongs to the CANDIDATE, not to one letter:
// their personal email and their joining date are the same on every document they're issued.
// The backend stores both per document, so a commit fans out across the candidate's unlocked
// documents — reported honestly if only some of them save.
// Locked (read-only) once the candidate has moved to onboarding; the server 409s on those anyway.
function GroupField({ docs, field, type = 'text', placeholder, onSaved, className }) {
  const { toast } = useToast()
  const targets = docs.filter((d) => !d.move_to_onboarding)
  const values = [...new Set(targets.map((d) => d[field] || ''))]
  const shared = values.length <= 1 ? values[0] || '' : ''
  const differs = values.length > 1

  const [val, setVal] = useState(shared)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setVal(shared) }, [shared])

  async function commit() {
    const next = val.trim()
    if (!differs && next === shared) return
    if (!targets.length) return
    setBusy(true)
    const results = await Promise.allSettled(
      targets.map((d) => api.updateDocumentFields(d.id, { [field]: next })),
    )
    results.forEach((r) => r.status === 'fulfilled' && onSaved(r.value))
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed) toast(`${failed} of ${targets.length} documents didn’t save — they still show the old value.`, 'error')
    setBusy(false)
  }

  if (!targets.length) {
    return <span className="inline-flex items-center gap-1 text-sm text-slate-600">{docs[0]?.[field] || '—'}<Lock className="h-3 w-3 text-slate-400" /></span>
  }
  // Reads as text until you touch it — a grid of permanently-bordered inputs turns a document
  // list into a form. An empty required field shows a dashed outline: a visible gap to fill,
  // rather than grey italics that look like a value.
  return (
    <input
      type={type}
      value={val}
      placeholder={differs ? 'Several values' : placeholder}
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setVal(shared); e.currentTarget.blur() } }}
      className={cx(
        className,
        'rounded-md border bg-transparent px-1.5 py-1 text-sm text-slate-800 outline-none transition-colors duration-150 ease-snappy',
        'placeholder:text-slate-500 hover:bg-white focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60',
        val || differs ? 'border-transparent hover:border-slate-200' : 'border-dashed border-slate-300',
      )}
    />
  )
}

// Inline Entity selector (EZ / AEZ) — persists via the lightweight fields PATCH, no re-render.
function InlineEntity({ doc, value, onSaved, locked }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  async function onChange(e) {
    const entity = e.target.value
    setBusy(true)
    try {
      const up = await api.updateDocumentFields(doc.id, { entity })
      onSaved(up)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  if (locked) {
    return <span className="inline-flex items-center gap-1 text-slate-500">{value || 'EZ'}<Lock className="h-3 w-3 text-slate-300" /></span>
  }
  return (
    <select
      value={value || 'EZ'}
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      onChange={onChange}
      className="-ml-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm text-slate-700 outline-none transition-colors duration-150 ease-snappy hover:border-slate-200 hover:bg-white focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
    >
      <option value="EZ">EZ</option>
      <option value="AEZ">AEZ</option>
    </select>
  )
}

// Filing the signed & countersigned copy back. The single upload_* slot on the model holds the
// executed PDF (uploading again replaces it). The same control renders either as the row's named
// next step or as one of the fixed tool slots, so the file input is never duplicated.
function UploadControl({ doc, name, onUploaded, primary, menu }) {
  const { toast } = useToast()
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
      e.target.value = ''
    }
  }
  const verb = doc.has_upload ? 'Replace' : 'Upload signed'
  // sr-only rather than hidden: a hidden input cannot take keyboard focus, which made this the
  // one control on the row a keyboard user could not reach.
  const input = <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={onFile} disabled={busy} />
  if (menu) {
    return (
      <label className={cx('flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50', busy && 'pointer-events-none opacity-60')}>
        {busy ? <Spinner /> : <Upload className="h-3.5 w-3.5 text-slate-400" />}
        {busy ? 'Uploading…' : `${verb === 'Upload signed' ? 'Upload' : 'Replace'} signed copy`}
        {input}
      </label>
    )
  }
  if (primary) {
    return (
      <label className={cx(PRIMARY, 'cursor-pointer focus-within:ring-2 focus-within:ring-brand-500/50', busy && 'pointer-events-none opacity-60')}>
        {busy ? <Spinner /> : <Upload className="h-3.5 w-3.5" />}
        {busy ? 'Uploading…' : verb}
        {input}
      </label>
    )
  }
  return (
    <label
      title={`${verb} — the countersigned ${name}`}
      className={cx(ROW_ICON, 'cursor-pointer focus-within:ring-2 focus-within:ring-brand-500/50', busy && 'pointer-events-none opacity-60')}
    >
      {busy ? <Spinner /> : <Upload className="h-4 w-4" />}
      <span className="sr-only">{verb} — the countersigned {name}</span>
      {input}
    </label>
  )
}

// Where this document has got to, as four dots on a shared axis. Rows line up down the panel, so
// a candidate's progress reads as a staircase instead of five identical badges.
function StageRail({ doc }) {
  const flags = stageFlags(doc)
  const skipped = skippedAt(doc)
  const step = nextStep(doc)
  const turn = TURN[step]
  const current = flags.lastIndexOf(true) + 1   // the first stage still to happen
  const age = ageOf(doc)

  const dotClass = (i) => {
    if (flags[i]) return 'bg-emerald-600'
    if (skipped[i]) return 'bg-white ring-2 ring-inset ring-amber-600'
    if (i === current && turn === 'ours') return 'bg-amber-600'
    if (i === current && turn === 'theirs') return 'bg-sky-600'
    return 'bg-slate-300'
  }
  const reached = flags.lastIndexOf(true)
  const caption = doc.move_to_onboarding ? 'In onboarding'
    : reached === 3 ? 'Signed'
    : reached === 2 ? `Sent ${fmtShort(doc.email_sent_at)}`
    : reached === 1 ? `Approved ${fmtShort(doc.approved_at)}`
    : `Drafted ${fmtShort(doc.created_at)}`
  const spoken = STAGES.map((s, i) => `${s}, ${flags[i] ? 'done' : 'not yet'}.`).join(' ')

  return (
    <div className="max-w-[15.5rem]">
      <div className="grid grid-cols-4" aria-hidden="true">
        {STAGES.map((s, i) => (
          <div key={s} className="relative flex h-2.5 items-center">
            {i < 3 && <span className={cx('absolute left-2.5 right-0 top-1/2 h-px -translate-y-1/2', flags[i] && flags[i + 1] ? 'bg-emerald-300' : 'bg-slate-200')} />}
            <span className={cx('relative z-10 h-2.5 w-2.5 shrink-0 rounded-full', dotClass(i))} />
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs" aria-hidden="true">
        <span className="text-slate-600">{caption}</span>
        {age != null && age >= 1 && <span className={cx('tabular-nums', ageClass(age))}> · {age}d</span>}
      </p>
      <span className="sr-only">{spoken}</span>
    </div>
  )
}

// Send this candidate to Onboarding — a top-level (per-candidate) row action, the only path into
// the Onboarding page (F12). Moving any one of the candidate's documents is sufficient:
// _ensure_onboarding_plan is keyed by application and idempotent. Lives OUTSIDE the per-document
// detail box now (in the master row's Onboarding column).
function SendToOnboarding({ group, anyMoved, onMoved }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  // Pick a representative document that actually has an application to move on.
  const target = group.docs.find((d) => d.application_id)
  async function send(e) {
    e.stopPropagation()
    if (!target) return
    setBusy(true)
    try {
      const up = await api.moveDocumentToOnboarding(target.id, true)
      toast('Sent to onboarding')
      onMoved(up)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  if (anyMoved) return <Badge tone="green"><Rocket className="mr-1 h-3 w-3" /> In onboarding</Badge>
  if (!target) return <span className="text-xs text-slate-300">—</span>
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={send}
      disabled={busy}
      className="whitespace-nowrap"
      title="Create this candidate's onboarding tracker"
    >
      {busy ? <Spinner /> : <ArrowRightCircle className="h-3.5 w-3.5" />} Send to onboarding
    </Button>
  )
}

// The out-of-sequence paths for one document: approving something already sent, emailing a draft,
// filing a signed copy that never went out by mail. Real, but not what a row is usually for — so
// they live behind one control instead of five icons repeated down the panel.
// Portal + fixed positioning, following ColumnFilter, so a table's overflow can never clip it.
function RowMenu({ items, label }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const W = 224
    setPos({
      top: Math.min(r.bottom + 6, window.innerHeight - (items.length * 34 + 24)),
      left: Math.min(Math.max(8, r.right - W), window.innerWidth - W - 8),
      width: W,
    })
  }, [open, items.length])

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

  if (!items.length) return <span className="h-8 w-8" aria-hidden />
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className={cx(ROW_ICON, open && 'bg-brand-50/60 text-brand-600 ring-brand-200')}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && pos && createPortal(
        <div
          ref={popRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="menu-in z-[120] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
        >
          {items.map((it) => (
            it.href ? (
              <a
                key={it.label}
                role="menuitem"
                href={it.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
              >
                {it.icon}{it.label}
              </a>
            ) : it.render ? (
              <div key={it.label} onClick={() => setOpen(false)}>{it.render}</div>
            ) : (
              <button
                key={it.label}
                role="menuitem"
                type="button"
                onClick={() => { setOpen(false); it.onClick() }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
              >
                {it.icon}{it.label}
              </button>
            )
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

// One document on the shared panel grid: what it is, where it has got to, the fine print, its
// single named next step, and the fixed tool slots.
function DocRow({ doc: d, templates, twin, onMerge, onPreview, onEditLetter, onEmail, onDetails, onApprove }) {
  const name = docName(d, templates)
  const locked = !!d.move_to_onboarding
  const step = nextStep(d)
  const skipped = skippedAt(d)
  const templateBacked = templates.some((t) => t.key === d.template_key)
  const isDraft = d.status !== 'approved'
  const [approving, setApproving] = useState(false)

  async function approve() {
    setApproving(true)
    try { await onApprove(d) } finally { setApproving(false) }
  }


  const sentTo = d.personal_email || d.email

  // Everything the row is not currently asking for, but that must stay reachable.
  const menuItems = [
    !locked && isDraft && {
      label: 'Edit the wording…', icon: <PenLine className="h-3.5 w-3.5 text-slate-400" />, onClick: () => onEditLetter(d),
    },
    !locked && isDraft && templateBacked && {
      label: 'Details & template…', icon: <RefreshCw className="h-3.5 w-3.5 text-slate-400" />, onClick: () => onDetails(d),
    },
    !locked && isDraft && step !== 'approve' && {
      label: 'Approve now', icon: <Check className="h-3.5 w-3.5 text-slate-400" />, onClick: approve,
    },
    !locked && step !== 'send' && {
      label: d.email_sent_at ? 'Email again…' : 'Email now…', icon: <Mail className="h-3.5 w-3.5 text-slate-400" />, onClick: () => onEmail(d),
    },
    !locked && step !== 'upload' && {
      label: d.has_upload ? 'Replace signed copy' : 'Upload signed copy',
      render: <UploadControl doc={d} name={name} onUploaded={onMerge} menu />,
    },
    d.has_upload && {
      label: 'View signed copy', icon: <FileText className="h-3.5 w-3.5 text-slate-400" />, href: api.documentUploadUrl(d.id),
    },
  ].filter(Boolean)
  return (
    <tr className="border-b border-slate-100 transition-colors duration-150 ease-snappy last:border-b-0 hover:bg-slate-50">
      {/* 1 - what it is. Three same-named letters are told apart on three aligned axes: the
             template's own name, the operating entity, and when it was drafted. */}
      <td className="px-4 py-2.5 align-middle">
        <div className="flex items-center gap-1.5">
          {locked && <><Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden /><span className="sr-only">Locked.</span></>}
          <button
            type="button"
            onClick={() => onPreview(d)}
            className={cx('truncate rounded text-left text-sm font-semibold text-slate-900 underline-offset-2 hover:text-brand-700 hover:underline', focusRing)}
          >
            {name}
          </button>
          {d.content_html && <Badge size="sm" tone="violet"><PenLine className="mr-1 h-3 w-3" />Edited</Badge>}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
          {templateBacked ? (
            <span
              title={`${ENTITY_LEGAL[d.entity] || d.entity} - set by the ${name} template`}
              className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-px text-xs font-medium text-slate-600"
            >
              {d.entity}
            </span>
          ) : (
            <InlineEntity doc={d} value={d.entity} locked={locked} onSaved={onMerge} />
          )}
          {d.created_at && (
            <>
              <span aria-hidden>·</span>
              <time dateTime={d.created_at} title={fmtLong(d.created_at)} className="tabular-nums">
                {fmtShort(d.created_at)}{twin ? `, ${fmtTime(d.created_at)}` : ''}
              </time>
            </>
          )}
        </div>
      </td>

      {/* 2 - the pipeline, read against the axis printed in the table head */}
      <td className="px-4 py-2.5 align-middle"><StageRail doc={d} /></td>

      {/* 3 - only what is true, so a clean row stays quiet */}
      <td className="px-4 py-2.5 align-middle">
        <div className="min-w-0 space-y-0.5 text-xs">
          {d.has_upload && (
            <a
              href={api.documentUploadUrl(d.id)}
              target="_blank"
              rel="noreferrer"
              className={cx('block truncate rounded font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:decoration-emerald-600', focusRing)}
            >
              {d.upload_filename || 'Signed copy'}
            </a>
          )}
          {d.email_sent_at && (
            <p className="truncate text-slate-600">
              To {sentTo || '—'}{!d.personal_email && sentTo ? ' (work email)' : ''}
            </p>
          )}
          {!d.email_sent_at && d.status === 'approved' && d.approved_by && (
            <p className="truncate text-slate-600">Approved by {d.approved_by}</p>
          )}
          {skipped[1] && !locked && (
            <p className="flex items-center gap-1.5 text-amber-700">
              Sent without approval
              <button type="button" onClick={approve} disabled={approving} className={cx('rounded font-medium underline underline-offset-2 hover:text-amber-800', focusRing)}>
                {approving ? 'Approving…' : 'Approve now'}
              </button>
            </p>
          )}
        </div>
      </td>

      {/* 4 - the one thing to do next */}
      <td className="px-4 py-2.5 align-middle">
        {step === 'approve' && (
          <button type="button" onClick={approve} disabled={approving} className={PRIMARY}>
            {approving ? <Spinner /> : <Check className="h-3.5 w-3.5" />} {approving ? 'Approving…' : 'Approve'}
          </button>
        )}
        {step === 'send' && (
          <button type="button" onClick={() => onEmail(d)} className={PRIMARY}>
            <Mail className="h-3.5 w-3.5" /> Send email
          </button>
        )}
        {step === 'upload' && <UploadControl doc={d} name={name} onUploaded={onMerge} primary />}
        {step === 'done' && (
          <span className={cx(PRIMARY_STATIC, 'text-emerald-700')}><Check className="h-3.5 w-3.5" /> Signed</span>
        )}
        {step === 'locked' && (
          <span className={cx(PRIMARY_STATIC, 'text-slate-500')}><Lock className="h-3.5 w-3.5" /> Locked</span>
        )}
      </td>

      {/* 5 - preview stays out; everything out of sequence is one click deeper */}
      <td className="px-4 py-2.5 align-middle">
        <div className="flex items-center justify-end gap-1">
          <button type="button" onClick={() => onPreview(d)} title={`Preview the ${name}`} aria-label={`Preview the ${name}`} className={ROW_ICON}>
            <Eye className="h-4 w-4" />
          </button>
          <RowMenu label={`More for the ${name}`} items={menuItems} />
        </div>
      </td>
    </tr>
  )
}

// A candidate's band across the table: who they are, the facts every one of their letters shares,
// and the actions that belong to the person rather than to a document. Their documents follow as
// ordinary rows, so the columns stay aligned the whole way down the page.
function CandidateGroup({ group: g, templates, collapsed, onToggle, onMerge, onPreview, onEditLetter, onEmail, onDetails, onApprove, onAdd }) {
  const { toast } = useToast()
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const live = g.docs.filter((d) => !d.move_to_onboarding)
  const drafts = live.filter((d) => d.status !== 'approved')
  const differs = (field) => new Set(live.map((d) => d[field] || '')).size > 1
  const anyMoved = g.docs.some((d) => d.move_to_onboarding)
  const allSigned = live.length > 0 && live.every((d) => d.has_upload)

  // Two letters of the same template drafted on the same day are otherwise indistinguishable.
  const ident = (d) => `${docName(d, templates)}|${d.entity}|${fmtShort(d.created_at)}`
  const seen = g.docs.reduce((m, d) => ({ ...m, [ident(d)]: (m[ident(d)] || 0) + 1 }), {})

  async function approveAll() {
    setBulkBusy(true)
    const res = await Promise.allSettled(drafts.map((d) => api.approveDocument(d.id)))
    res.forEach((r) => r.status === 'fulfilled' && onMerge(r.value))
    const failed = res.filter((r) => r.status === 'rejected').length
    toast(failed ? `${drafts.length - failed} approved, ${failed} failed` : `${drafts.length} approved`, failed ? 'error' : undefined)
    setBulkBusy(false)
    setConfirmBulk(false)
  }

  return (
    <>
      <tr className="border-y border-slate-200 bg-slate-50/70">
        <td colSpan={5} className="px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <button
              type="button"
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? 'Show' : 'Hide'} ${g.name}’s documents`}
              onClick={onToggle}
              className={cx('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-600', focusRing)}
            >
              <ChevronRight className={cx('h-4 w-4 transition-transform duration-150 ease-snappy', !collapsed && 'rotate-90')} />
            </button>
            <Avatar name={g.name} className="h-9 w-9 text-xs" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{g.name}</p>
              <p className="truncate text-xs text-slate-500">{g.email || '—'}{g.contact ? ` · ${g.contact}` : ''}</p>
            </div>

            {/* Facts that belong to the person, not to each letter: edited once, applied to all. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 lg:ml-6">
              <label className="flex items-center gap-2">
                <span className="shrink-0 text-xs font-medium text-slate-500">Personal email</span>
                <GroupField docs={g.docs} field="personal_email" type="email" placeholder="name@gmail.com" onSaved={onMerge} className="w-48" />
              </label>
              <label className="flex items-center gap-2">
                <span className="shrink-0 text-xs font-medium text-slate-500">Joining</span>
                <GroupField docs={g.docs} field="joining_date" placeholder="1 July 2026" onSaved={onMerge} className="w-36" />
              </label>
              {(differs('personal_email') || differs('joining_date')) && (
                <span className="text-xs text-amber-700">letters differ — typing sets all</span>
              )}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {allSigned && <span className="text-xs text-emerald-700">All signed — ready for onboarding</span>}
              {drafts.length >= 2 && !confirmBulk && (
                <Button variant="ghost" size="sm" onClick={() => setConfirmBulk(true)} className="whitespace-nowrap">
                  <Check className="h-3.5 w-3.5" /> Approve {drafts.length}
                </Button>
              )}
              {g.docs[0]?.application_id && (
                <button type="button" onClick={() => onAdd(g)} title={`Add another document for ${g.name}`} className={cx(ROW_ICON_BRAND, 'whitespace-nowrap')}>
                  <FilePlus2 className="h-3.5 w-3.5" /> Add document
                </button>
              )}
              <SendToOnboarding group={g} anyMoved={anyMoved} onMoved={onMerge} />
            </div>

            {/* The confirm lands on its own line, so a second fast click cannot hit it by accident. */}
            {confirmBulk && (
              <div role="status" className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Approve {drafts.length} drafts for {g.name} without opening them?
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setConfirmBulk(false)} disabled={bulkBusy}>Cancel</Button>
                <Button size="sm" onClick={approveAll} disabled={bulkBusy}>
                  {bulkBusy ? <Spinner /> : <Check className="h-3.5 w-3.5" />} Approve {drafts.length}
                </Button>
              </div>
            )}
          </div>
        </td>
      </tr>
      {!collapsed && g.docs.map((d) => (
        <DocRow
          key={d.id}
          doc={d}
          templates={templates}
          twin={seen[ident(d)] > 1}
          onMerge={onMerge}
          onPreview={onPreview}
          onEditLetter={onEditLetter}
          onEmail={onEmail}
          onDetails={onDetails}
          onApprove={onApprove}
        />
      ))}
    </>
  )
}

// What is waiting on you, across every candidate — the question the page never answered. Doubles
// as the filter: the counts are the work, clicking one narrows the list to it.
const STEP_CHIPS = [
  { key: 'approve', label: 'To approve', dot: 'bg-amber-600' },
  { key: 'send', label: 'Ready to send', dot: 'bg-amber-600' },
  { key: 'upload', label: 'Awaiting signature', dot: 'bg-sky-600' },
  { key: 'done', label: 'Signed', dot: 'bg-emerald-600' },
  { key: 'locked', label: 'In onboarding', dot: 'bg-slate-400' },
]

function Triage({ docs, active, onPick }) {
  const counts = docs.reduce((m, d) => ({ ...m, [nextStep(d)]: (m[nextStep(d)] || 0) + 1 }), {})
  const chip = (key, label, dot, n) => (
    <button
      key={key}
      type="button"
      aria-pressed={active === key}
      disabled={!n && key !== null}
      onClick={() => onPick(active === key ? null : key)}
      className={cx(
        'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition duration-150 ease-snappy',
        focusRing,
        active === key
          ? 'border-brand-300 bg-brand-50 text-brand-700'
          : n
            ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            : 'cursor-default border-slate-200/70 bg-white text-slate-400',
      )}
    >
      {dot && <span aria-hidden className={cx('h-1.5 w-1.5 rounded-full', n ? dot : 'bg-slate-300')} />}
      {label}
      <span className="tabular-nums">{n}</span>
    </button>
  )
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chip(null, 'All', null, docs.length)}
      {STEP_CHIPS.map((c) => chip(c.key, c.label, c.dot, counts[c.key] || 0))}
    </div>
  )
}

export default function OfferDocs() {
  usePageTitle('Offer & Docs')
  const { toast } = useToast()
  const [docs, setDocs] = useState(null)
  const [templates, setTemplates] = useState([])
  const [view, setView] = useState(null)
  const [editing, setEditing] = useState(false) // rich-editor mode for the viewed document
  const editorRef = useRef(null)
  const [form, setForm] = useState(null) // { doc, mode }
  const [emailing, setEmailing] = useState(null) // the document whose covering mail is being reviewed
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [stage, setStage] = useState(null)   // one of nextStep()'s values, or null for everything

  const openView = (d) => { setEditing(false); setView(d) }        // preview only
  const openEditor = (d) => { setView(d); setEditing(true) }        // straight into the letter editor
  const closeView = () => { setEditing(false); setView(null) }

  const load = () => api.listAllDocuments().then(setDocs).catch(() => setDocs([]))
  useEffect(() => { load() }, [])
  useEffect(() => { api.listDocumentTemplates().then(setTemplates).catch(() => setTemplates([])) }, [])

  const mergeDoc = (up) => {
    setDocs((list) => (list || []).map((x) => (x.id === up.id ? { ...x, ...up } : x)))
    setView((v) => (v && v.id === up.id ? { ...v, ...up } : v))
  }

  // One search box over the things you'd actually search by, plus the stage chip.
  const filteredDocs = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (docs || []).filter((d) => {
      if (stage && nextStep(d) !== stage) return false
      if (!needle) return true
      return [d.candidate_name, d.email, d.personal_email, docName(d, templates), d.entity]
        .some((v) => String(v || '').toLowerCase().includes(needle))
    })
  }, [docs, templates, q, stage])
  const groups = useMemo(() => groupByCandidate(filteredDocs), [filteredDocs])

  // Candidates are OPEN by default: their documents are the work, and hiding them behind a click
  // was what forced the old row to summarise five letters into one cell.
  const [collapsed, setCollapsed] = useState(() => new Set())
  const toggleCollapse = (key) =>
    setCollapsed((c) => { const n = new Set(c); if (n.has(key)) n.delete(key); else n.add(key); return n })

  async function approve(d) {
    setBusy(true)
    try {
      const up = await api.approveDocument(d.id)
      setView((v) => (v && v.id === d.id ? { ...v, ...up } : v))
      await load()
      toast('Document approved')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  async function copy(d) {
    await navigator.clipboard.writeText(d.content || '')
    toast('Copied to clipboard')
  }

  async function saveLetter() {
    setBusy(true)
    try {
      const html = sanitizeHtml(editorRef.current?.getHtml() || '')
      const up = await api.saveDocumentContent(view.id, { content_html: html })
      mergeDoc(up)
      setEditing(false)
      toast('Letter saved')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  async function revertLetter() {
    if (!window.confirm('Discard your manual edits and revert to the generated template?')) return
    setBusy(true)
    try {
      const up = await api.saveDocumentContent(view.id, { content_html: '' })
      mergeDoc(up)
      setEditing(false)
      toast('Reverted to the generated template')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  function onFormDone(up, mode) {
    setForm(null)
    if (mode === 'edit') setView((v) => (v && v.id === up.id ? { ...v, ...up } : v))
    load()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Offer & Docs"
        subtitle="Every letter you owe a candidate, and the one thing each is waiting on. Fill their details once, preview, email for signature, then file the signed copy back."
      />

      {docs === null ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Documents show up here once generated — automatically when a candidate is marked Hired, or from a candidate’s Offer tab."
        />
      ) : (
        <>
          {/* What is waiting on you, across everyone — and the way to narrow to just that. */}
          <div className="flex flex-wrap items-center gap-3">
            <Triage docs={docs} active={stage} onPick={setStage} />
            <label className="relative ml-auto">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search candidate or document…"
                aria-label="Search candidates and documents"
                className={cx('w-64 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none transition-colors duration-150 ease-snappy placeholder:text-slate-500 hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20', focusRing)}
              />
            </label>
          </div>

          <Card className="overflow-hidden p-0">
            {groups.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-3 py-12 text-center">
                <p className="text-sm text-slate-500">Nothing matches that.</p>
                <Button variant="ghost" size="sm" onClick={() => { setQ(''); setStage(null) }}>Clear filters</Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2.5">Document</th>
                      {/* The stage axis lives in the header, printed once for the whole page. */}
                      <th className="w-[16.5rem] px-4 py-2.5">
                        <span className="grid max-w-[15.5rem] grid-cols-4 font-medium normal-case tracking-normal">
                          {STAGES.map((st) => <span key={st}>{st}</span>)}
                        </span>
                      </th>
                      <th className="px-4 py-2.5">Notes</th>
                      <th className="w-[11rem] px-4 py-2.5">Next action</th>
                      <th className="w-[7.5rem] px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <CandidateGroup
                        key={g.key}
                        group={g}
                        templates={templates}
                        collapsed={collapsed.has(g.key)}
                        onToggle={() => toggleCollapse(g.key)}
                        onMerge={mergeDoc}
                        onPreview={openView}
                        onEditLetter={openEditor}
                        onEmail={setEmailing}
                        onDetails={(d) => setForm({ doc: d, mode: 'edit' })}
                        onApprove={approve}
                        onAdd={(grp) => setForm({ doc: grp.docs[0], mode: 'new' })}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Modal
        open={!!view}
        onClose={closeView}
        size="doc"
        title={view ? (
          <span className="inline-flex items-center gap-2">
            {DOC_LABEL[view.doc_type] || view.doc_type} — {view.candidate_name || 'Candidate'}
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
              <Button variant="ghost" onClick={() => { documentToPdfBlobUrl(view).then((u) => { if (!window.open(u, '_blank')) toast('Allow pop-ups to open the PDF', 'error') }).catch((e) => toast(e.message, 'error')) }}><Printer className="h-4 w-4" /> Print / PDF</Button>
              <Button variant="ghost" onClick={() => copy(view)}><Copy className="h-4 w-4" /> Copy</Button>
              {view.status !== 'approved' && !view.move_to_onboarding && (
                <Button onClick={() => setEditing(true)} title="Type directly on the letter"><PenLine className="h-4 w-4" /> Edit letter</Button>
              )}
              {view.status !== 'approved'
                ? <Button variant="ghost" onClick={() => approve(view)} disabled={busy}>{busy ? <Spinner /> : <><Check className="h-4 w-4" /> Approve</>}</Button>
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
