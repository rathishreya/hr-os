import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText, Users, CheckCircle2, Circle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Badge, cx } from '../../ui'
import { api } from '../../api'
import { useToast } from '../Toast'

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
          ? 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100'
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

  const sorted = useMemo(() => {
    const list = [...rows]
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
  }, [rows, sort])

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

  function SortHead({ label, col }) {
    const active = sort.key === col
    return (
      <th
        className="cursor-pointer whitespace-nowrap px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-violet-700"
        onClick={() => toggleSort(col)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && (sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
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
              <SortHead label="Job ID" col="id" />
              <th className="px-2 py-3 text-[11px] font-bold uppercase text-slate-500">JD</th>
              <th className="px-2 py-3 text-[11px] font-bold uppercase text-slate-500">Status</th>
              <th className="px-2 py-3 text-[11px] font-bold uppercase text-slate-500">OK</th>
              <SortHead label="Job Title" col="position" />
              <SortHead label="Department" col="department" />
              <SortHead label="Level" col="level_label" />
              <SortHead label="Location" col="location" />
              <th className="px-2 py-3 text-center text-[11px] font-bold uppercase text-slate-500">Application</th>
              <th className="px-2 py-3 text-center text-[11px] font-bold uppercase text-slate-500">Shortlisted</th>
              <th className="px-2 py-3 text-center text-[11px] font-bold uppercase text-slate-500">Interview</th>
              <th className="px-2 py-3 text-center text-[11px] font-bold uppercase text-slate-500">Pre-Offer</th>
              <SortHead label="Exp (yrs)" col="yoe_max" />
              <SortHead label="Min Salary" col="salary_min" />
              <SortHead label="Max Salary" col="salary_max" />
              <SortHead label="Ageing" col="ageing_days" />
              <th className="px-3 py-3 text-[11px] font-bold uppercase text-slate-500">Hiring Mgr</th>
              <th className="px-3 py-3 text-[11px] font-bold uppercase text-slate-500">Recruiter</th>
              <th className="px-2 py-3 text-[11px] font-bold uppercase text-slate-500">Type</th>
              <th className="px-2 py-3 text-[11px] font-bold uppercase text-slate-500">New/Repl</th>
              <SortHead label="Created" col="created_at" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row) => {
              const f = row.funnel || {}
              return (
                <tr
                  key={row.id}
                  onClick={() => navigate(`/roles/${row.id}`)}
                  className="cursor-pointer transition hover:bg-violet-50/50"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-violet-600">{row.id}</td>
                  <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <Link
                      to={`/roles/${row.id}`}
                      className={cx(
                        'inline-flex rounded-lg p-1.5 transition',
                        row.has_jd ? 'text-violet-600 hover:bg-violet-50' : 'text-slate-300',
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
          </tbody>
        </table>
      </div>
    </div>
  )
}
