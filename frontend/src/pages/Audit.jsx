import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Card, Badge, Spinner, cx } from '../ui'
import { ACTION_TONE } from './auditConstants'
import { AUDIT_CATEGORIES, formatAuditSummary, formatRelativeTime, getAuditCategory } from '../components/AuditDetail'
import { usePageTitle } from '../hooks/usePageTitle'

export default function Audit() {
  usePageTitle('Activity Log')
  const [rows, setRows] = useState(null)
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState({})

  useEffect(() => { api.audit().then(setRows).catch(() => setRows([])) }, [])

  const filtered = useMemo(() => {
    if (!rows) return null
    if (filter === 'all') return rows
    return rows.filter((r) => getAuditCategory(r.action) === filter)
  }, [rows, filter])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit Trail</h1>
        <p className="mt-1 text-sm text-slate-500">Every AI decision and human action is logged — the basis for explainability and governance.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {AUDIT_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilter(c.id)}
            className={cx(
              'rounded-full border px-3 py-1 text-xs font-medium transition',
              filter === c.id ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {!filtered ? (
        <div className="flex items-center gap-2 text-slate-500"><Spinner /> Loading…</div>
      ) : (
        <Card className="divide-y divide-slate-100">
          {filtered.map((r) => {
            const summary = formatAuditSummary(r)
            const isOpen = expanded[r.id]
            const hasDetail = r.detail && Object.keys(r.detail).length > 0
            return (
              <div key={r.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <Badge tone={ACTION_TONE[r.action] || 'gray'} className="shrink-0">{r.action.split('.').pop()}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">{summary}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{r.entity} #{r.entity_id} · {r.actor}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400" title={new Date(r.created_at).toLocaleString()}>
                    {formatRelativeTime(r.created_at)}
                  </span>
                </div>
                {hasDetail && (
                  <button
                    type="button"
                    className="mt-2 text-xs text-violet-600 hover:text-violet-700"
                    onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))}
                  >
                    {isOpen ? 'Hide details' : 'Show details'}
                  </button>
                )}
                {isOpen && hasDetail && (
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{JSON.stringify(r.detail, null, 2)}</pre>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && <div className="px-4 py-6 text-sm text-slate-400">No activity in this category.</div>}
        </Card>
      )}
    </div>
  )
}
