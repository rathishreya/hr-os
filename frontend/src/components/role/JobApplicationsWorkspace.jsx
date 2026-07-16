import { useEffect, useMemo, useState } from 'react'
import {
  Search, Download, RefreshCw, Columns3, LayoutGrid, LayoutList,
  UserPlus, Star, Pencil, X, ClipboardList, CalendarPlus, Check, Mail, FileDown,
} from 'lucide-react'
import { Badge, Button, Modal, scoreTone, stageTone, cx, Spinner } from '../../ui'
import { formatComp } from '../../utils/exportCsv'
import { INTERVIEW_TYPES } from '../../constants'
import { useJobAppColumns } from '../../hooks/useJobAppColumns'
import JobColumnSettings from './JobColumnSettings'
import CandidateManageDrawer from './CandidateManageDrawer'
import SendAssessmentModal from './SendAssessmentModal'
import BulkEmailModal from './BulkEmailModal'
import AddCandidate from './AddCandidate'
import AddFromPool from './AddFromPool'
import PipelineStats from './PipelineStats'
import FunnelChart from '../FunnelChart'
import { exportPipelineCsv } from '../../utils/exportCsv'
import { useColumnFilters, ColumnFilter, distinctValues } from '../tableFilters'
import { useToast } from '../Toast'
import { api } from '../../api'

const STAGES = ['applied', 'shortlisted', 'interview', 'offer', 'hired', 'rejected']
const STAGE_LABELS = {
  applied: 'Applied', screening: 'Screening', shortlisted: 'Shortlisted',
  interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Rejected',
}

function TwoLine({ primary, secondary }) {
  if (!primary && !secondary) return <span className="text-slate-300/80">—</span>
  return (
    <div className="min-w-0 max-w-[220px]">
      {primary && <div className="truncate text-sm font-medium text-slate-800">{primary}</div>}
      {secondary && <div className="truncate text-xs text-slate-500">{secondary}</div>}
    </div>
  )
}

function StarRating({ score }) {
  const value = Math.min(5, Math.max(0, (score || 0) / 20))
  const full = Math.floor(value)
  return (
    <div className="inline-flex items-center gap-0.5" title={`${value.toFixed(1)} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cx('h-3.5 w-3.5', i <= full ? 'fill-amber-400 text-amber-400' : 'text-slate-200')} />
      ))}
      <span className="ml-1 text-xs font-medium tabular-nums text-slate-600">{value.toFixed(1)}</span>
    </div>
  )
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Date + time for the "Status changed" column, so moving a candidate (e.g. shortlisted → hired)
// visibly updates even when it happens the same day. Includes the local tz abbreviation so the
// moment is unambiguous. Falls back to a dash when no timestamp is set.
function formatDateTime(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString(undefined, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  })
}

// The viewer's local IANA timezone (e.g. "Asia/Kolkata") — surfaced next to scheduling inputs so
// a chosen interview time is never ambiguous about which zone it's in.
const LOCAL_TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { return '' }
})()

// Plain-English AI verdict shown beside the star rating. strong_yes/yes → Yes, maybe → Maybe, no → No.
const AI_VERDICT = {
  strong_yes: { label: 'Yes', tone: 'green' },
  yes: { label: 'Yes', tone: 'green' },
  maybe: { label: 'Maybe', tone: 'amber' },
  no: { label: 'No', tone: 'rose' },
}

// Resolve the final Yes / Maybe / No verdict for a row. Prefer the AI recommendation; for older
// rows scored before the recommendation field existed, derive it from the overall score so the
// verdict always renders alongside the star rating (it was showing "—" otherwise). Unscored rows
// (no score, no recommendation) return null → a neutral dash.
function rowVerdict(row) {
  if (AI_VERDICT[row.recommendation]) return AI_VERDICT[row.recommendation]
  if (!row.scored_at && !(row.score_overall > 0)) return null
  const s = row.score_overall || 0
  if (s >= 65) return AI_VERDICT.yes
  if (s >= 50) return AI_VERDICT.maybe
  return AI_VERDICT.no
}

// Per-row "Download CV": the resume-file endpoint is auth-gated, so fetch it WITH the bearer
// token as a blob (a plain <a href> would 401) and save it. Disabled for text-only candidates
// (no original file on record → the endpoint 404s).
function DownloadCvButton({ candidate }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const fname = candidate?.resume_filename || ''
  const hasFile = !!(fname || candidate?.resume_mime)

  async function download(e) {
    e.stopPropagation()
    if (!candidate?.id || busy) return
    setBusy(true)
    try {
      const blob = await api.fetchResumeFile(candidate.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fname || `${(candidate.name || 'resume').replace(/\s+/g, '_')}`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast('No original CV file on record for this candidate', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!hasFile) return <span className="text-slate-300" title="Added as text — no original file">—</span>
  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      title={`Download ${fname || 'CV'}`}
      className="rounded-md p-1 text-slate-400 transition-colors duration-150 ease-snappy hover:bg-white hover:text-brand-600 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-50"
    >
      {busy ? <Spinner className="h-3.5 w-3.5" /> : <FileDown className="h-3.5 w-3.5" />}
    </button>
  )
}

function profileOf(row) {
  return row.profile || {}
}

// String accessors for per-column faceted filtering (matches what each cell shows). Columns
// without an entry (select, idx, edit) get no filter icon.
const FILTER_ACCESSORS = {
  name: (r) => `${r.candidate?.name || ''} ${r.candidate?.email || ''}`,
  rating: (r) => (Math.min(5, Math.max(0, (r.score_overall || 0) / 20))).toFixed(1),
  status: (r) => STAGE_LABELS[r.stage] || r.stage || '',
  role: (r) => `${profileOf(r).current_title || ''} ${profileOf(r).current_company || ''}`,
  education: (r) => `${profileOf(r).education_degree || ''} ${profileOf(r).education_institution || ''}`,
  comp: (r) => `${profileOf(r).current_ctc || ''} ${profileOf(r).salary_expectation || ''}`,
  exp: (r) => (profileOf(r).total_yoe != null ? String(profileOf(r).total_yoe) : ''),
  location: (r) => profileOf(r).location || '',
  notice: (r) => profileOf(r).notice_period || '',
  source: (r) => r.candidate?.source || '',
  sub_source: (r) => profileOf(r).sub_source || '',
  applied: (r) => formatDate(r.created_at),
  applied_by: (r) => r.applied_by || '',
  changed: (r) => formatDateTime(r.stage_changed_at),
  activity: (r) => r.meta?.activity || '',
  email: (r) => (r.meta?.email_count ? String(r.meta.email_count) : ''),
  last_email: (r) => {
    const m = r.meta || {}
    if (!m.last_email_at) return 'No email'
    return `${(m.last_email_template || 'email').replace(/_/g, ' ')} · ${m.last_email_status || 'sent'}`
  },
  ai: (r) => (rowVerdict(r)?.label || '—'),
  interview: (r) => {
    const m = r.meta || {}
    if (m.interview_rounds_scheduled > 0) return `R${m.interview_next_round || '?'}`
    if (m.screening_status === 'in_progress') return 'Live'
    if (m.screening_status === 'completed') return String(m.screening_score ?? '✓')
    return ''
  },
}

// Create interview rounds for many candidates at once — selected, or ALL in the job.
// Mounted only while open, so state initializes from props without an effect.
function BulkRoundsModal({ onClose, allIds, selectedIds, defaultTypes, onDone }) {
  const { toast } = useToast()
  const hasSel = selectedIds.length > 0
  const [scope, setScope] = useState(hasSel ? 'selected' : 'all')
  const [types, setTypes] = useState(defaultTypes || [])
  const [duration, setDuration] = useState(60)
  const [scheduledAt, setScheduledAt] = useState('')
  const [link, setLink] = useState('')
  const [sendInvite, setSendInvite] = useState(false)
  const [busy, setBusy] = useState(false)
  const ids = scope === 'selected' ? selectedIds : allIds
  const toggle = (v) => setTypes((t) => (t.includes(v) ? t.filter((x) => x !== v) : [...t, v]))

  async function apply() {
    if (!types.length) { toast('Pick at least one round', 'error'); return }
    if (!ids.length) { toast('No candidates to apply to', 'error'); return }
    if (sendInvite && !scheduledAt) { toast('Set a date & time to send invites', 'error'); return }
    setBusy(true)
    try {
      const r = await api.bulkInterviewRounds({
        application_ids: ids, interview_types: types, duration_minutes: Number(duration),
        scheduled_at: scheduledAt, location_or_link: link.trim(), send_invite: sendInvite,
      })
      const invited = sendInvite ? ' · invites emailed' : ''
      toast(`Added ${r.created} round${r.created !== 1 ? 's' : ''} across ${r.applications} candidate${r.applications !== 1 ? 's' : ''}${r.skipped ? ` · ${r.skipped} already existed` : ''}${invited}`)
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
      title="Plan interview rounds"
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={apply} disabled={busy}>{busy ? <Spinner /> : `Add to ${ids.length} candidate${ids.length !== 1 ? 's' : ''}`}</Button></>}
    >
      <div className="space-y-4">
        {hasSel ? (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Apply to</p>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
              <button type="button" onClick={() => setScope('selected')} className={cx('rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-snappy', scope === 'selected' ? 'bg-brand-50 text-brand-800' : 'text-slate-500 hover:text-slate-700')}>Selected ({selectedIds.length})</button>
              <button type="button" onClick={() => setScope('all')} className={cx('rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-snappy', scope === 'all' ? 'bg-brand-50 text-brand-800' : 'text-slate-500 hover:text-slate-700')}>All in this job ({allIds.length})</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600">Applies to <strong>all {allIds.length} candidate{allIds.length !== 1 ? 's' : ''}</strong> in this job.</p>
        )}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Date &amp; time</span>
            <input type="datetime-local" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            <span className="mt-1 block text-[11px] text-slate-400">{LOCAL_TZ ? `Times are in your timezone (${LOCAL_TZ})` : 'Times use your local timezone'}</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Duration</span>
            <select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={duration} onChange={(e) => setDuration(e.target.value)}>
              {[30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Meeting link / location</span>
          <input className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Zoom / Google Meet link, or office room" value={link} onChange={(e) => setLink(e.target.value)} />
        </label>
        <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm text-slate-700">
          <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
          <span>Email each candidate the date, time &amp; meeting link with a calendar invite (.ics). <span className="text-slate-400">Requires a date &amp; time.</span></span>
        </label>
      </div>
    </Modal>
  )
}

export default function JobApplicationsWorkspace({
  roleId,
  roleTitle,
  board,
  loading,
  onRefresh,
  summary,
  workspaceTab = 'applications',
  initialStage = '',
  addModalOpen = false,
  onAddModalClose,
}) {
  const { toast } = useToast()
  const { visible, updateVisible, resetVisible, activeColumns } = useJobAppColumns()

  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState('list')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkStage, setBulkStage] = useState('shortlisted')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkAssessOpen, setBulkAssessOpen] = useState(false)
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false)
  const [movingId, setMovingId] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [roundsOpen, setRoundsOpen] = useState(false)
  const [roleTypes, setRoleTypes] = useState([])
  const [sort, setSort] = useState({ key: 'score', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // The role's planned interview types (set at job creation) seed the bulk dialog.
  useEffect(() => {
    if (roleId) api.getRole(roleId).then((r) => setRoleTypes(r.interview_types || [])).catch(() => {})
  }, [roleId])

  const tabFiltered = useMemo(() => {
    let list = [...(board || [])]
    if (workspaceTab === 'shortlisted') list = list.filter((r) => r.stage === 'shortlisted')
    else if (workspaceTab === 'positions') list = list.filter((r) => ['offer', 'hired'].includes(r.stage))
    // Deep-link from the Jobs-list stage columns (e.g. ?view=applications&stage=interview) narrows
    // the all-applications tab to that one stage.
    else if (initialStage) list = list.filter((r) => r.stage === initialStage)
    return list
  }, [board, workspaceTab, initialStage])

  const filterCtl = useColumnFilters()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tabFiltered
    return tabFiltered.filter((row) => {
      const c = row.candidate || {}
      const p = profileOf(row)
      return [c.name, c.email, p.current_company, p.current_title, p.education_degree, p.location]
        .join(' ').toLowerCase().includes(q)
    })
  }, [tabFiltered, search])

  // Per-column faceted filtering on top of the search.
  const colFiltered = useMemo(
    () => filterCtl.apply(filtered, FILTER_ACCESSORS),
    [filtered, filterCtl.filters], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const distinct = useMemo(
    () => Object.fromEntries(Object.entries(FILTER_ACCESSORS).map(([k, acc]) => [k, distinctValues(tabFiltered, acc)])),
    [tabFiltered],
  )

  const sortFns = {
    name: (r) => (r.candidate?.name || '').toLowerCase(),
    rating: (r) => r.score_overall || 0,
    status: (r) => r.stage,
    role: (r) => `${profileOf(r).current_title} ${profileOf(r).current_company}`.toLowerCase(),
    education: (r) => `${profileOf(r).education_degree} ${profileOf(r).education_institution}`.toLowerCase(),
    exp: (r) => Number(profileOf(r).total_yoe) || 0,
    applied: (r) => new Date(r.created_at).getTime(),
    changed: (r) => new Date(r.stage_changed_at || r.created_at).getTime(),
    last_email: (r) => (r.meta?.last_email_at ? new Date(r.meta.last_email_at).getTime() : 0),
    ai: (r) => ({ Yes: 3, Maybe: 2, No: 1 }[rowVerdict(r)?.label] || 0),
    score: (r) => r.score_overall || 0,
  }

  const sorted = useMemo(() => {
    const fn = sortFns[sort.key] || sortFns.score
    return [...colFiltered].sort((a, b) => {
      const av = fn(a)
      const bv = fn(b)
      if (typeof av === 'number') return sort.dir === 'asc' ? av - bv : bv - av
      return sort.dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
  }, [colFiltered, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const pageRows = sorted.slice(start, start + pageSize)

  const funnel = useMemo(() => {
    const f = {}
    for (const r of board || []) f[r.stage] = (f[r.stage] || 0) + 1
    return f
  }, [board])

  useEffect(() => {
    setPage(1)
    setSelectedIds(new Set())
  }, [workspaceTab, search])

  function toggleSort(key) {
    if (!sortFns[key]) return
    setSort((s) => {
      if (s.key !== key) return { key, dir: 'asc' }
      if (s.dir === 'asc') return { key, dir: 'desc' }
      return { key: 'score', dir: 'desc' }
    })
    setPage(1)
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === pageRows.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(pageRows.map((r) => r.id)))
  }

  async function changeStage(row, stage, e) {
    e?.stopPropagation()
    if (stage === row.stage) return
    setMovingId(row.id)
    try {
      await api.moveStage(row.id, stage)
      await onRefresh()
      toast(`Updated ${row.candidate?.name || 'candidate'}`)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setMovingId(null)
    }
  }

  async function applyBulk() {
    if (!selectedIds.size) return
    setBulkBusy(true)
    try {
      await Promise.all([...selectedIds].map((id) => api.moveStage(id, bulkStage)))
      await onRefresh()
      toast(`Moved ${selectedIds.size} to ${STAGE_LABELS[bulkStage]}`)
      setSelectedIds(new Set())
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  function openRow(row) {
    setSelected(row)
    setDrawerOpen(true)
  }

  function renderCell(colId, row, index) {
    const c = row.candidate || {}
    const p = profileOf(row)
    const m = row.meta || {}

    switch (colId) {
      case 'select':
        return (
          <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelect(row.id)} onClick={(e) => e.stopPropagation()} className="rounded border-slate-300 text-brand-600" />
        )
      case 'idx':
        return <span className="tabular-nums text-xs text-slate-400">{start + index + 1}</span>
      case 'edit':
        return (
          <button type="button" onClick={(e) => { e.stopPropagation(); openRow(row) }} className="rounded-md p-1 text-slate-400 transition-colors duration-150 ease-snappy hover:bg-white hover:text-brand-600 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50" title="Open">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )
      case 'name':
        return (
          <button type="button" onClick={(e) => { e.stopPropagation(); openRow(row) }} className="group min-w-[160px] rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">
            <div className="font-semibold text-brand-600 transition-colors duration-150 ease-snappy group-hover:text-brand-700 group-hover:underline">{c.name || 'Unnamed'}</div>
            <div className="text-[11px] text-slate-400">{c.email || '—'}</div>
          </button>
        )
      case 'rating':
        return <StarRating score={row.score_overall} />
      case 'status':
        return (
          <select
            className="max-w-[132px] rounded-md border-0 bg-slate-100/80 px-2 py-1.5 text-xs font-medium capitalize text-slate-800 ring-1 ring-slate-200/80 focus:ring-2 focus:ring-brand-400"
            value={row.stage}
            disabled={movingId === row.id}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => changeStage(row, e.target.value, e)}
          >
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
        )
      case 'role': {
        // "Current company" must show the employer — not the job title. Freshers have none.
        const company = (p.current_company || '').trim()
        const title = (p.current_title || '').trim()
        if (company) return <TwoLine primary={company} secondary={title} />
        // Only call someone a "Fresher" on an EXPLICIT signal — never infer it from a zero/missing
        // total_yoe, because that's also what an experienced résumé looks like when parsing fails
        // (which was labeling seniors as freshers). Unknown → "—", not a false claim.
        const fresher = /\b(fresher|fresh graduate|intern)\b/i.test(title)
        return <span className="text-sm text-slate-500">{fresher ? 'Fresher' : '—'}</span>
      }
      case 'education':
        return <TwoLine primary={p.education_degree} secondary={p.education_institution} />
      case 'comp':
        return (
          <div className="min-w-[110px] text-[11px] leading-relaxed">
            {p.current_ctc && <div><span className="text-slate-400">Cur </span>{formatComp(p.current_ctc)}</div>}
            {p.salary_expectation && <div><span className="text-slate-400">Exp </span>{formatComp(p.salary_expectation)}</div>}
            {!p.current_ctc && !p.salary_expectation && <span className="text-slate-300">—</span>}
          </div>
        )
      case 'exp':
        return <span className="tabular-nums text-sm text-slate-700">{p.total_yoe != null ? p.total_yoe : '—'}</span>
      case 'location':
        return <span className="text-sm text-slate-600">{p.location || '—'}</span>
      case 'notice':
        return <span className="text-sm text-slate-600">{p.notice_period || '—'}</span>
      case 'source':
        return <span className="text-xs capitalize text-slate-600">{c.source || '—'}</span>
      case 'sub_source':
        return <span className="text-xs text-slate-600">{p.sub_source || '—'}</span>
      case 'applied':
        return <span className="text-xs text-slate-500">{formatDate(row.created_at)}</span>
      case 'applied_by':
        return row.applied_by
          ? <span className="text-xs text-slate-600">{row.applied_by}</span>
          : <span className="text-slate-300">—</span>
      case 'changed':
        return (
          <span className="whitespace-nowrap text-xs text-slate-500" title={row.stage_changed_at ? new Date(row.stage_changed_at).toLocaleString() : ''}>
            {formatDateTime(row.stage_changed_at)}
          </span>
        )
      case 'activity':
        return <span className={`max-w-[130px] truncate text-xs ${m.is_live ? 'font-medium text-brand-600' : 'text-slate-500'}`}>{m.activity || '—'}</span>
      case 'interview':
        if (m.interview_rounds_scheduled > 0) return <Badge tone="blue">R{m.interview_next_round || '?'}</Badge>
        if (m.screening_status === 'in_progress') return <Badge tone="violet">Live</Badge>
        if (m.screening_status === 'completed') return <span className="text-xs text-slate-600">{m.screening_score ?? '✓'}</span>
        return <span className="text-slate-300">—</span>
      case 'last_email': {
        if (!m.last_email_at) return <span className="text-slate-300">—</span>
        const tmpl = (m.last_email_template || 'email').replace(/_/g, ' ')
        const st = m.last_email_status || 'sent'
        const tone = { sent: 'green', logged: 'blue', failed: 'rose' }[st] || 'gray'
        return (
          <div className="min-w-[120px] text-[11px] leading-tight">
            <div className="flex items-center gap-1.5">
              <Badge tone={tone}>{st}</Badge>
              <span className="truncate capitalize text-slate-600" title={tmpl}>{tmpl}</span>
            </div>
            <div className="mt-0.5 text-slate-400">{formatDate(m.last_email_at)}</div>
          </div>
        )
      }
      case 'email':
        return m.email_count ? <span className="text-xs font-medium text-slate-600">{m.email_count}</span> : <span className="text-slate-300">—</span>
      case 'ai': {
        const v = rowVerdict(row)
        if (!v) return <Badge tone="gray">—</Badge>
        return <Badge tone={v.tone} title="AI verdict — hire signal">{v.label}</Badge>
      }
      case 'cv':
        return <DownloadCvButton candidate={c} />
      default:
        return null
    }
  }

  if (workspaceTab === 'analytics') {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
        <PipelineStats apps={board} />
        <div className="rounded-xl bg-slate-50/80 p-5 ring-1 ring-slate-100">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Pipeline funnel</h3>
          <FunnelChart funnel={summary?.funnel || funnel} />
        </div>
      </div>
    )
  }

  if (workspaceTab === 'pool') {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
        <AddFromPool roleId={roleId} onAdded={onRefresh} onCancel={() => {}} />
      </div>
    )
  }

  const iconBtn = 'flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 ring-1 ring-slate-200/80 transition duration-150 ease-snappy hover:bg-white hover:text-brand-600 hover:ring-brand-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50'

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,.04),0_8px_30px_rgba(15,23,42,.06)]">
        {/* Compact toolbar — single row */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
          <div className="relative flex min-w-[200px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              className="h-8 w-full rounded-lg border-0 bg-slate-100/90 pl-8 pr-8 text-sm text-slate-800 ring-1 ring-slate-200/60 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-400/30"
              placeholder="Search candidates…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchDraft); setPage(1) } }}
            />
            {searchDraft && (
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 transition-colors duration-150 ease-snappy hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50" onClick={() => { setSearchDraft(''); setSearch('') }}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <span className="hidden text-[11px] tabular-nums text-slate-400 sm:inline">
            {colFiltered.length} of {board?.length || 0}
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRoundsOpen(true)}
              title="Create interview rounds for candidates in this job"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200/80 transition duration-150 ease-snappy hover:bg-white hover:text-brand-600 hover:ring-brand-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              <CalendarPlus className="h-3.5 w-3.5" /> Interview rounds
            </button>

            <div className="inline-flex rounded-lg bg-slate-100/80 p-0.5 ring-1 ring-slate-200/60">
              <button type="button" onClick={() => setView('list')} className={cx('rounded-md p-1.5 transition-transform duration-150 ease-snappy active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50', view === 'list' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-400')}><LayoutList className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => setView('cards')} className={cx('rounded-md p-1.5 transition-transform duration-150 ease-snappy active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50', view === 'cards' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-400')}><LayoutGrid className="h-3.5 w-3.5" /></button>
            </div>
            <button type="button" className={iconBtn} onClick={onRefresh} title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
            <button type="button" className={iconBtn} onClick={() => setColumnsOpen(true)} title="Columns"><Columns3 className="h-3.5 w-3.5" /></button>
            <button
              type="button"
              className={cx('inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200/80 transition duration-150 ease-snappy hover:bg-white hover:text-brand-600 hover:ring-brand-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50', sorted.length === 0 && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-slate-600 hover:ring-slate-200/80')}
              disabled={sorted.length === 0}
              onClick={() => {
                // Export exactly what's in view (current tab + search + column filters), in the
                // same sorted order shown in the table — so the CSV matches the screen.
                const ok = exportPipelineCsv(sorted, roleTitle)
                toast(
                  ok
                    ? `Exported ${sorted.length} candidate${sorted.length !== 1 ? 's' : ''} to CSV`
                    : 'Export failed — your browser blocked the download',
                  ok ? 'success' : 'error',
                )
              }}
              title={sorted.length === 0 ? 'No rows to export' : `Download ${sorted.length} candidate${sorted.length !== 1 ? 's' : ''} as a CSV`}
            >
              <Download className="h-3.5 w-3.5" /> <span className="hidden md:inline">Export</span>
            </button>
          </div>
        </div>

        {/* Bulk action bar — appears when candidates are selected */}
        {selectedIds.size > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-brand-100 bg-brand-50/70 px-3 py-2">
            <span className="text-sm font-semibold text-brand-800">{selectedIds.size} selected</span>
            <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded px-1 text-xs text-slate-500 transition-colors duration-150 ease-snappy hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">Clear</button>
            <span className="mx-1 h-5 w-px bg-brand-200" />
            <span className="text-xs font-medium text-slate-600">Move to</span>
            <select className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" value={bulkStage} onChange={(e) => setBulkStage(e.target.value)}>
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
            <Button className="text-xs" onClick={applyBulk} disabled={bulkBusy}>{bulkBusy ? <Spinner /> : 'Apply'}</Button>
            <span className="mx-1 h-5 w-px bg-brand-200" />
            <Button variant="ghost" className="text-xs" onClick={() => setBulkEmailOpen(true)}><Mail className="h-3.5 w-3.5" /> Send email</Button>
            <Button variant="ghost" className="text-xs" onClick={() => setBulkAssessOpen(true)}><ClipboardList className="h-3.5 w-3.5" /> Send assessment</Button>
            <Button variant="ghost" className="text-xs" onClick={() => setRoundsOpen(true)}><CalendarPlus className="h-3.5 w-3.5" /> Interview rounds</Button>
          </div>
        )}

        {/* Table body — fills remaining height */}
        <div className="relative min-h-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>
          ) : view === 'cards' ? (
            <div className="h-full overflow-y-auto p-3">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {sorted.map((row) => {
                  const c = row.candidate || {}
                  const p = profileOf(row)
                  const m = row.meta || {}
                  const v = rowVerdict(row)
                  const company = (p.current_company || '').trim()
                  const title = (p.current_title || '').trim()
                  const subtitle = [title, company].filter(Boolean).join(' · ') || c.email || ''
                  const facts = [
                    p.total_yoe != null && `${p.total_yoe} yrs`,
                    p.location,
                    p.current_ctc && `Cur ${formatComp(p.current_ctc)}`,
                    p.notice_period && `${p.notice_period} notice`,
                  ].filter(Boolean)
                  return (
                    <button key={row.id} type="button" onClick={() => openRow(row)} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-left transition duration-150 ease-snappy hover:border-brand-200 hover:bg-white hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-brand-600">{c.name || 'Unnamed'}</div>
                          {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge tone={scoreTone(row.score_overall)} title="AI overall match score / 100">{Math.round(row.score_overall || 0)}</Badge>
                          {v && <Badge tone={v.tone}>{v.label}</Badge>}
                        </div>
                      </div>
                      {facts.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                          {facts.map((f, i) => <span key={i}>{f}</span>)}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge tone={stageTone[row.stage]}>{STAGE_LABELS[row.stage]}</Badge>
                        {m.interview_rounds_scheduled > 0 && <Badge tone="blue">R{m.interview_next_round || '?'}</Badge>}
                        {m.last_email_at && <span className="text-[10px] uppercase tracking-wide text-slate-400">Emailed {formatDate(m.last_email_at)}</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
              {!sorted.length && <p className="py-20 text-center text-sm text-slate-400">No candidates</p>}
            </div>
          ) : (
            <div className="absolute inset-0 overflow-auto">
              <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-[#d5cfe8] bg-[#e8e4f5]">
                  <tr>
                    {activeColumns.map((col) => (
                      <th
                        key={col.id}
                        className={cx(
                          'whitespace-nowrap px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5a6278]',
                          sort.key === col.id && 'text-[#4c4f6b]',
                        )}
                      >
                        {col.id === 'select' ? (
                          <input type="checkbox" checked={pageRows.length > 0 && selectedIds.size === pageRows.length} onChange={toggleSelectAll} className="rounded border-[#b8b0d4] text-brand-600" />
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <span
                              className={cx(sortFns[col.id] && 'cursor-pointer transition-colors duration-150 ease-snappy hover:text-[#4a5568]')}
                              onClick={() => sortFns[col.id] && toggleSort(col.id)}
                            >
                              {col.label}
                              {sort.key === col.id && <span className="ml-0.5 text-brand-600">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                            </span>
                            {FILTER_ACCESSORS[col.id] && (
                              <ColumnFilter
                                label={col.label}
                                values={distinct[col.id] || []}
                                excluded={filterCtl.filters[col.id] || []}
                                onChange={(arr) => { filterCtl.setFilter(col.id, arr); setPage(1) }}
                              />
                            )}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {pageRows.map((row, i) => (
                    <tr
                      key={row.id}
                      onClick={() => openRow(row)}
                      className={cx(
                        'cursor-pointer border-b border-slate-100 transition-colors duration-150 ease-snappy',
                        selectedIds.has(row.id) ? 'bg-brand-50/80' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30',
                        'hover:bg-brand-50/50',
                      )}
                    >
                      {activeColumns.map((col) => (
                        <td key={col.id} className="px-3 py-2.5 align-middle">{renderCell(col.id, row, i)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!pageRows.length && (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                  <UserPlus className="mb-3 h-10 w-10 opacity-30" />
                  <p className="text-sm">No candidates in this view</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer pagination */}
        {view === 'list' && sorted.length > 0 && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-3 py-2 text-[11px] text-slate-500">
            <span>{start + 1}–{Math.min(start + pageSize, sorted.length)} of {sorted.length}</span>
            <div className="flex items-center gap-2">
              <select className="h-7 rounded-md border-0 bg-white px-2 text-xs ring-1 ring-slate-200" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
                {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} rows</option>)}
              </select>
              <button type="button" className="rounded-md px-2 py-1 transition-colors duration-150 ease-snappy hover:bg-white active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-40 disabled:active:scale-100" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <span className="tabular-nums">{safePage}/{totalPages}</span>
              <button type="button" className="rounded-md px-2 py-1 transition-colors duration-150 ease-snappy hover:bg-white active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-40 disabled:active:scale-100" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>

      <Modal open={addModalOpen} onClose={onAddModalClose} title="Add candidate">
        <AddCandidate roleId={roleId} onAdded={() => { onRefresh(); onAddModalClose?.() }} />
      </Modal>

      {roundsOpen && (
        <BulkRoundsModal
          onClose={() => setRoundsOpen(false)}
          allIds={(board || []).map((r) => r.id)}
          selectedIds={[...selectedIds]}
          defaultTypes={roleTypes}
          onDone={() => { setRoundsOpen(false); setSelectedIds(new Set()); onRefresh() }}
        />
      )}

      <CandidateManageDrawer app={selected} open={drawerOpen} onClose={() => setDrawerOpen(false)} onRefresh={onRefresh} />
      <JobColumnSettings open={columnsOpen} onClose={() => setColumnsOpen(false)} visible={visible} onToggle={updateVisible} onReset={resetVisible} />
      <SendAssessmentModal
        open={bulkAssessOpen}
        onClose={() => setBulkAssessOpen(false)}
        applicationIds={Array.from(selectedIds)}
        onSent={() => setSelectedIds(new Set())}
      />
      <BulkEmailModal
        open={bulkEmailOpen}
        onClose={() => setBulkEmailOpen(false)}
        applicationIds={Array.from(selectedIds)}
        onSent={() => setSelectedIds(new Set())}
      />
    </>
  )
}
