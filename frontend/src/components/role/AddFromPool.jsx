import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '../../api'
import { Card, Button, Spinner, inputClass } from '../../ui'
import { useToast } from '../Toast'
import TalentPoolTable from '../talent/TalentPoolTable'

export default function AddFromPool({ roleId, onAdded, onCancel }) {
  const { toast } = useToast()
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => {
      api.listCandidatesTable(search).then(setRows).catch(() => setRows([])).finally(() => setLoading(false))
    }, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search])

  const toggle = (id) => setSelected((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const toggleAll = (ids) => setSelected((s) => {
    const n = new Set(s)
    const all = ids.length > 0 && ids.every((i) => n.has(i))
    ids.forEach((i) => (all ? n.delete(i) : n.add(i)))
    return n
  })

  async function apply() {
    if (!selected.size) return
    setBusy(true)
    try {
      const ids = [...selected]
      const results = await Promise.allSettled(ids.map((id) => api.applyCandidate(id, roleId)))
      const ok = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.length - ok
      if (failed) toast(`Added ${ok} of ${ids.length} — ${failed} failed`, 'error')
      else toast(`Added ${ok} candidate${ok !== 1 ? 's' : ''} to this job`)
      setSelected(new Set())
      onAdded()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Add from talent pool</h3>
        <div className="flex items-center gap-2">
          <Button disabled={!selected.size || busy} onClick={apply}>
            {busy ? <><Spinner /> Adding…</> : `Add${selected.size ? ` ${selected.size}` : ''} to this job`}
          </Button>
          <Button variant="ghost" className="text-xs" onClick={onCancel}>Cancel</Button>
        </div>
      </div>

      <div className="relative mb-3 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className={`${inputClass} pl-9`}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setLoading(true) }}
          placeholder="Name, email, skills…"
        />
      </div>

      {loading ? (
        <div className="flex gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No candidates found.</p>
      ) : (
        <TalentPoolTable
          rows={rows}
          selectable
          selectedIds={selected}
          onToggleSelect={toggle}
          onToggleAll={toggleAll}
        />
      )}
    </Card>
  )
}
