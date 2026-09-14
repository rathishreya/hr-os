// Everything about the onboarding form in one popup: the link to send, and every response that
// has come back, with the detail of any one of them a click away.
//
// It is a popup rather than a page section because that is where the work happens — a recruiter
// chasing paperwork is standing on Offer & Docs, not on the 100-day tracker.
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, Check, Copy, Inbox, Link as LinkIcon, Paperclip, PencilLine, Search, X,
} from 'lucide-react'
import { api } from '../../api'
import { Badge, Button, Modal, Spinner, cx, focusRing, inputClass } from '../../ui'
import { EMPTY, ROW_HOVER, TD, TH, THEAD, THEAD_ROW } from '../tableStyles'
import { ColumnFilter, distinctValues, useColumnFilters } from '../tableFilters'
import { useToast } from '../Toast'
import { SECTIONS, VARIANTS, fieldsFor, isFile, isRequired, labelFor } from '../../onboardingFields'

const fmtSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)
const variantLabel = (v) => VARIANTS.find((x) => x.value === v)?.label || v

/** Required answers a response is still without — the reason to chase somebody. */
function missingFor(r) {
  const variant = r.variant || 'individual'
  const answers = r.answers || {}
  const files = new Set((r.files || []).map((f) => f.field_key))
  return fieldsFor(variant).filter(
    (f) => isRequired(f, answers) && !(isFile(f) ? files.has(f.key) : answers[f.key]),
  )
}

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
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button type="button" onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition-colors duration-150 ease-snappy hover:bg-slate-100 hover:text-slate-900">
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
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
          <span>{missing.length} required {missing.length === 1 ? 'answer is' : 'answers are'} still
            missing: {missing.map((f) => labelFor(f, variant)).join(', ')}.</span>
        </p>
      )}

      {/* Columns rather than a grid: a grid row is as tall as its tallest card, so a four-row
          section sitting beside a twelve-row one left a block of empty space underneath it and the
          next section started below the gap. Columns pack each card under the previous one, so a
          short section costs four rows and nothing more. break-inside-avoid keeps a card whole.
          The title lives inside each card so scrolling can never separate it from its own rows. */}
      <div className="columns-1 gap-4 lg:columns-2 [&>section]:break-inside-avoid [&>section]:mb-4">
        {sections.map((sec) => (
          <section key={sec.id} className="overflow-hidden rounded-xl border border-slate-200">
            <h3 className={cx('border-b border-brand-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-brand-800', THEAD)}>
              {sec.title}
            </h3>
            <dl className="divide-y divide-slate-100">
              {sec.fields.map((f) => {
                const file = filesByKey[f.key]
                const value = answers[f.key]
                const blank = isFile(f) ? !file : !value
                return (
                  <div key={f.key} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-4 px-4 py-2.5">
                    <dt className="min-w-0 text-[13px] leading-relaxed text-slate-600">
                      {labelFor(f, variant)}
                      {/* The marker earns its place only when the answer is actually absent.
                          Marking a question required next to the answer somebody already gave
                          tells the reader nothing. */}
                      {blank && isRequired(f, answers) && (
                        <span className="ml-1 whitespace-nowrap text-[11px] font-medium text-amber-700">
                          required
                        </span>
                      )}
                    </dt>
                    <dd className="min-w-0 text-[15px]">
                      {isFile(f) ? (
                        file ? (
                          <button type="button" onClick={() => openUpload(file.id, toast)}
                            className={cx('inline-flex max-w-full items-center gap-1.5 text-brand-700 hover:underline', focusRing)}>
                            <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span className="min-w-0 truncate">{file.filename}</span>
                            <span className="shrink-0 text-xs tabular-nums text-slate-500">{fmtSize(file.size)}</span>
                          </button>
                        ) : <span className={EMPTY}>Not sent</span>
                      ) : editing ? (
                        /* No fixed height and no py-0: forcing a 32px box with the padding removed
                           cropped the text inside it, so a currency read as a sliced "CAD". Let
                           the control size itself around its own line. */
                        f.type === 'select' || f.type === 'radio' ? (
                          <select className={cx(inputClass, 'py-1.5')} value={value || ''}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}>
                            <option value="">&mdash;</option>
                            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input className={cx(inputClass, 'py-1.5')} value={value || ''}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
                        )
                      ) : (
                        value ? <span className="whitespace-pre-wrap break-words text-slate-800">{value}</span>
                          : <span className={EMPTY}>&mdash;</span>
                      )}
                    </dd>
                  </div>
                )
              })}
              {!sec.fields.length && (
                <p className="px-3 py-2 text-xs text-slate-400">Nothing in this section for them.</p>
              )}
            </dl>
          </section>
        ))}
      </div>
    </div>
  )
}

// The columns HR chases. Beyond who sent it, these are the answers that hold up payroll, the
// provident fund and a bank transfer, so they belong in the list rather than two clicks inside it.
const COLUMNS = [
  { key: 'reference', label: 'Reference', get: (r) => r.reference, cls: 'font-medium tabular-nums text-slate-800' },
  { key: 'name', label: 'Name', get: (r) => r.legal_name || r.candidate_name || '' },
  { key: 'state', label: 'Complete', get: (r) => (missingFor(r).length ? `${missingFor(r).length} missing` : 'Complete') },
  { key: 'variant', label: 'Type', get: (r) => variantLabel(r.variant) },
  { key: 'email', label: 'Email', get: (r) => r.email || '' },
  { key: 'mobile', label: 'Mobile', get: (r) => r.answers?.mobile || '' },
  { key: 'nationality', label: 'Nationality', get: (r) => r.answers?.nationality || '' },
  { key: 'national_id', label: 'National ID', get: (r) => r.answers?.national_id_number || '' },
  { key: 'bank', label: 'Bank', get: (r) => r.answers?.bank_name || '' },
  { key: 'account', label: 'Account no.', get: (r) => r.answers?.account_number || '', cls: 'tabular-nums' },
  { key: 'currency', label: 'Pay in', get: (r) => r.answers?.salary_currency || '' },
  { key: 'files', label: 'Files', get: (r) => String((r.files || []).length), cls: 'tabular-nums' },
  { key: 'sent', label: 'Sent', get: (r) => new Date(r.submitted_at).toLocaleDateString() },
]

export default function OnboardingFormsModal({ open, onClose }) {
  const { toast } = useToast()
  const [rows, setRows] = useState(null)
  const [picked, setPicked] = useState(null)
  const [q, setQ] = useState('')
  const colFilters = useColumnFilters()

  // The parent remounts this on open (see its `key`), so there is no stale picked row to clear.
  useEffect(() => {
    if (!open) return
    api.listOnboardingSubmissions().then(setRows).catch(() => setRows([]))
  }, [open])

  const link = `${window.location.origin}/onboarding-form`
  const all = useMemo(() => rows || [], [rows])

  const searched = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return all
    return all.filter((r) => COLUMNS.some((c) => String(c.get(r) || '').toLowerCase().includes(n)))
  }, [all, q])

  const accessors = useMemo(() => Object.fromEntries(COLUMNS.map((c) => [c.key, c.get])), [])
  const shown = useMemo(() => colFilters.apply(searched, accessors), [searched, colFilters, accessors])
  const values = useMemo(
    () => Object.fromEntries(COLUMNS.map((c) => [c.key, distinctValues(all, c.get)])),
    [all],
  )

  const incomplete = all.filter((r) => missingFor(r).length).length
  const unattached = all.filter((r) => !r.candidate_id).length
  const merge = (up) => { setRows((l) => (l || []).map((r) => (r.id === up.id ? up : r))); setPicked(up) }

  return (
    <Modal open={open} onClose={onClose} size="wide"
      title={picked ? 'Onboarding form' : `Onboarding form${rows ? ` — ${rows.length} received` : ''}`}>
      {picked ? (
        <Detail submission={picked} onBack={() => setPicked(null)} onSaved={merge} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            {/* The link to send. First, because it is the thing most often needed. */}
            <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3.5">
              <p className="text-xs font-semibold text-brand-900">The form link</p>
              <p className="mt-0.5 text-xs leading-relaxed text-brand-800">
                Anyone can fill this in. For someone already on an offer, use their own prefilled
                link from the candidate’s menu on Offer &amp; Docs — it attaches straight to their record.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
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

            {/* What is left to do, before anybody opens a row. */}
            <div className="grid grid-cols-3 gap-2 lg:w-[19rem]">
              {[
                { n: all.length, label: 'received', tone: 'text-slate-900' },
                { n: incomplete, label: 'incomplete', tone: incomplete ? 'text-amber-700' : 'text-slate-900' },
                { n: unattached, label: 'unattached', tone: unattached ? 'text-amber-700' : 'text-slate-900' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <p className={cx('text-xl font-semibold leading-none tabular-nums', s.tone)}>{s.n}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {rows === null ? (
            <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
              <Spinner className="h-4 w-4" /> Loading responses…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center">
              <Inbox className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
              <p className="mt-3 text-sm font-medium text-slate-700">No responses yet</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                Every offer-letter email carries the candidate’s own link, and what they send lands
                here the moment they send it.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search anything in the table…"
                    className={cx(inputClass, 'h-9 pl-8 text-sm')} />
                </label>
                {colFilters.active > 0 && (
                  <button type="button" onClick={colFilters.clear}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 transition-colors duration-150 ease-snappy hover:bg-brand-100">
                    <span className="tabular-nums">{colFilters.active}</span> filtered
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                )}
                <span className="text-xs tabular-nums text-slate-500">{shown.length} of {all.length}</span>
              </div>

              <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: '52vh' }}>
                <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
                  <thead className={cx(THEAD, 'sticky top-0 z-10')}>
                    <tr className={THEAD_ROW}>
                      {COLUMNS.map((c) => (
                        <th key={c.key} scope="col" className={TH}>
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            {c.label}
                            <ColumnFilter label={c.label} values={values[c.key]}
                              excluded={colFilters.filters[c.key] || []}
                              onChange={(a) => colFilters.setFilter(c.key, a)} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const miss = missingFor(r).length
                      return (
                        <tr key={r.id} onClick={() => setPicked(r)}
                          className={cx('cursor-pointer border-b border-slate-100 last:border-0', ROW_HOVER)}>
                          {COLUMNS.map((c) => {
                            const v = c.get(r)
                            if (c.key === 'state') {
                              return (
                                <td key={c.key} className={TD}>
                                  {miss ? (
                                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-amber-700">
                                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />{miss} missing
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-700">
                                      <Check className="h-3.5 w-3.5" aria-hidden />Complete
                                    </span>
                                  )}
                                </td>
                              )
                            }
                            if (c.key === 'name') {
                              return (
                                <td key={c.key} className={TD}>
                                  <span className="block truncate font-medium text-slate-800">
                                    {v || <span className={EMPTY}>—</span>}
                                  </span>
                                  {!r.candidate_id && <span className="text-[11px] text-amber-700">not attached</span>}
                                </td>
                              )
                            }
                            return (
                              <td key={c.key} className={cx(TD, 'text-slate-600', c.cls)}>
                                <span className="block max-w-[16rem] truncate" title={v}>
                                  {v || <span className={EMPTY}>—</span>}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    {shown.length === 0 && (
                      <tr>
                        <td colSpan={COLUMNS.length} className="px-3 py-10 text-center text-sm text-slate-500">
                          Nothing matches that.
                        </td>
                      </tr>
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
