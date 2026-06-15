import { useEffect, useState } from 'react'
import { Search, Users, RefreshCw, Sparkles } from 'lucide-react'
import { api } from '../api'
import { Spinner, PageHeader, EmptyState, inputClass, Button } from '../ui'
import { useToast } from '../components/Toast'
import { useAuth } from '../contexts/auth'
import { usePageTitle } from '../hooks/usePageTitle'
import CandidateProfileModal from '../components/CandidateProfileModal'
import TalentPoolTable from '../components/talent/TalentPoolTable'

export default function Candidates() {
  usePageTitle('Talent Pool')
  const { toast } = useToast()
  const { hasRole } = useAuth()
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [rescoring, setRescoring] = useState(false)
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

  async function rescoreAll() {
    setRescoring(true)
    try {
      const res = await api.rescoreAll()
      toast(`Re-scored ${res.rescored} application${res.rescored === 1 ? '' : 's'} with the latest matcher${res.failed ? ` · ${res.failed} failed` : ''}`)
      await load(search)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setRescoring(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Talent Pool"
        subtitle="Columns are filled from each candidate's resume — role, education, compensation, location, and more."
        actions={(
          <>
            {hasRole('admin', 'manager') && (
              <Button variant="ghost" className="text-xs" onClick={rescoreAll} disabled={rescoring || loading} title="Re-score every application with the latest skill matcher">
                {rescoring ? <Spinner /> : <Sparkles className="h-4 w-4" />}
                Re-score all
              </Button>
            )}
            {hasRole('admin', 'manager') && (
              <Button variant="ghost" className="text-xs" onClick={syncFromResumes} disabled={syncing || loading}>
                {syncing ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
                Sync from resumes
              </Button>
            )}
          </>
        )}
      />

      <div className="flex flex-wrap items-end gap-4">
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
