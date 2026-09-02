// Everything about the onboarding form in one popup: the link to send, and every response that
// has come back, with the detail of any one of them a click away.
//
// It is a popup rather than a page section because that is where the work happens — a recruiter
// chasing paperwork is standing on Offer & Docs, not on the 100-day tracker.
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, Check, Copy, Inbox, Link as LinkIcon, Paperclip, PencilLine, Search,
} from 'lucide-react'
import { api } from '../../api'
import { Badge, Button, Modal, Spinner, cx, inputClass } from '../../ui'
import { EMPTY, ROW_HOVER, TD, TH, THEAD, THEAD_ROW } from '../tableStyles'
import { useToast } from '../Toast'
import { SECTIONS, VARIANTS, fieldsFor, isFile, isRequired, labelFor } from '../../onboardingFields'

const fmtSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)
const variantLabel = (v) => VARIANTS.find((x) => x.value === v)?.label || v

async function openUpload(uploadId, toast) {
  let url = ''
  try {
    url = URL.createObjectURL(await api.fetchOnboardingUpload(uploadId))
    if (!window.open(url, '_blank', 'noopener')) toast('Allow pop-ups to open the file', 'error')
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}

/** One response, laid out field by field, editable in place. */
function Detail({ submission: s, onBack, onSaved }) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)

  const variant = s.variant || 'individual'
  const answers = editing ? draft : (s.answers || {})
  const filesByKey = useMemo(() => Object.fromEntries((s.files || []).map((f) => [f.field_key, f])), [s])
  const sections = useMemo(() => {
    const shown = fieldsFor(variant)
    return SECTIONS.map((sec) => ({ ...sec, fields: shown.filter((f) => f.section === sec.id) }))
      .filter((sec) => sec.fields.length)
  }, [variant])

  const missing = fieldsFor(variant).filter(
    (f) => isRequired(f, answers) && !(isFile(f) ? filesByKey[f.key] : answers[f.key]),
  )

  async function save() {
    setBusy(true)
    try {
      onSaved(await api.updateOnboardingSubmission(s.id, { answers: draft }))
      toast('Details updated')
      setEditing(false)
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All responses
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-sm font-semibold text-slate-900">{s.legal_name || s.candidate_name || s.reference}</span>
        <Badge tone="violet">{variantLabel(variant)}</Badge>
        {!s.candidate_id && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />not attached to a candidate
          </span>
        )}
        <div className="ml-auto">
          {editing ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={busy}>
                {busy ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />} Save
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => { setDraft({ ...(s.answers || {}) }); setEditing(true) }}>
              <PencilLine className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>
      </div>

      {missing.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
          <span>{missing.length} required {missing.length === 1 ? 'answer is' : 'answers are'} still
            missing: {missing.map((f) => labelFor(f, variant)).join(', ')}.</span>
        </p>
      )}

      {sections.map((sec) => (
        <section key={sec.id}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-800">{sec.title}</h3>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-left text-sm">
              <thead className={THEAD}>
                <tr className={THEAD_ROW}>
                  <th scope="col" className={cx(TH, 'w-[42%]')}>Field</th>
                  <th scope="col" className={TH}>Answer</th>
                </tr>
              </thead>
              <tbody>
                {sec.fields.map((f) => {
                  const file = filesByKey[f.key]
                  const value = answers[f.key]
                  return (
                    <tr key={f.key} className="border-b border-slate-100 last:border-0">
                      <td className={cx(TD, 'align-top text-slate-600')}>
                        {labelFor(f, variant)}
                        {isRequired(f, answers) && <span className="ml-1 text-rose-500" aria-hidden>*</span>}
                      </td>
                      <td className={TD}>
                        {isFile(f) ? (
                          file ? (
                            <button type="button" onClick={() => openUpload(file.id, toast)}
                              className="inline-flex max-w-full items-center gap-1.5 text-brand-700 hover:underline">
                              <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              <span className="min-w-0 truncate">{file.filename}</span>
                              <span className="shrink-0 text-xs tabular-nums text-slate-500">{fmtSize(file.size)}</span>
                            </button>
                          ) : <span className={EMPTY}>Not sent</span>
                        ) : editing ? (
                          f.type === 'select' || f.type === 'radio' ? (
                            <select className={cx(inputClass, 'h-8 py-0 text-sm')} value={value || ''}
                              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}>
                              <option value="">—</option>
                              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input className={cx(inputClass, 'h-8 py-0 text-sm')} value={value || ''}
                              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
                          )
                        ) : (
                          value ? <span className="whitespace-pre-wrap break-words text-slate-800">{value}</span>
                            : <span className={EMPTY}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

export default function OnboardingFormsModal({ open, onClose }) {
  const { toast } = useToast()
  const [rows, setRows] = useState(null)
  const [picked, setPicked] = useState(null)
  const [q, setQ] = useState('')

  // The parent remounts this on open (see its `key`), so there is no stale picked row to clear.
  useEffect(() => {
    if (!open) return
    api.listOnboardingSubmissions().then(setRows).catch(() => setRows([]))
  }, [open])

  const link = `${window.location.origin}/onboarding-form`
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n || !rows) return rows || []
    return rows.filter((r) => [r.reference, r.legal_name, r.candidate_name, r.email, r.variant]
      .some((v) => String(v || '').toLowerCase().includes(n)))
  }, [rows, q])

  const merge = (up) => { setRows((l) => (l || []).map((r) => (r.id === up.id ? up : r))); setPicked(up) }

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title={picked ? 'Onboarding form' : `Onboarding form${rows ? ` — ${rows.length} received` : ''}`}>
      {picked ? (
        <Detail submission={picked} onBack={() => setPicked(null)} onSaved={merge} />
      ) : (
        <div className="space-y-4">
          {/* The link to send. First, because it is the thing most often needed. */}
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3">
            <p className="text-xs font-semibold text-brand-900">The form link</p>
            <p className="mt-0.5 text-xs leading-relaxed text-brand-800">
              Anyone can fill this in. For someone already on an offer, use their own prefilled link
              from the candidate’s menu on Offer &amp; Docs — it attaches straight to their record.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">{link}</code>
              <Button size="sm" variant="ghost"
                onClick={() => { navigator.clipboard.writeText(link); toast('Form link copied') }}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => window.open(link, '_blank', 'noopener')}>
                <LinkIcon className="h-3.5 w-3.5" /> Open
              </Button>
            </div>
          </div>

          {rows === null ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Spinner className="h-4 w-4" /> Loading responses…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center">
              <Inbox className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
              <p className="mt-3 text-sm font-medium text-slate-700">No responses yet</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                Every offer-letter email carries the candidate’s own link, and what they send lands
                here the moment they send it.
              </p>
            </div>
          ) : (
            <>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or reference…"
                  className={cx(inputClass, 'h-9 pl-8 text-sm')} />
              </label>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className={THEAD}>
                    <tr className={THEAD_ROW}>
                      <th scope="col" className={TH}>Reference</th>
                      <th scope="col" className={TH}>Name</th>
                      <th scope="col" className={TH}>Email</th>
                      <th scope="col" className={TH}>Type</th>
                      <th scope="col" className={TH}>Files</th>
                      <th scope="col" className={TH}>Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id} onClick={() => setPicked(r)}
                        className={cx('cursor-pointer border-b border-slate-100 last:border-0', ROW_HOVER)}>
                        <td className={cx(TD, 'font-medium tabular-nums text-slate-800')}>{r.reference}</td>
                        <td className={TD}>
                          <span className="block truncate">{r.legal_name || r.candidate_name || '—'}</span>
                          {!r.candidate_id && <span className="text-xs text-amber-700">not attached</span>}
                        </td>
                        <td className={cx(TD, 'text-slate-600')}><span className="block truncate">{r.email || '—'}</span></td>
                        <td className={cx(TD, 'text-slate-600')}>{variantLabel(r.variant)}</td>
                        <td className={cx(TD, 'tabular-nums text-slate-600')}>{r.files.length}</td>
                        <td className={cx(TD, 'whitespace-nowrap text-xs text-slate-500')}>
                          {new Date(r.submitted_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                    {shown.length === 0 && (
                      <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">Nothing matches that.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
