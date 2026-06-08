import { useEffect, useMemo, useState } from 'react'
import { Search, Download, UserPlus, ChevronDown, ChevronUp, CalendarPlus, Check } from 'lucide-react'
import { Badge, Button, Modal, Spinner, inputClass, scoreTone, cx } from '../../ui'
import { DataTable, LiveDot } from '../DataTable'
import { exportPipelineCsv } from '../../utils/exportCsv'
import { useToast } from '../Toast'
import { api } from '../../api'
import { INTERVIEW_TYPES } from '../../constants'
import AddCandidate from './AddCandidate'
import AddFromPool from './AddFromPool'
import CandidateManageDrawer from './CandidateManageDrawer'
import PipelineStats from './PipelineStats'

const STAGES = ['applied', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected']

// Bulk-apply a set of interview rounds to many selected candidates at once (F8).
// Mounted only while open (see call site), so state initializes from props without an effect.
function BulkRoundsModal({ onClose, applicationIds, defaultTypes, onDone }) {
  const { toast } = useToast()
  const [types, setTypes] = useState(defaultTypes || [])
  const [duration, setDuration] = useState(60)
  const [busy, setBusy] = useState(false)

  const toggle = (v) => setTypes((t) => (t.includes(v) ? t.filter((x) => x !== v) : [...t, v]))

  async function apply() {
    if (!types.length) { toast('Pick at least one round', 'error'); return }
    setBusy(true)
    try {
      const r = await api.bulkInterviewRounds({
        application_ids: applicationIds,
        interview_types: types,
        duration_minutes: Number(duration),
      })
      toast(`Added ${r.created} round${r.created !== 1 ? 's' : ''} across ${r.applications} candidate${r.applications !== 1 ? 's' : ''}${r.skipped ? ` · ${r.skipped} skipped (already present)` : ''}`)
      onDone()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add interview rounds to ${applicationIds.length} candidate${applicationIds.length !== 1 ? 's' : ''}`}
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={apply} disabled={busy}>{busy ? <Spinner /> : 'Add rounds'}</Button></>}
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Rounds to add</p>
          <div className="flex flex-wrap gap-1.5">
            {INTERVIEW_TYPES.map((t) => {
              const on = types.includes(t.value)
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => toggle(t.value)}
                  aria-pressed={on}
                  className={cx(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition duration-150 ease-snappy active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
                    on ? 'border-brand-300 bg-brand-100 text-brand-800' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300',
                  )}
                >
                  <span className={cx('flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border', on ? 'border-current' : 'border-slate-300')}>
                    {on && <Check className="h-2.5 w-2.5" />}
                  </span>
                  {t.label}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">A round a candidate already has is skipped, so this is safe to re-run.</p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Default duration</span>
          <select className={`${inputClass} w-40`} value={duration} onChange={(e) => setDuration(e.target.value)}>
            {[30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}
          </select>
        </label>
      </div>
    </Modal>
  )
}
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
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [roleTypes, setRoleTypes] = useState([])

  const largeList = (board?.length || 0) >= 20

  useEffect(() => {
    if (initialStageFilter) setStageFilter(initialStageFilter)
  }, [initialStageFilter])

  // The role's planned interview types (set at job creation) seed the bulk dialog.
  useEffect(() => {
    if (!roleId) return
    api.getRole(roleId).then((r) => setRoleTypes(r.interview_types || [])).catch(() => {})
  }, [roleId])

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

  const toggleRow = (id) => setSelectedIds((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id))
  const toggleAll = () => setSelectedIds((s) => {
    const n = new Set(s)
    if (filtered.every((r) => n.has(r.id))) filtered.forEach((r) => n.delete(r.id))
    else filtered.forEach((r) => n.add(r.id))
    return n
  })

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
      key: 'select',
      label: (
        <input
          type="checkbox"
          aria-label="Select all"
          checked={allFilteredSelected}
          onChange={toggleAll}
          onClick={(e) => e.stopPropagation()}
          className="cursor-pointer"
        />
      ),
      className: 'w-8',
      sortable: false,
      filter: false,
      render: (row) => (
        <input
          type="checkbox"
          aria-label="Select candidate"
          checked={selectedIds.has(row.id)}
          onChange={() => toggleRow(row.id)}
          onClick={(e) => e.stopPropagation()}
          className="cursor-pointer"
        />
      ),
    },
    {
      key: '_num',
      label: '#',
      className: 'w-10 text-slate-400',
      sortable: false,
      filter: false,
      render: (_row, index) => <span className="tabular-nums text-slate-400">{index + 1}</span>,
    },
    {
      key: 'live',
      label: '',
      className: 'w-6',
      sortable: false,
      filter: false,
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
          <span className={`block max-w-[160px] truncate text-xs ${m.is_live ? 'font-medium text-brand-700' : 'text-slate-600'}`} title={m.activity}>
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
      key: 'suggested',
      label: 'Suggested role',
      sortable: false,
      filterValue: (row) => row.suggested_role?.position || '',
      render: (row) => {
        const s = row.suggested_role
        if (!s) return <span className="text-xs text-slate-400">—</span>
        return (
          <span className="block max-w-[170px] truncate text-xs text-slate-600" title={`Better fit: ${s.position}${s.score != null ? ` · ${s.score}% match` : ''}`}>
            ↪ {s.position}{s.score != null ? <span className="text-slate-400"> · {s.score}%</span> : null}
          </span>
        )
      },
    },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      sortable: false,
      filter: false,
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
        <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm text-brand-800">
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

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
          <span className="font-medium text-brand-800">{selectedIds.size} selected</span>
          <Button className="text-xs" onClick={() => setBulkOpen(true)}><CalendarPlus className="h-4 w-4" /> Add interview rounds</Button>
          <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-500 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">Clear selection</button>
        </div>
      )}

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
          filterable
          maxHeight="calc(100vh - 280px)"
          defaultPageSize={50}
          pageSizes={[25, 50, 100, 200]}
          defaultSort={{ key: 'score_overall', dir: 'desc' }}
          emptyMessage="No candidates match your filters."
          onRowClick={(row) => { setSelected(row); setDrawerOpen(true) }}
        />
      )}

      {bulkOpen && (
        <BulkRoundsModal
          onClose={() => setBulkOpen(false)}
          applicationIds={[...selectedIds]}
          defaultTypes={roleTypes}
          onDone={() => { setBulkOpen(false); setSelectedIds(new Set()); onRefresh() }}
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
