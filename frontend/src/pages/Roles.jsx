import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, AlertTriangle, Briefcase, LayoutGrid, List, X } from 'lucide-react'
import { api } from '../api'
import { Card, Badge, Button, Field, Spinner, Skeleton, PageHeader, EmptyState, inputClass, cx } from '../ui'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'
import JobsListTable from '../components/jobs/JobsListTable'

const VIEW_KEY = 'hr-os-jobs-view'

const EMPTY = {
  position: '', department: '', budget_ctc: '', yoe_min: 0, yoe_max: 0,
  mandatory_skills: '', preferred_skills: '', priority: 'medium',
  hiring_deadline: '', location: '', work_mode: 'hybrid', num_openings: 1,
}

const PRIORITY_BORDER = { urgent: 'border-l-rose-500', high: 'border-l-amber-500', medium: 'border-l-sky-500', low: 'border-l-slate-300' }

function csv(s) { return s.split(',').map((x) => x.trim()).filter(Boolean) }

function NewRoleForm({ onCreated, onCancel }) {
  const [f, setF] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const role = await api.createRole({
        ...f,
        yoe_min: Number(f.yoe_min), yoe_max: Number(f.yoe_max), num_openings: Number(f.num_openings),
        mandatory_skills: csv(f.mandatory_skills), preferred_skills: csv(f.preferred_skills),
        interview_panel: [],
      })
      onCreated(role)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Position *"><input required className={inputClass} value={f.position} onChange={set('position')} placeholder="Senior Backend Engineer" /></Field>
          <Field label="Department"><input className={inputClass} value={f.department} onChange={set('department')} placeholder="Engineering" /></Field>
          <Field label="Budget / CTC"><input className={inputClass} value={f.budget_ctc} onChange={set('budget_ctc')} placeholder="20-28 LPA" /></Field>
          <Field label="Location"><input className={inputClass} value={f.location} onChange={set('location')} placeholder="Bengaluru" /></Field>
          <Field label="Min YOE"><input type="number" min="0" step="0.5" className={inputClass} value={f.yoe_min} onChange={set('yoe_min')} /></Field>
          <Field label="Max YOE"><input type="number" min="0" step="0.5" className={inputClass} value={f.yoe_max} onChange={set('yoe_max')} /></Field>
          <Field label="Mandatory skills" hint="comma-separated"><input className={inputClass} value={f.mandatory_skills} onChange={set('mandatory_skills')} placeholder="Python, FastAPI, PostgreSQL" /></Field>
          <Field label="Preferred skills" hint="comma-separated"><input className={inputClass} value={f.preferred_skills} onChange={set('preferred_skills')} placeholder="Kubernetes, Redis" /></Field>
          <Field label="Priority">
            <select className={inputClass} value={f.priority} onChange={set('priority')}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field label="Work mode">
            <select className={inputClass} value={f.work_mode} onChange={set('work_mode')}>
              <option value="onsite">Onsite</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option>
            </select>
          </Field>
          <Field label="Hiring deadline"><input type="date" className={inputClass} value={f.hiring_deadline} onChange={set('hiring_deadline')} /></Field>
          <Field label="Openings"><input type="number" min="1" className={inputClass} value={f.num_openings} onChange={set('num_openings')} /></Field>
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>{busy ? <><Spinner /> AI is analyzing…</> : 'Post Job (AI checks it)'}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  )
}

function RoleCard({ r }) {
  const [flagsOpen, setFlagsOpen] = useState(false)
  const flags = [...(r.ai_validation?.issues || []), ...(r.ai_validation?.inconsistencies || [])]
  const total = r.funnel?.total

  return (
    <Link to={`/roles/${r.id}`}>
      <Card className={`border-l-4 p-5 transition hover:border-violet-300 hover:shadow-md ${PRIORITY_BORDER[r.priority] || 'border-l-slate-300'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">{r.position}</div>
            <div className="text-xs text-slate-400">#{r.id} · {r.department} · {r.location} · {r.work_mode}</div>
          </div>
          <Badge tone={{ urgent: 'rose', high: 'amber', medium: 'blue', low: 'gray' }[r.priority]}>{r.priority}</Badge>
        </div>
        {r.ai_summary && <p className="mt-3 line-clamp-2 text-sm text-slate-500">{r.ai_summary}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone={r.status === 'open' ? 'green' : 'gray'}>{r.status}</Badge>
          {total != null && <Badge tone="violet">{total} candidates</Badge>}
          <Badge tone={{ 'very hard': 'rose', hard: 'amber', moderate: 'blue', easy: 'green' }[r.difficulty_label] || 'gray'}>
            {r.difficulty_label || 'n/a'} · {r.difficulty_score}/100
          </Badge>
        </div>
        {flags.length > 0 && (
          <div className="mt-3">
            <button type="button" onClick={(e) => { e.preventDefault(); setFlagsOpen(!flagsOpen) }} className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> {flags.length} AI flag(s) to review
            </button>
            {flagsOpen && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-700">{flags.map((x, i) => <li key={i}>{x}</li>)}</ul>
            )}
          </div>
        )}
      </Card>
    </Link>
  )
}

export default function Roles() {
  usePageTitle('Jobs')
  const { toast } = useToast()
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'cards')
  const [roles, setRoles] = useState([])
  const [tableRows, setTableRows] = useState([])
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [cardSort, setCardSort] = useState('newest')
  const searchRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (view === 'list') {
        const rows = await api.listRolesTable(search, statusFilter)
        setTableRows(rows)
        setRoles(rows)
      } else {
        const rows = await api.listRoles()
        setRoles(rows)
      }
    } catch {
      setRoles([])
      setTableRows([])
    } finally {
      setLoading(false)
    }
  }, [view, search, statusFilter])

  useEffect(() => {
    const t = setTimeout(load, view === 'list' ? 280 : 0)
    return () => clearTimeout(t)
  }, [load, view])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function setViewMode(mode) {
    setView(mode)
    localStorage.setItem(VIEW_KEY, mode)
  }

  const cardFiltered = useMemo(() => {
    let list = [...roles]
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        [r.position, r.department, r.location, ...(r.mandatory_skills || [])].join(' ').toLowerCase().includes(q),
      )
    }
    if (statusFilter) list = list.filter((r) => r.status === statusFilter)
    if (cardSort === 'priority') {
      const order = { urgent: 0, high: 1, medium: 2, low: 3 }
      list.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9))
    } else if (cardSort === 'difficulty') {
      list.sort((a, b) => (b.difficulty_score || 0) - (a.difficulty_score || 0))
    }
    return list
  }, [roles, search, statusFilter, cardSort])

  const listFiltered = useMemo(() => {
    if (view !== 'list') return tableRows
    return tableRows
  }, [view, tableRows])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        subtitle="List or card view — click any job to open the candidate pipeline table."
        actions={!creating && (
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create Job</Button>
        )}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              className={`${inputClass} pl-9`}
              placeholder="Search jobs… (press /)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className={`${inputClass} w-36`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="on_hold">On hold</option>
            <option value="draft">Draft</option>
          </select>
          {statusFilter && (
            <button
              type="button"
              onClick={() => setStatusFilter('')}
              className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-800"
            >
              Status: {statusFilter} <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium',
                view === 'cards' ? 'bg-violet-50 text-violet-800' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <LayoutGrid className="h-4 w-4" /> Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium',
                view === 'list' ? 'bg-violet-50 text-violet-800' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <List className="h-4 w-4" /> List
            </button>
          </div>
          {view === 'cards' && (
            <select className={`${inputClass} w-40`} value={cardSort} onChange={(e) => setCardSort(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="priority">Priority</option>
              <option value="difficulty">Difficulty</option>
            </select>
          )}
        </div>
      </div>

      {creating && (
        <NewRoleForm
          onCancel={() => setCreating(false)}
          onCreated={(r) => {
            setCreating(false)
            toast('Job created')
            load()
          }}
        />
      )}

      {loading ? (
        view === 'list' ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8"><Spinner /> Loading jobs…</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
        )
      ) : (view === 'list' ? listFiltered : cardFiltered).length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={search || statusFilter ? 'No matching jobs' : 'No jobs yet'}
          description={search ? 'Try a different search or filter.' : 'Create your first job to start hiring.'}
          action={!search && !creating && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create Job</Button>}
        />
      ) : view === 'list' ? (
        <JobsListTable rows={listFiltered} onStatusChange={load} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cardFiltered.map((r) => <RoleCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  )
}
