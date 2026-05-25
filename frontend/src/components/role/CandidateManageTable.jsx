import { useEffect, useMemo, useState } from 'react'
import { Search, Download, UserPlus, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge, Button, inputClass, stageTone, scoreTone } from '../../ui'
import { DataTable, LiveDot } from '../DataTable'
import { exportPipelineCsv } from '../../utils/exportCsv'
import { useToast } from '../Toast'
import { api } from '../../api'
import AddCandidate from './AddCandidate'
import AddFromPool from './AddFromPool'
import CandidateManageDrawer from './CandidateManageDrawer'
import PipelineStats from './PipelineStats'

const STAGES = ['applied', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected']
const STAGE_GROUPS = {
  application: ['applied', 'screening'],
}
const STAGE_LABELS = {
  applied: 'Applied', screening: 'Screening', shortlisted: 'Shortlisted',
  interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Rejected',
}

export default function CandidateManageTable({ roleId, roleTitle, board, onRefresh, loading, initialStageFilter }) {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState(initialStageFilter || 'all')
  const [minScore, setMinScore] = useState(0)
  const [selected, setSelected] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showPool, setShowPool] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [movingId, setMovingId] = useState(null)

  const largeList = (board?.length || 0) >= 20

  useEffect(() => {
    if (initialStageFilter) setStageFilter(initialStageFilter)
  }, [initialStageFilter])

  useEffect(() => {
    if (selected && board) {
      const updated = board.find((r) => r.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [board, selected?.id])

  const filtered = useMemo(() => {
    let list = [...(board || [])]
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((row) => {
        const c = row.candidate || {}
        return [c.name, c.email, ...(c.parsed?.skills || [])].join(' ').toLowerCase().includes(q)
      })
    }
    if (stageFilter !== 'all') {
      const group = STAGE_GROUPS[stageFilter]
      list = group
        ? list.filter((r) => group.includes(r.stage))
        : list.filter((r) => r.stage === stageFilter)
    }
    if (minScore > 0) list = list.filter((r) => (r.score_overall || 0) >= minScore)
    return list
  }, [board, search, stageFilter, minScore])

  async function changeStage(row, stage, e) {
    e?.stopPropagation()
    if (stage === row.stage) return
    setMovingId(row.id)
    try {
      await api.moveStage(row.id, stage)
      await onRefresh()
      toast(`Moved ${row.candidate?.name || 'candidate'} to ${stage}`)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setMovingId(null)
    }
  }

  const columns = [
    {
      key: '_num',
      label: '#',
      className: 'w-10 text-slate-400',
      sortable: false,
      render: (_row, index) => <span className="tabular-nums text-slate-400">{index + 1}</span>,
    },
    {
      key: 'live',
      label: '',
      className: 'w-6',
      sortable: false,
      render: (row) => {
        const m = row.meta || {}
        const tone = m.is_live ? 'violet' : row.stage === 'hired' ? 'green' : row.stage === 'rejected' ? 'rose' : 'amber'
        return <LiveDot live={m.is_live} tone={tone} />
      },
    },
    {
      key: 'name',
      label: 'Candidate',
      sortValue: (row) => (row.candidate?.name || '').toLowerCase(),
      render: (row) => {
        const c = row.candidate || {}
        return (
          <div className="min-w-[140px]">
            <div className="font-medium text-slate-900">{c.name || 'Unnamed'}</div>
            <div className="text-xs text-slate-400">{c.email || '—'}</div>
          </div>
        )
      },
    },
    {
      key: 'score_overall',
      label: 'Score',
      sortValue: (row) => row.score_overall || 0,
      render: (row) => (
        <Badge tone={scoreTone(row.score_overall)}>{Math.round(row.score_overall || 0)}</Badge>
      ),
    },
    {
      key: 'stage',
      label: 'Stage',
      sortValue: (row) => row.stage,
      render: (row) => (
        <select
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          value={row.stage}
          disabled={movingId === row.id}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => changeStage(row, e.target.value, e)}
        >
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
      ),
    },
    {
      key: 'activity',
      label: 'Status',
      sortValue: (row) => row.meta?.activity || '',
      render: (row) => {
        const m = row.meta || {}
        return (
          <span className={`block max-w-[160px] truncate text-xs ${m.is_live ? 'font-medium text-violet-700' : 'text-slate-600'}`} title={m.activity}>
            {m.activity || '—'}
          </span>
        )
      },
    },
    {
      key: 'screening',
      label: 'Interview',
      sortValue: (row) => row.meta?.screening_status || '',
      render: (row) => {
        const m = row.meta || {}
        if (m.screening_status === 'none') return <span className="text-xs text-slate-400">—</span>
        if (m.screening_status === 'in_progress') return <Badge tone="violet">Live</Badge>
        return (
          <span className="text-xs text-slate-700">
            {m.screening_score != null ? m.screening_score : 'Done'}
          </span>
        )
      },
    },
    {
      key: 'comms',
      label: 'Email',
      sortValue: (row) => row.meta?.email_count || 0,
      render: (row) => {
        const m = row.meta || {}
        return m.email_count ? <span className="text-xs text-slate-700">{m.email_count}</span> : <span className="text-xs text-slate-400">—</span>
      },
    },
    {
      key: 'notes',
      label: 'Comments',
      sortable: false,
      render: (row) => {
        const text = row.notes || ''
        if (!text) return <span className="text-xs text-slate-400">—</span>
        return <span className="block max-w-[120px] truncate text-xs text-slate-600" title={text}>{text}</span>
      },
    },
    {
      key: 'recommendation',
      label: 'AI',
      sortValue: (row) => row.recommendation || '',
      render: (row) => (
        <Badge tone={{ strong_yes: 'green', yes: 'green', maybe: 'amber', no: 'rose' }[row.recommendation] || 'gray'}>
          {(row.recommendation || '—').replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      sortable: false,
      render: (row) => (
        <Button
          variant="ghost"
          className="px-2 py-1 text-xs"
          onClick={(e) => { e.stopPropagation(); setSelected(row); setDrawerOpen(true) }}
        >
          Open
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      {board?.some((r) => r.meta?.is_live) && (
        <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-800">
          <LiveDot live tone="violet" />
          Live interviews running — auto-refresh every 15s
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {board?.length || 0} candidates
          </h3>
          <p className="text-xs text-slate-500">Sort columns · change stage inline · click row for full details</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" className="text-xs" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Add candidate
          </Button>
          <Button variant="ghost" className="text-xs" onClick={() => setShowPool(!showPool)}>
            <UserPlus className="h-4 w-4" /> Pool
          </Button>
          {filtered.length > 0 && (
            <Button variant="ghost" className="text-xs" onClick={() => { exportPipelineCsv(filtered, roleTitle); toast('Exported all filtered rows') }}>
              <Download className="h-4 w-4" /> Export {filtered.length}
            </Button>
          )}
        </div>
      </div>

      {showAdd && <AddCandidate roleId={roleId} onAdded={() => { onRefresh(); setShowAdd(false) }} />}
      {showPool && <AddFromPool roleId={roleId} onAdded={() => { setShowPool(false); onRefresh() }} onCancel={() => setShowPool(false)} />}

      {!largeList && board?.length > 0 && <PipelineStats apps={board} />}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={`${inputClass} pl-9`} placeholder={`Search ${board?.length || 0} candidates…`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className={`${inputClass} sm:w-36`} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="all">All stages ({board?.length || 0})</option>
          <option value="application">
            Application ({(board || []).filter((r) => STAGE_GROUPS.application.includes(r.stage)).length})
          </option>
          {STAGES.map((s) => {
            const n = (board || []).filter((r) => r.stage === s).length
            return <option key={s} value={s}>{STAGE_LABELS[s]} ({n})</option>
          })}
        </select>
        <select className={`${inputClass} sm:w-28`} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>
          <option value={0}>Any score</option>
          <option value={50}>50+</option>
          <option value={65}>65+</option>
          <option value={80}>80+</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading {board?.length ? '…' : 'pipeline…'}</p>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(r) => r.id}
          compact
          stickyHeader
          maxHeight="calc(100vh - 280px)"
          defaultPageSize={50}
          pageSizes={[25, 50, 100, 200]}
          defaultSort={{ key: 'score_overall', dir: 'desc' }}
          emptyMessage="No candidates match your filters."
          onRowClick={(row) => { setSelected(row); setDrawerOpen(true) }}
        />
      )}

      <CandidateManageDrawer
        app={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onRefresh={onRefresh}
      />
    </div>
  )
}
