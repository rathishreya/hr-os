import { useEffect, useMemo, useState } from 'react'
import { Handshake, Building2, Search, Upload, FileDown, Trash2, Link2, ExternalLink, X, Copy, Check, Mail, Phone, Globe, MapPin, User } from 'lucide-react'
import { api } from '../api'
import { Button, Spinner, PageHeader, EmptyState, Badge, inputClass, cx } from '../ui'
import { DataTable } from '../components/DataTable'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'

const isVendor = (t) => (t.kind || '').toLowerCase() === 'vendor'
const catLabel = (t) => (isVendor(t) ? 'Vendor' : 'College')
const countryOf = (t) => { const p = (t.address || '').split(',').map((s) => s.trim()).filter(Boolean); return p.length > 1 ? p[p.length - 1] : (p[0] || '') }
const cityOf = (t) => { const p = (t.address || '').split(',').map((s) => s.trim()).filter(Boolean); return p.length > 1 ? p.slice(0, -1).join(', ') : '' }
const href = (u) => (/^https?:/i.test(u) ? u : `https://${u}`)

function Truncated({ text }) {
  if (!text) return <span className="text-slate-300">—</span>
  return <span className="line-clamp-2 max-w-[16rem] text-slate-600" title={text}>{text}</span>
}

// Centered pop-up showing the full partner profile.
function DetailModal({ partner, onClose, onDelete, onSaveComments }) {
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setComment(partner?.comments || '') }, [partner?.id])
  useEffect(() => {
    if (!partner) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [partner, onClose])

  async function saveComment() {
    setSaving(true)
    try { await onSaveComments(partner, comment) } catch { /* toast shown by caller */ } finally { setSaving(false) }
  }

  if (!partner) return null
  const t = partner
  const vendor = isVendor(t)
  const HeadIcon = vendor ? Handshake : Building2
  const contact = [
    { icon: User, label: 'Point of contact', value: t.name, sub: t.designation },
    { icon: Mail, label: 'Email', value: t.email, kind: 'email' },
    { icon: Phone, label: 'Phone', value: t.phone },
    { icon: Globe, label: 'Website / LinkedIn', value: t.linkedin, kind: 'link' },
    { icon: MapPin, label: 'Location', value: t.address },
  ].filter((c) => c.value)
  const details = Object.entries(t.details || {}).filter(([, v]) => v)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button aria-label="Close" className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl menu-in">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-brand-600 to-fuchsia-600 px-6 py-5 text-white">
          <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"><X className="h-5 w-5" /></button>
          <div className="flex items-start gap-3.5 pr-8">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/25"><HeadIcon className="h-6 w-6" /></div>
            <div className="min-w-0">
              <span className="inline-block rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">{catLabel(t)}</span>
              <h2 className="mt-1 text-xl font-bold leading-tight">{t.college || t.name}</h2>
              {t.address && <p className="mt-0.5 text-sm text-white/80">{t.address}</p>}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <section>
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Contact</h3>
            <div className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
              {contact.map((c) => {
                const CIcon = c.icon
                return (
                  <div key={c.label} className="flex items-start gap-2.5">
                    <CIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-slate-400">{c.label}</div>
                      <div className="text-sm text-slate-700 break-words">
                        {c.kind === 'link'
                          ? <a href={href(c.value)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline break-all">{c.value}</a>
                          : c.kind === 'email'
                            ? <a href={`mailto:${c.value}`} className="text-brand-600 hover:underline break-all">{c.value}</a>
                            : c.value}
                        {c.sub && <span className="text-slate-400"> · {c.sub}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {details.length > 0 && (
            <section>
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{vendor ? 'Recruitment details' : 'Placement details'}</h3>
              <div className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                {details.map(([k, v]) => (
                  <div key={k} className={String(v).length > 60 ? 'sm:col-span-2' : ''}>
                    <div className="text-[11px] font-medium text-slate-400">{k}</div>
                    <div className="text-sm text-slate-700 break-words">
                      {/^https?:/i.test(v)
                        ? <a href={v} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline"><ExternalLink className="h-3 w-3" /> Open link</a>
                        : String(v)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {t.notes && (
            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Partner's note (from form)</h3>
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{t.notes}</p>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Internal comments</h3>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a private comment about this partner (only your team sees this)…"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={saveComment}
                disabled={saving || comment === (t.comments || '')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? <Spinner /> : <Check className="h-3.5 w-3.5" />} {saving ? 'Saving…' : 'Save comment'}
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-3">
          <button onClick={() => onDelete(t)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-rose-200 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
          <button onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">Close</button>
        </div>
      </div>
    </div>
  )
}

export default function Partners() {
  usePageTitle('Vendors & Colleges')
  const { toast } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState(null)
  const [copied, setCopied] = useState(false)

  const formUrl = typeof window !== 'undefined' ? `${window.location.origin}/partner-intake` : '/partner-intake'

  const load = () => api.listTpos().then(setRows).catch(() => setRows([])).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  async function handleImport(file) {
    if (!file) return
    setImporting(true)
    try {
      const res = await api.importTpos(file)
      toast(`Imported ${res.created} · ${res.skipped} skipped`)
      await load()
    } catch (e) { toast(e.message, 'error') } finally { setImporting(false) }
  }

  async function del(t) {
    if (!window.confirm(`Delete ${t.college || t.name}?`)) return
    try { await api.deleteTpo(t.id); setSelected(null); await load() } catch (e) { toast(e.message, 'error') }
  }

  async function saveComments(t, comment) {
    try {
      const updated = await api.updateTpo(t.id, { comments: comment })
      setRows((rs) => rs.map((r) => (r.id === t.id ? updated : r)))
      setSelected(updated)
      toast('Comment saved')
    } catch (e) { toast(e.message, 'error'); throw e }
  }

  function copyLink() {
    navigator.clipboard?.writeText(formUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })
    toast('Public form link copied')
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((t) => [t.college, t.name, t.email, t.designation, t.address, JSON.stringify(t.details || {})]
      .join(' ').toLowerCase().includes(q))
  }, [rows, search])

  const columns = useMemo(() => [
    { key: 'sno', label: '#', sortable: false, filter: false, className: 'w-12 text-slate-400 tabular-nums', render: (_r, i) => i + 1 },
    { key: 'kind', label: 'Category', sortValue: catLabel, filterValue: catLabel, render: (t) => <Badge tone={isVendor(t) ? 'violet' : 'green'}>{catLabel(t)}</Badge> },
    { key: 'college', label: 'Organization', filter: false, className: 'min-w-[18rem]', sortValue: (t) => (t.college || '').toLowerCase(),
      render: (t) => (
        <div className="max-w-[22rem]">
          <div className="font-medium text-slate-800" title={t.college}>{t.college || t.name || '—'}</div>
          {t.linkedin && <a href={href(t.linkedin)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline"><ExternalLink className="h-3 w-3" /> Website</a>}
        </div>
      ) },
    { key: 'name', label: 'Contact', filter: false, sortValue: (t) => (t.name || '').toLowerCase(),
      render: (t) => (<div><div className="text-slate-700">{t.name || '—'}</div>{t.designation && <div className="text-[11px] text-slate-400 line-clamp-1" title={t.designation}>{t.designation}</div>}</div>) },
    { key: 'email', label: 'Email', filter: false, render: (t) => <span className="text-slate-600">{t.email || '—'}</span> },
    { key: 'phone', label: 'Phone', sortable: false, filter: false, render: (t) => <span className="whitespace-nowrap text-slate-600">{t.phone || '—'}</span> },
    { key: 'city', label: 'City', filter: false, sortValue: cityOf, render: (t) => <span className="text-slate-600">{cityOf(t) || '—'}</span> },
    { key: 'country', label: 'Country', sortValue: countryOf, filterValue: countryOf, render: (t) => <span className="text-slate-600">{countryOf(t) || '—'}</span> },
    { key: 'industries', label: 'Industries / Disciplines', sortable: false, filter: false, render: (t) => <Truncated text={t.details?.['Industries / Disciplines']} /> },
    { key: 'hiring', label: 'Hiring / Engagement', sortable: false, filter: false, render: (t) => <Truncated text={t.details?.['Hiring / Engagement Types']} /> },
    { key: 'act', label: '', sortable: false, filter: false, render: (t) => (
      <button onClick={(e) => { e.stopPropagation(); del(t) }} title="Delete" className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
    ) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Vendors & Colleges"
        subtitle="Hiring vendors (recruitment agencies) and campus placement cells — one directory, sort & filter any column."
        actions={(
          <>
            <Button variant="ghost" className="text-xs" onClick={() => api.downloadTpoTemplate().catch((e) => toast(e.message, 'error'))}>
              <FileDown className="h-4 w-4" /> Template
            </Button>
            <label className={cx('inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100', importing && 'pointer-events-none opacity-60')} title="Import from Excel/CSV">
              {importing ? <Spinner /> : <Upload className="h-4 w-4" />} Import
              <input type="file" accept=".xlsx,.csv" className="hidden" disabled={importing}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleImport(f) }} />
            </label>
          </>
        )}
      />

      {/* Public form link — share this so vendors/colleges self-register */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3">
        <Link2 className="h-4 w-4 shrink-0 text-brand-600" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-700">Public sign-up form</div>
          <a href={formUrl} target="_blank" rel="noreferrer" className="truncate text-xs text-brand-700 hover:underline">{formUrl}</a>
        </div>
        <button onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy link'}
        </button>
        <a href={formUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </a>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className={cx(inputClass, 'pl-9')} placeholder="Search partners…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Handshake} title="No partners yet" description="Share the public form above, or import a spreadsheet." />
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          filterable
          compact
          pageSize={25}
          defaultSort={{ key: 'college', dir: 'asc' }}
          onRowClick={(t) => setSelected(t)}
          emptyMessage="No partners match."
        />
      )}

      <DetailModal partner={selected} onClose={() => setSelected(null)} onDelete={del} onSaveComments={saveComments} />
    </div>
  )
}
