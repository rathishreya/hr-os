import { useEffect, useState } from 'react'
import { api } from '../../api'
import { Card, Button, Field, Spinner, inputClass } from '../../ui'
import { useToast } from '../Toast'

export default function AddFromPool({ roleId, onAdded, onCancel }) {
  const { toast } = useToast()
  const [candidates, setCandidates] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => {
      api.listCandidates(search).then(setCandidates).catch(() => []).finally(() => setLoading(false))
    }, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search])

  async function apply() {
    if (!selected) return
    setBusy(true)
    try {
      await api.applyCandidate(selected, roleId)
      toast('Candidate added to this role')
      onAdded()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Add from talent pool</h3>
        <Button variant="ghost" className="text-xs" onClick={onCancel}>Cancel</Button>
      </div>
      <Field label="Search existing candidates">
        <input className={inputClass} value={search} onChange={(e) => { setSearch(e.target.value); setLoading(true) }} placeholder="Name, email, skills…" />
      </Field>
      {loading ? (
        <div className="mt-3 flex gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>
      ) : (
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
          {candidates.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelected(c.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${selected === c.id ? 'bg-violet-50 text-violet-800 ring-1 ring-violet-200' : 'hover:bg-slate-50'}`}
              >
                <span className="font-medium">{c.name || 'Unnamed'}</span>
                <span className="ml-2 text-xs text-slate-400">{c.email || 'no email'}</span>
              </button>
            </li>
          ))}
          {candidates.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No candidates found.</li>}
        </ul>
      )}
      <Button className="mt-3" disabled={!selected || busy} onClick={apply}>
        {busy ? <><Spinner /> Adding…</> : 'Add to this job'}
      </Button>
    </Card>
  )
}
