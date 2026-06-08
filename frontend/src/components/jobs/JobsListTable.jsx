import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText, Users, CheckCircle2, Circle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Badge, cx } from '../../ui'
import { api } from '../../api'
import { useToast } from '../Toast'
import { useColumnFilters, ColumnFilter, distinctValues } from '../tableFilters'

const JOBS_ACCESSORS = {
  id: (r) => String(r.id),
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
  created: (r) => new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
}

function formatSalary(n) {
  if (n == null || n === '') return '—'
  if (n >= 100000) return `${Math.round(n / 100000)}L`
  return n.toLocaleString('en-IN')
}

function PipelinePill({ count, roleId, stage, onNavigate }) {
  const to = stage ? `/roles/${roleId}?stage=${stage}` : `/roles/${roleId}`
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
      title="View candidates in this stage"
    >
      <Users className="h-3 w-3" />
      {count}
    </Link>
  )
}

const STATUS_OPTIONS = ['open', 'closed', 'on_hold', 'draft']

export default function JobsListTable({ rows, onStatusChange }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' })
  const [updatingId, setUpdatingId] = useState(null)
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
      await api.updateRole(row.id, { status })
      onStatusChange?.()
      toast(`Job #${row.id} marked ${status}`)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setUpdatingId(null)
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
              <th className="px-2 py-3 text-[11px] font-bold uppercase text-slate-500">JD</th>
              <th className="px-2 py-3 text-[11px] font-bold uppercase text-slate-500"><span className="inline-flex items-center gap-1">Status {colFilter('status')}</span></th>
              <th className="px-2 py-3 text-[11px] font-bold uppercase text-slate-500">OK</th>
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
                  <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <Link
                      to={`/roles/${row.id}`}
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
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs capitalize"
                      value={row.status}
                      disabled={updatingId === row.id}
                      onChange={(e) => changeStatus(row, e.target.value, e)}
                    >
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
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
                    <PipelinePill count={f.application || 0} roleId={row.id} stage="application" />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <PipelinePill count={f.shortlisted || 0} roleId={row.id} stage="shortlisted" />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <PipelinePill count={f.interview || 0} roleId={row.id} stage="interview" />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <PipelinePill count={f.pre_offer || 0} roleId={row.id} stage="offer" />
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
                  <td className="whitespace-nowrap px-2 py-2.5 text-xs text-slate-600">{row.hire_type || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                    {new Date(row.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              )
            })}
            {!sorted.length && (
              <tr><td colSpan={21} className="px-4 py-10 text-center text-sm text-slate-400">No jobs match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
