import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, ArrowRightCircle, Building2, Check, ChevronDown, Columns3, Copy, FilePlus2,
  FileText, Lock, Mail, MoreHorizontal, PenLine, Printer, RefreshCw, Rocket, Search, Upload,
} from 'lucide-react'
import { api } from '../api'
import {
  Badge, Button, Field, IconButton, Modal, Skeleton, Spinner, cx, focusRing, inputClass,
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

// The six ways to narrow the index. Predicates rather than a nextStep equality, because
// "went out unapproved" deliberately overlaps the others.
const LENS = {
  all: () => true,
  yours: (d) => ['approve', 'send'].includes(nextStep(d)),
  theirs: (d) => nextStep(d) === 'upload',
  signed: (d) => nextStep(d) === 'done',
  filed: (d) => nextStep(d) === 'locked',
  unapproved: (d) => !d.move_to_onboarding && d.status !== 'approved' && (!!d.email_sent_at || !!d.has_upload),
  nodate: (d) => !d.joining_date && !d.move_to_onboarding && !d.has_upload,
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

// The two-band vertical rhythm a person-fact obeys: the control on one line, its note on the next,
// so a message that must not be missed grows the row instead of being truncated.
const B1 = 'flex h-7 min-w-0 items-center gap-1.5'
const B2 = 'mt-0.5 flex h-[18px] min-w-0 items-center gap-1.5'

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
// ── The one repeating unit: a letter in the index ───────────────────────────────────────────
// A row is navigation, not a control panel. It carries a state dot, the letter's name, a leader
// that absorbs every pixel of slack so the right-hand tracks stay aligned, and the fact it is
// waiting on — written as a lower-case fragment, never a label or a button.
const DOT = {
  ours: 'bg-amber-500', unapproved: 'bg-amber-500', theirs: 'bg-sky-500',
  done: 'bg-emerald-500', locked: 'bg-transparent ring-1 ring-inset ring-slate-300',
}
const NAME = {
  ours: 'font-semibold text-slate-900', unapproved: 'font-semibold text-slate-900',
  theirs: 'font-medium text-slate-700', done: 'font-normal text-slate-600',
  locked: 'font-normal text-slate-500',
}
const PHRASE = {
  ours: 'text-slate-500', unapproved: 'font-medium text-amber-700',
  theirs: 'text-slate-500', done: 'text-slate-500', locked: 'text-slate-500',
}

const turnOf = (d) => {
  const step = nextStep(d)
  if (step === 'approve' && (d.email_sent_at || d.has_upload)) return 'unapproved'
  return TURN[step]
}

function phraseOf(d, twin) {
  const step = nextStep(d)
  if (step === 'locked') return 'filed to onboarding'
  if (step === 'done') return `signed · ${d.upload_filename || 'copy on file'}`
  if (step === 'upload') return `emailed ${fmtShort(d.email_sent_at)}`
  if (step === 'send') return `approved ${fmtShort(d.approved_at || d.created_at)}`
  if (d.email_sent_at || d.has_upload) return 'went out unapproved'
  return `drafted ${fmtShort(d.created_at)}${twin ? `, ${fmtTime(d.created_at)}` : ''}`
}

function IndexRow({ row, index, name, isSelected, isFocus, checked, selMode, focusRef,
  onSelect, onFocusRow, onToggle }) {
  const { d, p } = row
  const turn = turnOf(d)
  const locked = !!d.move_to_onboarding
  const age = ageOf(d)
  const phrase = phraseOf(d, p.twin(d))
  const title = `${name} — ${phrase} · ${ENTITY_LEGAL[d.entity] || d.entity}`

  return (
    <li
      className={cx(
        'group/row flex h-8 items-center gap-2 rounded-lg pl-1.5 pr-2 transition-[background-color,box-shadow] duration-150 ease-snappy',
        isSelected ? 'bg-white shadow-card ring-1 ring-slate-900/[0.07]' : 'hover:bg-white/70',
      )}
    >
      {/* The state dot and the selection checkbox cross-fade in one fixed slot, so choosing rows
          in bulk costs no resting chrome and nothing on the row moves. */}
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className={cx('h-1.5 w-1.5 rounded-full transition-opacity duration-200 ease-snappy', DOT[turn],
            selMode ? 'opacity-0' : 'opacity-100 group-hover/row:opacity-0 group-focus-within/row:opacity-0')}
        />
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={(e) => onToggle(d.id, index, e)}
          aria-label={`Select the ${name} for ${p.name}`}
          className={cx('absolute h-3.5 w-3.5 cursor-pointer rounded border-slate-300 accent-brand-600 transition-opacity duration-150 ease-snappy', focusRing,
            selMode ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100')}
        />
      </span>

      <button
        type="button"
        ref={isFocus ? focusRef : null}
        tabIndex={isFocus ? 0 : -1}
        aria-current={isSelected || undefined}
        title={title}
        onClick={() => onSelect(d.id)}
        onFocus={() => onFocusRow(index)}
        className={cx('flex h-8 min-w-0 flex-1 items-center gap-2 rounded text-left', focusRing)}
      >
        <span className={cx('min-w-0 shrink truncate text-[13px] leading-[18px]', NAME[turn])}>{name}</span>
        {/* The leader is the only flexible box in the row. Delete it and every column still
            lines up — the fixed tracks do the work; this just carries the eye across. */}
        <span
          aria-hidden
          className="h-px min-w-3 flex-1 border-b border-dotted border-slate-300 transition-colors duration-150 ease-snappy group-hover/row:border-slate-400"
        />
        <span className={cx('hidden w-[122px] shrink-0 truncate text-right text-[11px] 2xl:block', PHRASE[turn])}>{phrase}</span>
        <span className="hidden w-[26px] shrink-0 text-right text-[10px] font-medium tracking-[0.06em] text-slate-500 2xl:block">{d.entity}</span>
        <span className={cx('w-[30px] shrink-0 text-right text-[11px] tabular-nums', age != null ? ageClass(age) : 'text-slate-500')}>
          {age != null && age >= 1 ? `${age}d` : ''}
        </span>
        <span className="sr-only">{`${name}, ${phrase}${age != null && age >= 1 ? `, waiting ${age} days` : ''}`}</span>
      </button>
    </li>
  )
}

// The empty states, one shape used three times. ui.jsx's EmptyState is itself a Card and would
// nest a card inside this page's single card.
function Nothing({ line, sub, action }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <p className="text-[15px] font-medium text-slate-700">{line}</p>
      {sub && <p className="mt-1 max-w-sm text-xs text-slate-500">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// The letter's provenance, set like the colophon on the back of a contract rather than a progress
// bar. A stage that was skipped shows a hole in the record, which is how a ledger says so.
function Ledger({ doc: d, twin }) {
  const flags = stageFlags(d)
  const skipped = skippedAt(d)
  const current = flags.lastIndexOf(true) + 1
  const turn = turnOf(d)
  const cells = [
    { label: 'Drafted', iso: d.created_at, value: `${fmtShort(d.created_at)}${twin ? `, ${fmtTime(d.created_at)}` : ''}` },
    { label: 'Approved', iso: d.approved_at, value: d.status === 'approved' ? [fmtShort(d.approved_at), d.approved_by].filter(Boolean).join(' · ') || 'yes' : '—' },
    { label: 'Emailed', iso: d.email_sent_at, value: d.email_sent_at ? fmtShort(d.email_sent_at) : '—' },
    { label: 'Signed', iso: null, value: null },
  ]
  return (
    <ol className="mt-2 flex max-w-3xl items-stretch text-[11px]">
      {cells.map((c, i) => (
        <li key={c.label} className="min-w-0 flex-1 border-l border-slate-200 px-3 first:border-l-0 first:pl-0">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">{c.label}</span>
            {i === current && (
              <span aria-hidden className={cx('h-[2px] w-3 rounded-full', turn === 'theirs' ? 'bg-sky-600' : 'bg-amber-600')} />
            )}
          </div>
          <div
            className={cx('mt-0.5 truncate tabular-nums',
              flags[i] ? 'text-slate-700' : skipped[i] ? 'text-amber-700' : 'text-slate-500')}
            title={c.iso ? fmtLong(c.iso) : undefined}
          >
            {c.label === 'Signed'
              ? (d.has_upload
                ? <a href={api.documentUploadUrl(d.id)} target="_blank" rel="noreferrer"
                    className={cx('text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:decoration-emerald-700', focusRing)}>
                    {d.upload_filename || 'Signed copy'}
                  </a>
                : '—')
              : c.value}
            <span className="sr-only">{flags[i] ? '' : skipped[i] ? ' — skipped' : ' — not yet'}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}

// The sheet, scaled to whatever room the desk has. offsetHeight is layout px and is unaffected by
// the transform; getBoundingClientRect would feed the scaled height back into the observer.
const SHEET_W = 794   // 210mm at 96dpi

function Desk({ doc, onOpenPdf }) {
  const wrapRef = useRef(null)
  const sheetRef = useRef(null)
  const [fit, setFit] = useState({ s: 1, h: 1123 })

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const sheet = sheetRef.current
    if (!wrap || !sheet) return undefined
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setFit({ s: Math.min(1, Math.max(0.78, wrap.clientWidth / SHEET_W)), h: sheet.offsetHeight })
      })
    }
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    ro.observe(sheet)
    measure()
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [doc.id, doc.content_html])

  return (
    <>
      <div ref={wrapRef} className="mx-auto w-full max-w-[794px]">
        <div style={{ height: Math.round(fit.h * fit.s) }}>
          <div ref={sheetRef} style={{ width: SHEET_W, transform: `scale(${fit.s})`, transformOrigin: 'top left' }}>
            <DocumentPaper doc={doc} render="sheet" />
          </div>
        </div>
      </div>
      <div className="mx-auto mt-3 flex max-w-[794px] items-baseline justify-between gap-3 text-[11px] text-slate-500">
        <span>Continuous preview — the issued PDF is paginated.</span>
        <button
          type="button"
          onClick={onOpenPdf}
          className={cx('shrink-0 rounded font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900 hover:decoration-slate-600', focusRing)}
        >
          Open as PDF
        </button>
      </div>
    </>
  )
}

const MOD = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || '') ? '⌘' : 'Ctrl '

export default function OfferDocs() {
  usePageTitle('Offer & Docs')
  const { toast } = useToast()
  const navigate = useNavigate()
  const [docs, setDocs] = useState(null)
  const [templates, setTemplates] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [focusIdx, setFocusIdx] = useState(0)
  const [mode, setMode] = useState('read')          // 'read' | 'edit'
  const editorRef = useRef(null)
  const focusRef = useRef(null)
  const [form, setForm] = useState(null)            // { doc, mode }
  const [emailing, setEmailing] = useState(null)
  const [viewPdf, setViewPdf] = useState(null)      // the doc shown in the paginated-PDF modal
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [lens, setLens] = useState('all')
  const [sortKey, setSortKey] = useState('waiting')
  const [wide, setWide] = useState(() => {
    try { return localStorage.getItem('offerdocs.wide') === '1' } catch { return false }
  })
  const [pane, setPane] = useState('index')         // below xl, only one pane shows
  const [selected, setSelected] = useState(() => new Set())
  const [confirm, setConfirm] = useState(null)
  const colFilters = useColumnFilters()
  const lastIdx = useRef(null)
  const [status, setStatus] = useState('')          // sr-only result announcements

  const load = () => api.listAllDocuments().then(setDocs).catch(() => setDocs([]))
  useEffect(() => { load() }, [])
  useEffect(() => { api.listDocumentTemplates().then(setTemplates).catch(() => setTemplates([])) }, [])

  const mergeDoc = (up) => setDocs((list) => (list || []).map((x) => (x.id === up.id ? { ...x, ...up } : x)))

  const tplByKey = useMemo(() => new Map(templates.map((t) => [t.key, t])), [templates])
  const nameOf = useMemo(() => (d) => tplByKey.get(d.template_key)?.label || DOC_LABEL[d.doc_type] || d.doc_type, [tplByKey])
  const identOf = useMemo(() => (d) => `${nameOf(d)}|${d.entity}|${fmtShort(d.created_at)}`, [nameOf])

  // Every candidate-scoped fact comes from the UNFILTERED set, so narrowing the index stays purely
  // presentational: a lens can't make "all signed" appear, and editing a shared field can't write
  // to only the letters that happen to be on screen.
  const people = useMemo(() => {
    const m = new Map()
    for (const d of docs || []) {
      const k = personKey(d)
      let p = m.get(k)
      if (!p) m.set(k, (p = { key: k, name: d.candidate_name || 'Candidate', email: d.email || '', contact: d.contact || '', all: [] }))
      p.all.push(d)
    }
    for (const p of m.values()) {
      p.all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
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
  const counts = useMemo(() => {
    const m = { all: faceted.length, yours: 0, theirs: 0, signed: 0, filed: 0, unapproved: 0, nodate: 0 }
    for (const d of faceted) {
      Object.keys(LENS).forEach((k) => { if (k !== 'all' && LENS[k](d)) m[k] += 1 })
    }
    return m
  }, [faceted])
  const shown = useMemo(() => faceted.filter(LENS[lens]), [faceted, lens])

  // Letters grouped under the person they belong to, blocks ordered by the sort, letters inside a
  // block in issue order. The API returns newest-first globally, so without this a person's
  // letters are scattered down the list.
  const groups = useMemo(() => {
    const blocks = new Map()
    for (const d of shown) {
      const k = personKey(d)
      if (!blocks.has(k)) blocks.set(k, [])
      blocks.get(k).push(d)
    }
    const cmp = {
      waiting: (a, b) => b.p.waiting - a.p.waiting || b.p.drafts.length - a.p.drafts.length,
      recent: (a, b) => b.p.newest - a.p.newest,
      name: (a, b) => a.p.name.localeCompare(b.p.name),
    }[sortKey]
    return [...blocks.entries()]
      .map(([k, rows]) => ({ p: people.get(k), rows: rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) }))
      .filter((g) => g.p)
      .sort(cmp)
  }, [shown, people, sortKey])

  const rows = useMemo(() => groups.flatMap((g) => g.rows.map((d) => ({ d, p: g.p }))), [groups])

  // The letter on the desk. Falls back to the first row so the pane is never blank while the index
  // has something in it.
  const current = useMemo(
    () => rows.find((r) => r.d.id === selectedId) || rows[0] || null,
    [rows, selectedId],
  )
  useEffect(() => {
    if (current && current.d.id !== selectedId) setSelectedId(current.d.id)
  }, [current, selectedId])
  useEffect(() => { if (focusIdx >= rows.length) setFocusIdx(0) }, [rows.length, focusIdx])

  const selCount = rows.reduce((n, r) => n + (selected.has(r.d.id) ? 1 : 0), 0)
  const selMode = selCount > 0
  const selDrafts = rows
    .filter((r) => selected.has(r.d.id) && r.d.status !== 'approved' && !r.d.move_to_onboarding)
    .map((r) => r.d)

  const select = (id) => { setSelectedId(id); setMode('read'); setPane('letter') }
  const toggleRow = (id, index, e) => {
    const shift = e?.nativeEvent?.shiftKey
    const anchor = lastIdx.current
    setSelected((s) => {
      const n = new Set(s)
      if (shift && anchor != null) {
        const [a, b] = [anchor, index].sort((x, y) => x - y)
        for (let i = a; i <= b; i += 1) if (!rows[i].d.move_to_onboarding) n.add(rows[i].d.id)
      } else if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
    lastIdx.current = index
  }

  // ── acting ────────────────────────────────────────────────────────────────────────────────
  // After an act, move to the next letter that needs you rather than sitting on the one just
  // dealt with. With a queue of drafts, the modifier chord walks it.
  function advance(actedId) {
    const i = rows.findIndex((r) => r.d.id === actedId)
    if (i < 0) return
    const order = [...rows.slice(i + 1), ...rows.slice(0, i + 1)]
    const next = order.find((r) => turnOf(r.d) === 'ours' || turnOf(r.d) === 'unapproved') || rows[i]
    setSelectedId(next.d.id)
    setFocusIdx(rows.findIndex((r) => r.d.id === next.d.id))
    setStatus(`${nameOf(next.d)} for ${next.p.name}. ${phraseOf(next.d, next.p.twin(next.d))}.`)
  }

  async function approveDoc(d, { then } = {}) {
    setBusy(true)
    try {
      const up = await api.approveDocument(d.id)
      mergeDoc(up)
      toast('Document approved')
      if (then !== false) advance(d.id)
      return up
    } catch (e) { toast(e.message, 'error'); throw e } finally { setBusy(false) }
  }

  async function setEntity(d, entity) {
    try { mergeDoc(await api.updateDocumentFields(d.id, { entity })); toast(`Entity set to ${entity}`) }
    catch (e) { toast(e.message, 'error') }
  }

  const openPdf = (d) => setViewPdf(d)

  const askOnboard = (p) => setConfirm({
    kind: 'onboard', p, Icon: ArrowRightCircle, cta: 'Send to onboarding',
    body: `Send ${p.name} to onboarding? This creates their onboarding tracker; the document used to do it is locked from further edits. There is no undo from this screen.`,
  })

  async function runConfirm() {
    setBusy(true)
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
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  async function saveLetter() {
    setBusy(true)
    try {
      const html = sanitizeHtml(editorRef.current?.getHtml() || '')
      mergeDoc(await api.saveDocumentContent(current.d.id, { content_html: html }))
      setMode('read')
      toast('Letter saved')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  async function revertLetter() {
    if (!window.confirm('Discard your manual edits and revert to the generated template?')) return
    setBusy(true)
    try {
      mergeDoc(await api.saveDocumentContent(current.d.id, { content_html: '' }))
      setMode('read')
      toast('Reverted to the generated template')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  function onFormDone(up) { setForm(null); setSelectedId(up.id); load() }

  const toggleWide = () => setWide((w) => {
    const n = !w
    try { localStorage.setItem('offerdocs.wide', n ? '1' : '0') } catch { /* private mode */ }
    return n
  })

  // ── keyboard ──────────────────────────────────────────────────────────────────────────────
  const ask = current ? askOf(current) : null
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input,textarea,select,[contenteditable]')) return
      if (document.querySelector('[role="dialog"],[role="menu"]')) return
      const i = rows.findIndex((r) => r.d.id === selectedId)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const n = Math.min(rows.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))
        if (rows[n]) { setSelectedId(rows[n].d.id); setFocusIdx(n); focusRef.current?.focus() }
      } else if (e.key === 'Home' && rows[0]) { e.preventDefault(); setSelectedId(rows[0].d.id); setFocusIdx(0) }
      else if (e.key === 'End' && rows.length) { e.preventDefault(); setSelectedId(rows[rows.length - 1].d.id); setFocusIdx(rows.length - 1) }
      else if (e.key === 'Escape' && selMode) { setSelected(new Set()) }
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ask?.run && !busy) { e.preventDefault(); ask.run() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, selectedId, ask, busy, selMode])

  // ── what this letter is asking for ────────────────────────────────────────────────────────
  function askOf({ d, p }) {
    const step = nextStep(d)
    const unapproved = step === 'approve' && (d.email_sent_at || d.has_upload)
    const others = rows.filter((r) => r.d.id !== d.id && (turnOf(r.d) === 'ours' || turnOf(r.d) === 'unapproved')).length
    const sub = (text, cls = 'text-slate-500') => <p className={cx('mt-0.5 truncate text-[11px]', cls)}>{text}</p>

    if (selMode) {
      return {
        line: `${selCount} letter${selCount === 1 ? '' : 's'} selected`,
        sub: sub(`${selDrafts.length} ${selDrafts.length === 1 ? 'is a draft' : 'are drafts'}`),
        cta: `Approve ${selDrafts.length}`,
        Icon: Check,
        disabled: !selDrafts.length,
        secondary: <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>,
        run: () => selDrafts.length && setConfirm({
          kind: 'bulk', Icon: Check, cta: `Approve ${selDrafts.length}`,
          body: `Approve ${selDrafts.length} draft${selDrafts.length === 1 ? '' : 's'} without opening ${selDrafts.length === 1 ? 'it' : 'them'}? An approved document can no longer be regenerated from its template.`,
        }),
      }
    }
    if (mode === 'edit') {
      return {
        line: 'Editing the wording — this overrides the template until you revert.',
        warn: true,
        cta: 'Save letter',
        Icon: Check,
        run: saveLetter,
        secondary: (
          <>
            {d.content_html && <Button variant="ghost" size="sm" onClick={revertLetter} disabled={busy}>Revert to template</Button>}
            <Button variant="ghost" size="sm" onClick={() => setMode('read')} disabled={busy}>Cancel</Button>
          </>
        ),
      }
    }
    const editBtn = <Button variant="ghost" size="sm" onClick={() => setMode('edit')}>Edit wording</Button>
    const noDate = !d.joining_date && (step === 'approve' || step === 'send')
    const dateWarning = noDate
      ? sub('Joining date is blank — the letter will print an empty date.', 'text-amber-700')
      : null

    if (step === 'approve') {
      return {
        line: unapproved ? 'This went out without approval.' : 'Waiting on your approval.',
        warn: unapproved,
        sub: dateWarning || sub(unapproved
          ? `Emailed ${fmtShort(d.email_sent_at)}`
          : `Drafted ${fmtShort(d.created_at)}${others ? ` · ${others} more need you` : ''}`, unapproved ? 'text-amber-700' : undefined),
        cta: 'Approve', Icon: Check, secondary: editBtn, run: () => approveDoc(d),
      }
    }
    if (step === 'send') {
      return {
        line: `Approved and ready to email ${p.name.split(' ')[0]}.`,
        sub: dateWarning || sub(`Approved ${fmtShort(d.approved_at || d.created_at)}${d.approved_by ? ` by ${d.approved_by}` : ''}`),
        cta: 'Review & send', Icon: Mail, secondary: editBtn, run: () => setEmailing(d),
      }
    }
    if (step === 'upload') {
      const age = ageOf(d)
      return {
        line: `Sent to ${p.name.split(' ')[0]}${age >= 1 ? ` ${age} day${age === 1 ? '' : 's'} ago` : ''}. Waiting on their signature.`,
        sub: sub(`Emailed ${fmtShort(d.email_sent_at)}`),
        cta: 'File the signed copy', Icon: Upload, upload: true,
        secondary: <Button variant="ghost" size="sm" onClick={() => setEmailing(d)}>Email again</Button>,
      }
    }
    if (step === 'done') {
      if (p.allSigned && !p.anyMoved) {
        return {
          line: `Every letter for ${p.name.split(' ')[0]} is signed.`,
          sub: sub(`${p.live.length} of ${p.live.length} on file`),
          cta: `Send ${p.name.split(' ')[0]} to onboarding`, Icon: ArrowRightCircle,
          run: () => askOnboard(p),
          secondary: <Button variant="ghost" size="sm" onClick={() => window.open(api.documentUploadUrl(d.id), '_blank')}>Open signed copy</Button>,
        }
      }
      return {
        line: 'Signed copy on file.',
        sub: sub(d.upload_filename || 'Countersigned PDF'),
        cta: 'Open signed copy', Icon: FileText, ghost: true,
        run: () => window.open(api.documentUploadUrl(d.id), '_blank'),
      }
    }
    return {
      line: 'Filed to onboarding. Read-only.',
      sub: sub(d.upload_filename || 'No signed copy'),
      cta: 'Open in Onboarding', Icon: Rocket, ghost: true,
      run: () => navigate('/onboarding'),
      secondary: d.has_upload
        ? <Button variant="ghost" size="sm" onClick={() => window.open(api.documentUploadUrl(d.id), '_blank')}>Open signed copy</Button>
        : null,
    }
  }

  // ── the menus, ported whole ───────────────────────────────────────────────────────────────
  function menuItems(d) {
    const locked = !!d.move_to_onboarding
    const isDraft = d.status !== 'approved'
    const step = nextStep(d)
    const templateBacked = tplByKey.has(d.template_key)
    return [
      !locked && isDraft && step !== 'approve' && {
        label: 'Approve now', icon: <Check className="h-3.5 w-3.5 text-slate-400" />, onClick: () => approveDoc(d, { then: false }),
      },
      !locked && isDraft && { label: 'Edit the wording…', icon: <PenLine className="h-3.5 w-3.5 text-slate-400" />, onClick: () => setMode('edit') },
      !locked && isDraft && templateBacked && d.application_id && {
        label: 'Details & template…', icon: <RefreshCw className="h-3.5 w-3.5 text-slate-400" />, onClick: () => setForm({ doc: d, mode: 'edit' }),
      },
      !locked && step !== 'send' && {
        label: d.email_sent_at ? 'Email again…' : 'Email now…', icon: <Mail className="h-3.5 w-3.5 text-slate-400" />, onClick: () => setEmailing(d),
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
      { label: 'Open as PDF', icon: <Printer className="h-3.5 w-3.5 text-slate-400" />, onClick: () => openPdf(d) },
      {
        label: 'Copy letter text', icon: <Copy className="h-3.5 w-3.5 text-slate-400" />,
        onClick: () => { navigator.clipboard.writeText(d.content || ''); toast('Copied to clipboard') },
      },
      !locked && !templateBacked && {
        label: `Switch entity to ${d.entity === 'EZ' ? 'AEZ' : 'EZ'}`,
        icon: <Building2 className="h-3.5 w-3.5 text-slate-400" />,
        onClick: () => setEntity(d, d.entity === 'EZ' ? 'AEZ' : 'EZ'),
      },
    ].filter(Boolean)
  }

  function personItems(p) {
    return [
      p.appDoc && { label: 'Add document…', icon: <FilePlus2 className="h-3.5 w-3.5 text-slate-400" />, onClick: () => setForm({ doc: p.appDoc, mode: 'new' }) },
      !p.anyMoved && p.appDoc && { label: 'Send to onboarding…', icon: <ArrowRightCircle className="h-3.5 w-3.5 text-slate-400" />, onClick: () => askOnboard(p) },
      p.anyMoved && { label: 'Open in Onboarding', icon: <Rocket className="h-3.5 w-3.5 text-slate-400" />, onClick: () => navigate('/onboarding') },
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
  }

  const d = current?.d
  const p = current?.p
  const { inputRef, busy: uploading, onFile: onUploadFile, pick: pickFile } = useUpload(d || { id: 0 }, mergeDoc)
  const name = d ? nameOf(d) : ''
  const initials = (p?.name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

  const CENSUS = [
    ['all', 'all'], ['yours', 'need you'], ['theirs', 'with candidates'],
    ['signed', 'signed'], ['filed', 'filed'], ['unapproved', 'went out unapproved'], ['nodate', 'have no joining date'],
  ]

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <p role="status" className="sr-only">{status}</p>

      {/* ── the index ─────────────────────────────────────────────────────────────────────── */}
      <aside className={cx(
        'flex shrink-0 flex-col border-slate-200 bg-slate-50',
        wide ? 'w-full' : 'w-full border-r xl:w-[320px] 2xl:w-[468px]',
        !wide && pane === 'letter' && 'max-xl:hidden',
        mode === 'edit' && 'hidden',
      )}>
        <div className="shrink-0 border-b border-slate-200 px-3 pb-2.5 pt-3">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight text-slate-900">Offer &amp; Docs</h1>
            <span className="text-[11px] tabular-nums text-slate-500">{(docs || []).length}</span>
            <IconButton
              className="ml-auto h-7 w-7 p-0"
              aria-pressed={wide}
              aria-label="Show every column (hides the letter)"
              title="Show every column (hides the letter)"
              onClick={toggleWide}
            >
              <Columns3 className="h-4 w-4" />
            </IconButton>
          </div>

          {/* The census: what is on the page, and the way to see only that. The underline is the
              selection mark — a row of chips would be a toolbar of boxes. */}
          <p className="mt-1.5 text-[11px] leading-4 text-slate-600">
            {CENSUS.filter(([k]) => k === 'all' || counts[k] > 0).map(([k, label], i) => (
              <span key={k}>
                {i > 0 && <span aria-hidden className="text-slate-300"> · </span>}
                <button
                  type="button"
                  onClick={() => setLens(k)}
                  aria-pressed={lens === k}
                  className={cx('rounded', focusRing,
                    lens === k
                      ? 'font-medium text-slate-900 underline decoration-2 decoration-brand-400 underline-offset-4'
                      : k === 'unapproved' || k === 'nodate'
                        ? 'text-amber-700 hover:underline hover:decoration-amber-300 hover:underline-offset-4'
                        : 'hover:text-slate-900 hover:underline hover:decoration-slate-300 hover:underline-offset-4')}
                >
                  <b className="tabular-nums font-medium">{counts[k]}</b> {label}
                </button>
              </span>
            ))}
          </p>

          <div className="mt-2 flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search candidates and letters"
                placeholder="Search…"
                className={cx('h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs text-slate-800 outline-none',
                  'transition-colors duration-150 ease-snappy placeholder:text-slate-500 hover:border-slate-300 focus:border-brand-500', focusRing)}
              />
            </label>
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-600">
              Document
              <ColumnFilter
                label="Document"
                values={docValues}
                excluded={colFilters.filters.document || []}
                onChange={(a) => colFilters.setFilter('document', a)}
              />
            </span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              aria-label="Sort candidates"
              className={cx('h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-1.5 text-[11px] text-slate-700', focusRing)}
            >
              <option value="waiting">Longest waiting</option>
              <option value="recent">Recent</option>
              <option value="name">Candidate A–Z</option>
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-6">
          {docs === null ? (
            <div className="space-y-4 px-1.5 pt-4">
              {[0, 1, 2].map((g) => (
                <div key={g} className="space-y-1.5">
                  <Skeleton className="h-3 w-28" />
                  {[0, 1, 2].map((r) => <Skeleton key={r} className="h-3 w-40" />)}
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-slate-500">Nothing matches.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => { setQ(''); setLens('all'); colFilters.clear() }}>Clear</Button>
            </div>
          ) : groups.map((g) => (
            <section key={g.p.key} aria-labelledby={`g${g.p.key}`} className="group/blk">
              <h3
                id={`g${g.p.key}`}
                className="sticky top-0 z-[1] box-content flex h-[26px] items-center gap-2.5 bg-slate-50 px-1.5 pb-1.5 pt-4"
              >
                <span className="shrink-0 text-[13px] font-semibold leading-[18px] tracking-tight text-slate-800">{g.p.name}</span>
                <span aria-hidden className="h-px flex-1 bg-slate-200" />
                {g.p.allSigned && !g.p.anyMoved ? (
                  <button
                    type="button"
                    onClick={() => askOnboard(g.p)}
                    className={cx('shrink-0 rounded text-[11px] font-medium text-emerald-700 hover:text-emerald-800', focusRing)}
                  >
                    Send to onboarding →
                  </button>
                ) : (
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{g.rows.length}</span>
                )}
                <RowMenu label={`${g.p.name} — candidate actions`} items={personItems(g.p)} />
              </h3>

              <ul className="space-y-px">
                {g.rows.map((doc) => {
                  const idx = rows.findIndex((r) => r.d.id === doc.id)
                  return (
                    <IndexRow
                      key={doc.id}
                      row={{ d: doc, p: g.p }}
                      index={idx}
                      name={nameOf(doc)}
                      isSelected={doc.id === selectedId}
                      isFocus={idx === focusIdx}
                      checked={selected.has(doc.id)}
                      selMode={selMode}
                      focusRef={focusRef}
                      onSelect={select}
                      onFocusRow={setFocusIdx}
                      onToggle={toggleRow}
                    />
                  )
                })}
              </ul>

              {g.p.appDoc && (
                <div className="h-6 pl-[26px]">
                  <button
                    type="button"
                    onClick={() => setForm({ doc: g.p.appDoc, mode: 'new' })}
                    className={cx('rounded text-[11px] text-slate-500 opacity-0 transition-opacity duration-150 ease-snappy',
                      'hover:text-slate-900 group-hover/blk:opacity-100 group-focus-within/blk:opacity-100 focus-visible:opacity-100', focusRing)}
                  >
                    + Add a document for {g.p.name.split(' ')[0]}
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>
      </aside>

      {/* ── the letter ────────────────────────────────────────────────────────────────────── */}
      <section className={cx('flex min-w-0 flex-1 flex-col', wide && mode !== 'edit' && 'hidden', !wide && pane === 'index' && 'max-xl:hidden')}>
        {!d ? (
          <Nothing
            line={docs === null ? 'Loading…' : (docs || []).length === 0 ? 'No documents yet.' : 'Nothing is waiting on you.'}
            sub={(docs || []).length === 0
              ? 'A letter appears here the moment a candidate is marked Hired, or when you generate one from their Offer tab.'
              : undefined}
            action={lens !== 'all' ? <Button variant="ghost" size="sm" onClick={() => setLens('all')}>Show every letter</Button> : undefined}
          />
        ) : (
          <>
            {/* Band A — the person, and the two facts all their letters share */}
            <div className="flex min-h-[54px] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 px-4 py-2 2xl:px-6">
              <IconButton className="h-7 w-7 shrink-0 p-0 xl:hidden" aria-label="Back to the index" onClick={() => setPane('index')}>
                <ArrowLeft className="h-4 w-4" />
              </IconButton>
              <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">{initials}</span>
              <span className="min-w-0 truncate text-[15px] font-semibold leading-[22px] tracking-tight text-slate-900">{p.name}</span>
              <span className="min-w-0 truncate text-xs text-slate-500">{p.email}</span>
              <span className="flex min-w-0 items-baseline gap-1.5 text-[11px] text-slate-500">
                Joining
                <PersonField variant="inline" person={p} field="joining_date" label="Joining date"
                  placeholder="1 July 2026" note={p.drafts.length ? 'Needed before sending' : ''} onSaved={mergeDoc} />
              </span>
              <span className="flex min-w-0 items-baseline gap-1.5 text-[11px] text-slate-500">
                Personal
                <PersonField variant="inline" person={p} field="personal_email" label="Personal email"
                  placeholder="name@gmail.com" note={p.anySent ? 'Went out to the work email' : ''} onSaved={mergeDoc} />
              </span>
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-slate-500">
                Letter {p.all.findIndex((x) => x.id === d.id) + 1} of {p.all.length}
              </span>
              <RowMenu label={`${p.name} — candidate actions`} items={personItems(p)} />
            </div>

            {/* Band B — what this letter is, and its provenance */}
            <div key={d.id} className="pane-in shrink-0 border-b border-slate-200 px-4 pb-2.5 pt-3 2xl:px-6">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h2 className="min-w-0 truncate text-[17px] font-semibold leading-6 tracking-tight text-slate-900">{name}</h2>
                <span className="shrink-0 text-[11px] font-medium text-slate-500">{ENTITY_LEGAL[d.entity] || d.entity}</span>
                {d.content_html && <Badge size="sm" tone="violet"><PenLine className="mr-1 h-3 w-3" aria-hidden />Edited</Badge>}
                {d.move_to_onboarding && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-slate-500"><Lock className="h-3 w-3" aria-hidden />Read-only</span>
                )}
              </div>
              <Ledger doc={d} twin={p.twin(d)} />
            </div>

            {/* The desk */}
            <div className={cx('min-h-0 flex-1 overflow-auto px-4 py-5 2xl:px-6 2xl:py-6',
              d.move_to_onboarding ? 'bg-slate-200/60' : 'bg-slate-100')}>
              {mode === 'edit' ? (
                <div className="mx-auto w-full max-w-[794px]">
                  <DocumentPaper doc={d} editable editorRef={editorRef} />
                </div>
              ) : (
                <>
                  <div className="hidden xl:block"><Desk doc={d} onOpenPdf={() => openPdf(d)} /></div>
                  <div className="xl:hidden">
                    <Nothing
                      line={name}
                      sub="Open the letter to read it at full size."
                      action={<Button variant="ghost" size="sm" onClick={() => openPdf(d)}>Open the letter</Button>}
                    />
                  </div>
                </>
              )}
            </div>

            {/* The action rail — exactly one primary, and it is the only place an action lives */}
            <div className="flex min-h-[56px] shrink-0 items-center gap-3 border-t border-slate-200 bg-white px-4 py-2.5 2xl:px-6">
              {confirm ? (
                <>
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  <p role="status" className="min-w-0 flex-1 text-[13px] text-amber-900">{confirm.body}</p>
                  <Button variant="ghost" size="sm" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
                  <Button size="sm" onClick={runConfirm} disabled={busy}>
                    {busy ? <Spinner className="h-3.5 w-3.5" /> : <confirm.Icon className="h-3.5 w-3.5" />} {confirm.cta}
                  </Button>
                </>
              ) : ask && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className={cx('truncate text-sm font-medium', ask.warn ? 'text-amber-800' : 'text-slate-800')}>{ask.line}</p>
                    {ask.sub}
                  </div>
                  {ask.secondary}
                  <Button
                    variant={ask.ghost ? 'ghost' : 'primary'}
                    className="h-9 min-w-[132px] shrink-0 px-4 text-sm"
                    onClick={ask.upload ? pickFile : ask.run}
                    disabled={busy || uploading || ask.disabled}
                  >
                    {busy || uploading ? <Spinner className="h-3.5 w-3.5" /> : <ask.Icon className="h-4 w-4" />}
                    {uploading ? 'Uploading…' : ask.cta}
                    {!ask.ghost && (
                      <kbd aria-hidden className="ml-1 rounded bg-white/20 px-1 text-[10px] font-semibold leading-4 text-white ring-1 ring-inset ring-white/40">{MOD}⏎</kbd>
                    )}
                  </Button>
                  <RowMenu label={`More actions for the ${name} for ${p.name}`} items={menuItems(d)} />
                </>
              )}
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onUploadFile} />
            </div>
          </>
        )}
      </section>

      {/* The paginated PDF, still available on demand — it is the artefact that actually gets sent */}
      <Modal
        open={!!viewPdf}
        onClose={() => setViewPdf(null)}
        size="doc"
        title={viewPdf ? `${nameOf(viewPdf)} — ${viewPdf.candidate_name || 'Candidate'}` : ''}
        footer={viewPdf && (
          <>
            <Button variant="ghost" onClick={() => {
              documentToPdfBlobUrl(viewPdf)
                .then((u) => { if (!window.open(u, '_blank')) toast('Allow pop-ups to open the PDF', 'error') })
                .catch((e) => toast(e.message, 'error'))
            }}><Printer className="h-4 w-4" /> Open in a new tab</Button>
            <Button variant="ghost" onClick={() => setViewPdf(null)}>Close</Button>
          </>
        )}
      >
        {viewPdf && <DocumentPaper doc={viewPdf} />}
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
          onSent={() => {
            // The send endpoint yields a send record, not a document, so nudge the row forward
            // optimistically and let the refetch reconcile.
            mergeDoc({ ...emailing, email_sent_at: new Date().toISOString() })
            advance(emailing.id)
            load()
          }}
        />
      )}
    </div>
  )
}
