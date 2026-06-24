import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText, Users, CheckCircle2, Circle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Badge, cx } from '../../ui'
import { api } from '../../api'
import { useToast } from '../Toast'
import { useColumnFilters, ColumnFilter, distinctValues } from '../tableFilters'

// Deterministic, human-readable costing code derived from the role (no DB column needed):
// EZ-{first 3 letters of department, A-Z padded}-{zero-padded id}. Stable for a given row,
// so finance can reference the same charge code every time the list is rendered.
function chargeCode(r) {
  const dept = String(r.department || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .padEnd(3, 'X')
    .slice(0, 3) || 'GEN'
  return `EZ-${dept}-${String(r.id).padStart(4, '0')}`
}

function fmtDate(d) {
  if (!d) return '—'
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return '—'
  return t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const JOBS_ACCESSORS = {
  id: (r) => String(r.id),
  charge_code: (r) => chargeCode(r),
  status: (r) => r.status || '',
  position: (r) => r.position || '',
  department: (r) => r.department || '',
  level_label: (r) => r.level_label || '',
  location: (r) => r.location || '',
  yoe: (r) => [r.yoe_min, r.yoe_max].filter((v) => v != null && v !== '').join('-'),
  salary_min: (r) => (r.salary_min != null ? String(r.salary_min) : ''),
  salary_max: (r) => (r.salary_max != null ? String(r.salary_max) : ''),
  ageing: (r) => (r.ageing_days != null ? String(r.ageing_days) : ''),
  hiring_manager: (r) => r.hiring_manager || '',
  recruiter: (r) => r.recruiter || '',
  employment_type: (r) => r.employment_type || '',
  hire_type: (r) => r.hire_type || '',
  start: (r) => fmtDate(r.start_hiring_date),
  created: (r) => fmtDate(r.created_at),
}

function formatSalary(n) {
  if (n == null || n === '') return '—'
  if (n >= 100000) return `${Math.round(n / 100000)}L`
  return n.toLocaleString('en-IN')
}

// Land each pill on the candidate list filtered to its stage. We carry BOTH the destination
// tab (view) and the stage so the candidate workspace can filter to exactly that stage —
// shortlisted → Shortlisted tab, offer → Positions tab, applied/interview → Applications tab
// with the stage filter applied. `title` names the stage so the link target is unambiguous.
function PipelinePill({ count, roleId, stage, view, title, onNavigate }) {
  const params = new URLSearchParams()
  if (view) params.set('view', view)
  if (stage) params.set('stage', stage)
  const qs = params.toString()
  const to = qs ? `/roles/${roleId}?${qs}` : `/roles/${roleId}`
  return (
    <Link
      to={to}
      onClick={(e) => { e.stopPropagation(); onNavigate?.() }}
      className={cx(
        'inline-flex min-w-[2.5rem] items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs font-medium tabular-nums transition',
        count > 0
          ? 'border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100'
          : 'border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300',
      )}
      title={title || 'View candidates in this stage'}
    >
      <Users className="h-3 w-3" />
      {count}
    </Link>
  )
}

// 'paused' is an auto-set lifecycle state (a stale on-hold role) — it's shown when a row is
// already paused but isn't a manually selectable target. 'closed' is terminal: once closed, a
// role can't be reopened, so the dropdown locks.
const STATUS_OPTIONS = ['open', 'closed', 'on_hold', 'draft']

export default function JobsListTable({ rows, onStatusChange }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' })
  const [updatingId, setUpdatingId] = useState(null)
  const [hireTypeId, setHireTypeId] = useState(null)
  const filterCtl = useColumnFilters()

  const filtered = useMemo(
    () => filterCtl.apply(rows, JOBS_ACCESSORS),
    [rows, filterCtl.filters], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const distinct = useMemo(
    () => Object.fromEntries(Object.entries(JOBS_ACCESSORS).map(([k, acc]) => [k, distinctValues(rows, acc)])),
    [rows],
  )
  const colFilter = (fkey) => (
    <ColumnFilter
      label={fkey}
      values={distinct[fkey] || []}
      excluded={filterCtl.filters[fkey] || []}
      onChange={(arr) => filterCtl.setFilter(fkey, arr)}
    />
  )

  const sorted = useMemo(() => {
    const list = [...filtered]
    const { key, dir } = sort
    list.sort((a, b) => {
      let av = a[key]
      let bv = b[key]
      if (key === 'created_at') {
        av = new Date(a.created_at).getTime()
        bv = new Date(b.created_at).getTime()
      }
      if (key === 'charge_code') {
        av = chargeCode(a)
        bv = chargeCode(b)
      }
      if (key === 'start_hiring_date') {
        // ISO 'YYYY-MM-DD' strings sort lexically; blanks sort to the end.
        av = a.start_hiring_date || '~'
        bv = b.start_hiring_date || '~'
      }
      if (key === 'funnel') {
        av = a.funnel?.total || 0
        bv = b.funnel?.total || 0
      }
      if (typeof av === 'string') {
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return dir === 'asc' ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0)
    })
    return list
  }, [filtered, sort])

  function toggleSort(key) {
    setSort((s) => {
      if (s.key !== key) return { key, dir: 'asc' }
      if (s.dir === 'asc') return { key, dir: 'desc' }
      return { key: 'created_at', dir: 'desc' }
    })
  }

  async function changeStatus(row, status, e) {
    e.stopPropagation()
    if (status === row.status) return
    setUpdatingId(row.id)
    try {
      // Route through the lifecycle endpoint so the state-machine (closed = terminal, stale
      // on-hold → paused) is enforced server-side, not just by hiding options.
      const updated = await api.changeRoleStatus(row.id, status)
      onStatusChange?.()
      toast(updated.status === status
        ? `Job #${row.id} marked ${status}`
        : `Job #${row.id} parked as ${updated.status} (on hold over 3 months)`)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setUpdatingId(null)
    }
  }

  // Inline edit of New vs Replacement. Routed through the role-meta endpoint (the plain role
  // PATCH doesn't persist hire_type), then refresh the list so the row reflects the saved value.
  async function changeHireType(row, hire_type, e) {
    e.stopPropagation()
    if ((row.hire_type || '') === hire_type) return
    setHireTypeId(row.id)
    try {
      await api.updateRoleMeta(row.id, { hire_type })
      onStatusChange?.()
      const label = hire_type === 'replacement' ? 'replacement hire' : hire_type === 'new' ? 'new hire' : 'unset'
      toast(`Job #${row.id} hire type set to ${label}`)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setHireTypeId(null)
    }
  }

  function SortHead({ label, col, filterKey }) {
    const active = sort.key === col
    return (
      <th className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex cursor-pointer items-center gap-1 hover:text-brand-700" onClick={() => toggleSort(col)}>
            {label}
            {active && (sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
          </span>
          {filterKey && colFilter(filterKey)}
        </span>
      </th>
    )
  }

  if (!rows.length) return null

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <table className="w-full min-w-[1400px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm">
            <tr className="border-b border-slate-200">
              <SortHead label="Job ID" col="id" filterKey="id" />
              <SortHead label="Charge code" col="charge_code" filterKey="charge_code" />
              <th className="px-2 py-3 text-[11px] font-bold uppercase text-slate-500">JD</th>
              <th className="px-2 py-3 text-[11px] font-bold uppercase text-slate-500"><span className="inline-flex items-center gap-1">Status {colFilter('status')}</span></th>
              <th className="px-2 py-3 text-[11px] font-bold uppercase text-slate-500" title="AI-validation OK — a green check means the JD is generated and the AI raised no flags; an empty circle means no JD yet or open AI flags to review.">
                <span className="inline-flex cursor-help items-center gap-1">OK</span>
              </th>
              <SortHead label="Job Title" col="position" filterKey="position" />
              <SortHead label="Department" col="department" filterKey="department" />
              <SortHead label="Level" col="level_label" filterKey="level_label" />
              <SortHead label="Location" col="location" filterKey="location" />
              <th className="px-2 py-3 text-center text-[11px] font-bold uppercase text-slate-500">Application</th>
              <th className="px-2 py-3 text-center text-[11px] font-bold uppercase text-slate-500">Shortlisted</th>
              <th className="px-2 py-3 text-center text-[11px] font-bold uppercase text-slate-500">Interview</th>
              <th className="px-2 py-3 text-center text-[11px] font-bold uppercase text-slate-500">Pre-Offer</th>
              <SortHead label="Exp (yrs)" col="yoe_max" filterKey="yoe" />
              <SortHead label="Min Salary" col="salary_min" filterKey="salary_min" />
              <SortHead label="Max Salary" col="salary_max" filterKey="salary_max" />
              <SortHead label="Ageing" col="ageing_days" filterKey="ageing" />
              <th className="px-3 py-3 text-[11px] font-bold uppercase text-slate-500"><span className="inline-flex items-center gap-1">Hiring Mgr {colFilter('hiring_manager')}</span></th>
              <th className="px-3 py-3 text-[11px] font-bold uppercase text-slate-500"><span className="inline-flex items-center gap-1">Recruiter {colFilter('recruiter')}</span></th>
              <th className="px-2 py-3 text-[11px] font-bold uppercase text-slate-500"><span className="inline-flex items-center gap-1">Type {colFilter('employment_type')}</span></th>
              <th className="px-2 py-3 text-[11px] font-bold uppercase text-slate-500"><span className="inline-flex items-center gap-1">New/Repl {colFilter('hire_type')}</span></th>
              <SortHead label="Created" col="created_at" filterKey="created" />
              <SortHead label="Start date" col="start_hiring_date" filterKey="start" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row) => {
              const f = row.funnel || {}
              return (
                <tr
                  key={row.id}
                  onClick={() => navigate(`/roles/${row.id}`)}
                  className="cursor-pointer transition hover:bg-brand-50/50"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-brand-600">{row.id}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-500" title="Charge code for costing — EZ-{department}-{job id}">{chargeCode(row)}</td>
                  <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <Link
                      to={`/roles/${row.id}?view=jd`}
                      className={cx(
                        'inline-flex rounded-lg p-1.5 transition',
                        row.has_jd ? 'text-brand-600 hover:bg-brand-50' : 'text-slate-300',
                      )}
                      title={row.has_jd ? 'View job description' : 'No JD yet'}
                    >
                      <FileText className="h-4 w-4" />
                    </Link>
                  </td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs capitalize disabled:cursor-not-allowed disabled:opacity-60"
                      value={row.status}
                      disabled={updatingId === row.id || row.status === 'closed'}
                      title={row.status === 'closed' ? 'Closed roles are final and cannot be reopened' : undefined}
                      onChange={(e) => changeStatus(row, e.target.value, e)}
                    >
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      {/* A current 'paused'/'closed' value isn't a manual target but must show as the selected option. */}
                      {!STATUS_OPTIONS.includes(row.status) && <option value={row.status}>{row.status.replace('_', ' ')}</option>}
                    </select>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {row.approved ? (
                      <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-500" title="JD ready" />
                    ) : (
                      <Circle className="mx-auto h-5 w-5 text-slate-200" title="Needs review" />
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2.5 font-medium text-slate-900">{row.position}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{row.department || '—'}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-slate-600">{row.level_label || '—'}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-slate-600">{row.location || '—'}</td>
                  <td className="px-2 py-2.5 text-center">
                    {/* Total applications received — the headline "how many applied" count, which
                        stays accurate even after candidates progress past the applied stage. */}
                    <PipelinePill count={f.total || 0} roleId={row.id} view="applications" stage="" title="View all applications" />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <PipelinePill count={f.shortlisted || 0} roleId={row.id} view="shortlisted" stage="shortlisted" title="View shortlisted candidates" />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <PipelinePill count={f.interview || 0} roleId={row.id} view="applications" stage="interview" title="View candidates in the interview stage" />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <PipelinePill count={f.pre_offer || 0} roleId={row.id} view="positions" stage="offer" title="View pre-offer candidates" />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-center tabular-nums text-slate-600">
                    {row.yoe_min || row.yoe_max ? `${row.yoe_min || 0}–${row.yoe_max || '—'}` : '—'}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 tabular-nums text-slate-700">{formatSalary(row.salary_min)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 tabular-nums text-slate-700">{formatSalary(row.salary_max)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-center">
                    <Badge tone={row.ageing_days > 14 ? 'amber' : 'gray'}>{row.ageing_days}d</Badge>
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2.5 text-xs text-slate-500">{row.hiring_manager || '—'}</td>
                  <td className="max-w-[140px] truncate px-3 py-2.5 text-xs text-slate-500">{row.recruiter || '—'}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-xs text-slate-600">{row.employment_type || '—'}</td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs capitalize disabled:cursor-not-allowed disabled:opacity-60"
                      value={row.hire_type || ''}
                      disabled={hireTypeId === row.id}
                      onChange={(e) => changeHireType(row, e.target.value, e)}
                      title="Is this a new role or backfilling someone who left?"
                    >
                      <option value="">—</option>
                      <option value="new">New</option>
                      <option value="replacement">Replacement</option>
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                    {fmtDate(row.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500" title="When hiring actually started">
                    {fmtDate(row.start_hiring_date)}
                  </td>
                </tr>
              )
            })}
            {!sorted.length && (
              <tr><td colSpan={23} className="px-4 py-10 text-center text-sm text-slate-400">No jobs match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
