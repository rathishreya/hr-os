import { useEffect, useState } from 'react'
import { FileSignature, Check, Copy, AlertTriangle } from 'lucide-react'
import { api } from '../../api'
import { Badge, Button, Spinner, cx, inputClass } from '../../ui'
import { useToast } from '../Toast'

// The documents on offer come from the server registry rather than a hardcoded list, so this
// panel can never drift from the templates that actually exist (it used to name four keys, two
// of which stopped resolving when the templates were re-keyed).
const TERM_FIELDS = [
  { key: 'ctc', label: 'Compensation / CTC', ph: 'e.g. 26 LPA' },
  { key: 'joining_date', label: 'Joining date', ph: 'e.g. 2026-07-01', type: 'date' },
  { key: 'manager', label: 'Reporting manager', ph: 'e.g. Engineering Manager' },
  { key: 'notice_period', label: 'Notice period', ph: 'e.g. 30 days' },
  { key: 'probation', label: 'Probation', ph: 'e.g. 6 months' },
]

export default function OfferPanel({ app }) {
  const { toast } = useToast()
  const [templates, setTemplates] = useState([])
  const [docType, setDocType] = useState('')
  const [terms, setTerms] = useState({})
  const [docs, setDocs] = useState([])
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => api.listDocuments(app.id).then((list) => {
    setDocs(list)
    if (list.length && !selected) setSelected(list[0])
  }).catch(() => {})
  useEffect(() => { load() }, [app.id])
  useEffect(() => {
    api.listDocumentTemplates()
      .then((list) => {
        setTemplates(list)
        setDocType((cur) => (list.some((t) => t.key === cur) ? cur : list[0]?.key || ''))
      })
      .catch(() => setTemplates([]))
  }, [])

  async function generate() {
    setBusy(true)
    try {
      const doc = await api.generateDocument({ application_id: app.id, doc_type: docType, template_key: docType, terms })
      setSelected(doc)
      setDocs((d) => [doc, ...d])
      toast('Draft generated')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  async function approve() {
    if (!selected) return
    setBusy(true)
    try {
      const updated = await api.approveDocument(selected.id, 'recruiter')
      setSelected(updated)
      setDocs((d) => d.map((x) => (x.id === updated.id ? updated : x)))
      toast('Document approved')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  async function copy() {
    if (!selected) return
    await navigator.clipboard.writeText(selected.content || '')
    toast('Copied to clipboard')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        AI draft — review with a qualified professional before issuing. Not legal advice. No document is sent automatically.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={`${inputClass} sm:w-64`}
          value={docType}
          disabled={!templates.length}
          onChange={(e) => setDocType(e.target.value)}
        >
          {templates.length
            ? templates.map((t) => <option key={t.key} value={t.key}>{t.entity} — {t.label}</option>)
            : <option value="">— no templates configured —</option>}
        </select>
        <Button onClick={generate} disabled={busy || !docType}>
          {busy ? <Spinner /> : <FileSignature className="h-4 w-4" />} Generate draft
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TERM_FIELDS.map((f) => (
          <label key={f.key} className="text-xs">
            <span className="mb-1 block text-slate-500">{f.label}</span>
            <input
              type={f.type || 'text'}
              className={inputClass}
              value={terms[f.key] || ''}
              placeholder={f.ph}
              onChange={(e) => setTerms((t) => ({ ...t, [f.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>

      {docs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {docs.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelected(d)}
              className={cx(
                'rounded-lg border px-2.5 py-1 text-xs transition duration-150 ease-snappy active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
                selected?.id === d.id ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
              )}
            >
              {d.doc_type.replace(/_/g, ' ')} <Badge tone={d.status === 'approved' ? 'green' : 'amber'} className="ml-1">{d.status}</Badge>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">{selected.title}</span>
            <div className="flex gap-2">
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={copy}><Copy className="h-3 w-3" /> Copy</Button>
              {selected.status !== 'approved' ? (
                <Button className="px-2 py-1 text-xs" onClick={approve} disabled={busy}><Check className="h-3 w-3" /> Approve</Button>
              ) : (
                <Badge tone="green">Approved by {selected.approved_by}</Badge>
              )}
            </div>
          </div>
          <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">{selected.content}</pre>
        </div>
      )}
    </div>
  )
}
