import { useEffect, useMemo, useState } from 'react'
import {
  Search, Download, RefreshCw, Columns3, LayoutGrid, LayoutList,
  UserPlus, Star, Pencil, X, ClipboardList, CalendarPlus, Mail, FileDown,
} from 'lucide-react'
import { Badge, Button, Modal, scoreTone, stageTone, cx, Spinner } from '../../ui'
import { formatComp } from '../../utils/exportCsv'
import { INTERVIEW_TYPES } from '../../constants'
import { useJobAppColumns } from '../../hooks/useJobAppColumns'
import JobColumnSettings from './JobColumnSettings'
import CandidateManageDrawer from './CandidateManageDrawer'
import { RoundForm, EMPTY_ROUND } from './InterviewPlanningPanel'
import SendAssessmentModal from './SendAssessmentModal'
import SendVideoInviteModal from './SendVideoInviteModal'
import SendInterviewInviteModal from './SendInterviewInviteModal'
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

// Schedule an interview round for the selected candidate(s) using the SAME form as the
// per-candidate Interview-plan panel (single round type, panelists, slot, invite) — so scheduling
// looks and behaves identically whether you do it from a candidate's drawer or from the table.
// The chosen round is created for each selected application; round numbers auto-continue per
// candidate when more than one is selected. Mounted only while open.
function ScheduleRoundsModal({ roleId, applicationIds, onClose, onDone }) {
  const { toast } = useToast()
  const [form, setForm] = useState({ ...EMPTY_ROUND })
  const [busy, setBusy] = useState(false)
  const [panelSuggestions, setPanelSuggestions] = useState([])
  const [sendAssessmentId, setSendAssessmentId] = useState(null)  // opens the send-assessment popup
  const [showVideoInvite, setShowVideoInvite] = useState(false)   // opens the video-interview invite popup
  const [liveInviteRounds, setLiveInviteRounds] = useState(null)  // round ids → opens the schedule-email popup
  const n = applicationIds.length

  // Panelist suggestions: the role's interview panel + registered panellist users (same source the
  // per-candidate planner uses, so the "+ name" chips match).
  useEffect(() => {
    let alive = true
    Promise.all([
      roleId ? api.getRole(roleId).catch(() => null) : Promise.resolve(null),
      api.listUsers('panellist').catch(() => []),
    ]).then(([role, users]) => {
      if (!alive) return
      const fromRole = (role?.interview_panel || []).filter(Boolean)
      const fromUsers = (users || []).map((u) => u.name || u.email).filter(Boolean)
      setPanelSuggestions([...new Set([...fromUsers, ...fromRole])])
    })
    return () => { alive = false }
  }, [roleId])

  async function save() {
    if (!n) { toast('No candidates selected', 'error'); return }
    setBusy(true)
    // After creating, ALWAYS preview the candidate email before sending: assessment → the assessment;
    // AI-interview → the (public) interview link; any live round → the schedule email with the
    // auto-created meeting link + calendar invite.
    const offerSend = form.interview_type === 'assessment' ? form.assessment_id : null
    const offerVideo = form.interview_type === 'ai_interview'
    try {
      const results = await Promise.allSettled(applicationIds.map((id) =>
        api.createInterviewRound({
          application_id: id,
          ...form,
          // For >1 candidate, let each continue its own round numbering (never collide).
          round_number: n > 1 ? 0 : form.round_number,
        }),
      ))
      const created = results.filter((r) => r.status === 'fulfilled' && r.value?.id).map((r) => r.value.id)
      const ok = created.length
      const failed = n - ok
      const label = INTERVIEW_TYPES.find((t) => t.value === form.interview_type)?.label || 'Round'
      toast(
        `${label} scheduled for ${ok} candidate${ok !== 1 ? 's' : ''}${failed ? ` · ${failed} failed` : ''}`,
        failed ? 'error' : 'success',
      )
      if (offerSend) setSendAssessmentId(offerSend)       // finish after the assessment popup closes
      else if (offerVideo) setShowVideoInvite(true)        // finish after the video-invite popup closes
      else if (created.length) setLiveInviteRounds(created)  // finish after the schedule-email popup closes
      else onDone()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Hidden while a follow-up send popup (assessment / video / schedule) is showing, so they don't stack. */}
      <Modal
        open={!sendAssessmentId && !showVideoInvite && !liveInviteRounds}
        onClose={onClose}
        title={n > 1 ? `Schedule a round · ${n} candidates` : 'Schedule interview round'}
      >
        <RoundForm
          form={form}
          setForm={setForm}
          panelSuggestions={panelSuggestions}
          onSave={save}
          onCancel={onClose}
          busy={busy}
          isNew
          app={null}
        />
      </Modal>
      <SendAssessmentModal
        open={!!sendAssessmentId}
        onClose={() => { setSendAssessmentId(null); onDone() }}
        applicationIds={applicationIds}
        assessmentId={sendAssessmentId}
      />
      <SendVideoInviteModal
        open={showVideoInvite}
        onClose={() => { setShowVideoInvite(false); onDone() }}
        applicationIds={applicationIds}
      />
      <SendInterviewInviteModal
        open={!!liveInviteRounds}
        onClose={() => { setLiveInviteRounds(null); onDone() }}
        roundIds={liveInviteRounds || []}
      />
    </>
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
  const [stageOverride, setStageOverride] = useState({})  // optimistic rowId -> stage, cleared on refresh
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [roundsOpen, setRoundsOpen] = useState(false)
  const [sort, setSort] = useState({ key: 'score', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

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
    // Optimistic: reflect the new stage in the dropdown instantly, and reconcile the board in the
    // BACKGROUND instead of freezing the UI on the (slow) refetch. Revert if the save fails.
    setStageOverride((m) => ({ ...m, [row.id]: stage }))
    setMovingId(row.id)
    try {
      await api.moveStage(row.id, stage)
      toast(`Updated ${row.candidate?.name || 'candidate'}`)
      Promise.resolve(onRefresh()).finally(() => setStageOverride({}))
    } catch (err) {
      setStageOverride((m) => { const n = { ...m }; delete n[row.id]; return n })
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
            value={stageOverride[row.id] ?? row.stage}
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
            {/* "Interview rounds" lives in the selection bar (below) alongside Send email / Send
                assessment — select candidates first, then schedule. Kept single to avoid duplication. */}
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
        <ScheduleRoundsModal
          roleId={roleId}
          applicationIds={selectedIds.size ? [...selectedIds] : (board || []).map((r) => r.id)}
          onClose={() => setRoundsOpen(false)}
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
