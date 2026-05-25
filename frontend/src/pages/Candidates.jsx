import { useEffect, useMemo, useState } from 'react'
import { Search, Users, RefreshCw } from 'lucide-react'
import { api } from '../api'
import { Spinner, PageHeader, EmptyState, inputClass, Button } from '../ui'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'
import CandidateProfileModal from '../components/CandidateProfileModal'
import TalentPoolTable from '../components/talent/TalentPoolTable'

function StatChip({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
      <div className="text-xl font-bold tabular-nums text-slate-900">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  )
}

export default function Candidates() {
  usePageTitle('Talent Pool')
  const { toast } = useToast()
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [roles, setRoles] = useState([])
  const [openId, setOpenId] = useState(null)

  const load = (q = search) => api.listCandidatesTable(q).then(setRows).catch(() => []).finally(() => setLoading(false))

  useEffect(() => {
    const t = setTimeout(() => load(search), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { api.listRoles().then(setRoles).catch(() => []) }, [])

  async function syncFromResumes() {
    setSyncing(true)
    try {
      const res = await api.reparseAllCandidates()
      toast(`Updated ${res.updated} candidates from resumes`)
      await load(search)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSyncing(false)
    }
  }

  const stats = useMemo(() => {
    const withActive = rows.filter((r) => r.active_applications > 0).length
    const scored = rows.filter((r) => r.top_score > 0)
    const avg = scored.length ? Math.round(scored.reduce((s, r) => s + r.top_score, 0) / scored.length) : 0
    return { total: rows.length, withActive, avg }
  }, [rows])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Talent Pool"
        subtitle="Columns are filled from each candidate's resume — role, education, compensation, location, and more."
        actions={(
          <Button variant="ghost" className="text-xs" onClick={syncFromResumes} disabled={syncing || loading}>
            {syncing ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
            Sync from resumes
          </Button>
        )}
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-wrap gap-3">
          <StatChip label="Candidates" value={stats.total} />
          <StatChip label="In active pipeline" value={stats.withActive} />
          <StatChip label="Avg top score" value={stats.avg || '—'} />
        </div>
        <div className="relative min-w-[280px] flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputClass} pl-9`}
            placeholder="Search name, email, skills, company, location…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setLoading(true) }}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex gap-2 text-slate-500"><Spinner /> Loading talent pool…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title="No candidates yet" description="Candidates appear here when you add resumes to any job." />
      ) : (
        <TalentPoolTable
          rows={rows}
          onRowClick={(r) => setOpenId(r.id)}
          onEdit={(r) => setOpenId(r.id)}
        />
      )}

      <CandidateProfileModal
        candidateId={openId}
        open={!!openId}
        onClose={() => setOpenId(null)}
        roles={roles}
        onApplied={() => load()}
      />
    </div>
  )
}
