import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Check, Copy, Eye, Pencil, FilePlus2, RefreshCw, Printer, Upload, ArrowRightCircle, ChevronRight, Rocket, Lock } from 'lucide-react'
import { api } from '../api'
import { Card, Badge, Button, Spinner, EmptyState, PageHeader, Modal, Field, inputClass, cx } from '../ui'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'
import { useColumnFilters, ColumnFilter, distinctValues } from '../components/tableFilters'
import DocumentPaper from '../components/docs/DocumentPaper'
import { printDocument } from '../components/docs/printDocument'

const DOC_LABEL = {
  offer_letter: 'Offer letter',
  employment_contract: 'Employment contract',
  traineeship_offer: 'Traineeship offer',
  nda: 'NDA / Confidentiality',
  employment_agreement: 'Employment agreement',
  contractor_agreement: 'Contractor agreement',
}

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
  { key: 'approving_manager', label: 'Approving manager' },
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
    approving_manager: doc.approving_manager || '',
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
    mode === 'new' ? 'offer_letter' : doc.template_key || doc.doc_type || 'offer_letter',
  )
  const [entity, setEntity] = useState(doc.entity || 'EZ')
  const [terms, setTerms] = useState(prefillTerms(doc))
  const [resp, setResp] = useState(
    Array.isArray(doc.terms?.responsibilities) ? doc.terms.responsibilities.join('\n') : '',
  )
  const [busy, setBusy] = useState(false)

  // Templates the recruiter can pick (template-backed only; AI types stay as-is on edit).
  const options = templates.length ? templates : [{ key: 'offer_letter', label: 'Offer Letter' }]

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
          <Button onClick={save} disabled={busy} variant={isNew ? 'primary' : 'ghost'}>
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
              <option value="AEZ">AEZ — AEZ Private Limited</option>
            </select>
          </Field>
          <Field label="Document to generate">
            <select className={inputClass} value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
              {options.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
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

function Th({ children }) {
  return <th className="whitespace-nowrap px-3 py-2.5"><span className="inline-flex items-center gap-1">{children}</span></th>
}

// Filter accessors for the grouped (one-row-per-candidate) view. Per-document fields like
// compensation/location/manager live in the expandable detail, not as filterable columns.
const OFFER_ACCESSORS = {
  name: (d) => `${d.candidate_name || ''} ${d.email || ''}`,
  contact: (d) => d.contact || '',
  document: (d) => DOC_LABEL[d.doc_type] || d.doc_type || '',
  status: (d) => d.status || '',
  onboarding: (d) => (d.move_to_onboarding ? 'Moved' : 'Not moved'),
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
const ROW_ICON_GREEN = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 ring-1 ring-emerald-200 transition duration-150 ease-snappy hover:bg-emerald-50 active:scale-95'
// "Generate a new document" is an additive action — give it a distinct brand-filled affordance so
// it never reads the same as the neutral "Edit (regenerate in place)" pencil.
const ROW_ICON_BRAND = 'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white ring-1 ring-brand-600 transition duration-150 ease-snappy hover:bg-brand-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:cursor-not-allowed disabled:opacity-40'

// A small offer-administration status, derived from the system state (no separate offer-lifecycle
// column exists yet). Reflects the document's progress: Draft → Approved → Signed copy on file →
// Onboarding.
function docStatus(d) {
  if (d.move_to_onboarding) return { label: 'In onboarding', tone: 'green' }
  if (d.has_upload) return { label: 'Signed copy on file', tone: 'blue' }
  if (d.status === 'approved') return { label: 'Approved', tone: 'green' }
  return { label: 'Draft', tone: 'amber' }
}

// Inline, save-on-blur text cell for an offer-administration field (personal email / joining date).
// Locked (read-only) once the candidate has moved to onboarding — the doc is effectively issued.
function InlineText({ doc, field, value, type = 'text', placeholder, onSaved, locked }) {
  const { toast } = useToast()
  const [val, setVal] = useState(value || '')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setVal(value || '') }, [value])

  async function commit() {
    const next = val.trim()
    if (next === (value || '')) return
    setBusy(true)
    try {
      const up = await api.updateDocumentFields(doc.id, { [field]: next })
      onSaved(up)
    } catch (e) {
      setVal(value || '')
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (locked) {
    return <span className="inline-flex items-center gap-1 text-slate-500">{value || '—'}<Lock className="h-3 w-3 text-slate-300" /></span>
  }
  return (
    <input
      type={type}
      value={val}
      placeholder={placeholder}
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className="w-full min-w-[8rem] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition-colors duration-150 ease-snappy placeholder:text-slate-300 hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
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
      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition-colors duration-150 ease-snappy hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
    >
      <option value="EZ">EZ</option>
      <option value="AEZ">AEZ</option>
    </select>
  )
}

// Upload / preview the signed & countersigned copy of this document. The single upload_* slot on
// the model holds the executed PDF (uploading a new one replaces it). has_upload drives the green
// "view" link so HR can see at a glance which documents have a signed copy on file.
function UploadCell({ doc, onUploaded }) {
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
      const up = await api.uploadDocumentFile(doc.id, fd)
      toast('Countersigned copy uploaded')
      onUploaded(up)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }
  return (
    <>
      {doc.has_upload && (
        <a
          href={api.documentUploadUrl(doc.id)}
          target="_blank"
          rel="noreferrer"
          title={`View countersigned copy (${doc.upload_filename || 'uploaded file'})`}
          aria-label="View countersigned copy"
          className={ROW_ICON_GREEN}
        >
          <FileText className="h-4 w-4" />
        </a>
      )}
      <label title={doc.has_upload ? 'Replace countersigned copy' : 'Upload countersigned copy (signed PDF)'} className={cx(ROW_ICON, 'cursor-pointer')}>
        {busy ? <Spinner /> : <Upload className="h-4 w-4" />}
        <input ref={ref} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} />
      </label>
    </>
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
      onClick={send}
      disabled={busy}
      className="px-2.5 py-1 text-xs"
      title="Create this candidate's onboarding tracker"
    >
      {busy ? <Spinner /> : <ArrowRightCircle className="h-3.5 w-3.5" />} Send to onboarding
    </Button>
  )
}

export default function OfferDocs() {
  usePageTitle('Offer & Docs')
  const { toast } = useToast()
  const [docs, setDocs] = useState(null)
  const [templates, setTemplates] = useState([])
  const [view, setView] = useState(null)
  const [form, setForm] = useState(null) // { doc, mode }
  const [busy, setBusy] = useState(false)
  const filterCtl = useColumnFilters()

  const load = () => api.listAllDocuments().then(setDocs).catch(() => setDocs([]))
  useEffect(() => { load() }, [])
  useEffect(() => { api.listDocumentTemplates().then(setTemplates).catch(() => setTemplates([])) }, [])

  const mergeDoc = (up) => {
    setDocs((list) => (list || []).map((x) => (x.id === up.id ? { ...x, ...up } : x)))
    setView((v) => (v && v.id === up.id ? { ...v, ...up } : v))
  }

  const filteredDocs = docs ? filterCtl.apply(docs, OFFER_ACCESSORS) : []
  const distinct = useMemo(
    () => Object.fromEntries(Object.entries(OFFER_ACCESSORS).map(([k, acc]) => [k, distinctValues(docs || [], acc)])),
    [docs],
  )
  const docFilter = (fkey) => (
    <ColumnFilter label={fkey} values={distinct[fkey] || []} excluded={filterCtl.filters[fkey] || []} onChange={(arr) => filterCtl.setFilter(fkey, arr)} />
  )
  const groups = groupByCandidate(filteredDocs)
  const [expanded, setExpanded] = useState(() => new Set())
  const toggleExpand = (key) =>
    setExpanded((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })

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

  function onFormDone(up, mode) {
    setForm(null)
    if (mode === 'edit') setView((v) => (v && v.id === up.id ? { ...v, ...up } : v))
    load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offer & Docs"
        subtitle="Offer letters, contracts & NDAs across every candidate. Pick the entity and document, fill the details (autofilled where we can), then generate and approve."
      />

      {docs === null ? (
        <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Loading…</div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Documents show up here once generated — automatically when a candidate is marked Hired, or from a candidate’s Offer tab."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-8 px-3 py-2.5" />
                  <Th>Name {docFilter('name')}</Th>
                  <Th>Contact {docFilter('contact')}</Th>
                  <Th>Documents {docFilter('document')}</Th>
                  <Th>Status {docFilter('status')}</Th>
                  <Th>Onboarding {docFilter('onboarding')}</Th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const isOpen = expanded.has(g.key)
                  const drafts = g.docs.filter((d) => d.status !== 'approved').length
                  const approved = g.docs.length - drafts
                  const anyMoved = g.docs.some((d) => d.move_to_onboarding)
                  return (
                    <Fragment key={g.key}>
                      <tr onClick={() => toggleExpand(g.key)} className="cursor-pointer border-b border-slate-100 transition-colors duration-150 ease-snappy hover:bg-brand-50/40">
                        <td className="px-3 py-3 align-middle text-slate-400">
                          <ChevronRight className={cx('h-4 w-4 transition-transform duration-150 ease-snappy', isOpen && 'rotate-90 text-brand-600')} />
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <span className="flex items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-brand-500" />
                            <span className="min-w-0">
                              <span className="block font-medium text-slate-800">{g.name}</span>
                              <span className="block text-xs text-slate-400">{g.email || '—'}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle text-slate-500">{g.contact || '—'}</td>
                        <td className="px-3 py-3 align-middle">
                          <span className="flex flex-wrap items-center gap-1">
                            {g.docs.slice(0, 4).map((d) => (
                              <button
                                key={d.id}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setView(d) }}
                                title={`Preview ${DOC_LABEL[d.doc_type] || d.doc_type}`}
                                className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600 transition-colors duration-150 ease-snappy hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                              >
                                {DOC_LABEL[d.doc_type] || d.doc_type}
                              </button>
                            ))}
                            {g.docs.length > 4 && <span className="text-[11px] text-slate-400">+{g.docs.length - 4}</span>}
                            <span className="ml-0.5 text-[11px] tabular-nums text-slate-400">({g.docs.length})</span>
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <span className="flex flex-wrap gap-1">
                            {approved > 0 && <Badge tone="green">{approved} approved</Badge>}
                            {drafts > 0 && <Badge tone="amber">{drafts} draft</Badge>}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <SendToOnboarding group={g} anyMoved={anyMoved} onMoved={mergeDoc} />
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={6} className="px-3 pb-3 pt-1">
                            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                    <th className="px-3 py-2 font-semibold">Document</th>
                                    <th className="px-3 py-2 font-semibold">Status</th>
                                    <th className="px-3 py-2 font-semibold">Personal email</th>
                                    <th className="px-3 py-2 font-semibold">Joining date</th>
                                    <th className="px-3 py-2 font-semibold">Entity</th>
                                    <th className="px-3 py-2 text-right font-semibold">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.docs.map((d) => {
                                    const st = docStatus(d)
                                    const locked = !!d.move_to_onboarding
                                    return (
                                    <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                                      <td className="px-3 py-2.5 align-middle">
                                        <div className="font-medium text-slate-800">{DOC_LABEL[d.doc_type] || d.doc_type}</div>
                                        <div className="text-[11px] text-slate-400">{d.department || '—'}</div>
                                      </td>
                                      <td className="px-3 py-2.5 align-middle"><Badge tone={st.tone}>{st.label}</Badge></td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <InlineText doc={d} field="personal_email" type="email" value={d.personal_email}
                                          placeholder="personal@email.com" locked={locked} onSaved={mergeDoc} />
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <InlineText doc={d} field="joining_date" value={d.joining_date}
                                          placeholder="1 July 2026" locked={locked} onSaved={mergeDoc} />
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <InlineEntity doc={d} value={d.entity} locked={locked} onSaved={mergeDoc} />
                                      </td>
                                      <td className="px-3 py-2.5 align-middle">
                                        <div className="flex items-center justify-end gap-1.5">
                                          <UploadCell doc={d} onUploaded={mergeDoc} />
                                          {d.application_id && (
                                            <button type="button" onClick={() => setForm({ doc: d, mode: 'new' })} title="Generate a new document" aria-label="Generate a new document" className={ROW_ICON_BRAND}><FilePlus2 className="h-4 w-4" /></button>
                                          )}
                                          {d.status !== 'approved' && d.application_id && (
                                            <button type="button" onClick={() => setForm({ doc: d, mode: 'edit' })} title="Edit & regenerate this document" aria-label="Edit document" className={ROW_ICON}><Pencil className="h-4 w-4" /></button>
                                          )}
                                          <button type="button" onClick={() => setView(d)} title="Preview" aria-label="Preview document" className={ROW_ICON}><Eye className="h-4 w-4" /></button>
                                        </div>
                                      </td>
                                    </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {!groups.length && (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">No documents match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={!!view}
        onClose={() => setView(null)}
        size="doc"
        title={view ? `${DOC_LABEL[view.doc_type] || view.doc_type} — ${view.candidate_name || 'Candidate'}` : ''}
        footer={view && (
          <>
            <Button variant="ghost" onClick={() => { if (!printDocument(view)) toast('Allow pop-ups to print / save as PDF', 'error') }}><Printer className="h-4 w-4" /> Print / PDF</Button>
            <Button variant="ghost" onClick={() => copy(view)}><Copy className="h-4 w-4" /> Copy</Button>
            {view.status !== 'approved' && view.application_id && (
              <Button variant="ghost" onClick={() => { const d = view; setView(null); setForm({ doc: d, mode: 'edit' }) }}><Pencil className="h-4 w-4" /> Edit</Button>
            )}
            {view.status !== 'approved'
              ? <Button onClick={() => approve(view)} disabled={busy}>{busy ? <Spinner /> : <><Check className="h-4 w-4" /> Approve</>}</Button>
              : <Badge tone="green">Approved</Badge>}
          </>
        )}
      >
        {view && <DocumentPaper doc={view} />}
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
    </div>
  )
}
