import { useEffect, useMemo, useState } from 'react'
import { Rocket, CheckCircle2, Circle, Pencil, Check, ListChecks, Users, Clock } from 'lucide-react'
import { api } from '../api'
import { Card, Badge, Button, Spinner, EmptyState, PageHeader, Modal, Field, inputClass, cx } from '../ui'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'
import { useColumnFilters, ColumnFilter, distinctValues } from '../components/tableFilters'

// Compensation is stored as free text (e.g. "20-28 LPA" / "1800000"). Normalise it for display so
// it reads consistently with the JD/careers chip: collapse whitespace and, when the value is a bare
// figure with no unit/currency, prefix ₹ and group digits. Values that already carry a unit (LPA,
// lakh, ₹, etc.) are left as the recruiter typed them.
const fmtComp = (v) => {
  const s = (v || '').trim().replace(/\s+/g, ' ')
  if (!s) return ''
  const bare = s.replace(/[, ]/g, '')
  if (/^\d{4,}$/.test(bare)) return `₹${Number(bare).toLocaleString('en-IN')}`
  return s
}

// Onboarding status vocabulary (HR-set on the tracker).
const ONBOARDING_STATUSES = [
  'Onboarding', 'NA', 'Absconding/Abandonment', 'Early Release', 'Termination', 'On-hold/emergency', 'Complete',
]
const STATUS_TONE = {
  Onboarding: 'blue', NA: 'gray', 'Absconding/Abandonment': 'rose', 'Early Release': 'amber',
  Termination: 'rose', 'On-hold/emergency': 'amber', Complete: 'green',
}
const ONB_ACCESSORS = {
  hire: (p) => p.candidate_name || '',
  position: (p) => p.position || p.role_position || '',
  joining: (p) => (p.details && p.details.joining_date) || '',
  status: (p) => (p.details && p.details.status) || '',
}

const progress = (p) => {
  const tasks = p.tasks || []
  const done = tasks.filter((t) => t.done).length
  return { done, total: tasks.length, pct: tasks.length ? Math.round((100 * done) / tasks.length) : 0 }
}

const DETAIL_FIELDS = [
  { key: 'status', label: 'Status' },
  { key: 'joining_date', label: 'Joining date' },
  { key: 'compensation', label: 'Compensation' },
  { key: 'location', label: 'Location' },
  { key: 'department', label: 'Department' },
  { key: 'reporting_manager', label: 'Reporting manager' },
  { key: 'approving_manager', label: 'Approving manager' },
  { key: 'email', label: 'Email' },
  { key: 'contact', label: 'Contact number' },
]

function groupByPhase(tasks) {
  const order = []
  const map = {}
  for (const t of tasks || []) {
    const ph = t.phase || 'Tasks'
    if (!map[ph]) { map[ph] = []; order.push(ph) }
    map[ph].push(t)
  }
  return order.map((ph) => ({ phase: ph, tasks: map[ph] }))
}

// Keyed by plan.id so state initializes from the plan without an effect.
function DetailsEditor({ plan, onSaved }) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const d0 = plan.details || {}
  const [d, setD] = useState({
    entity: d0.entity || 'EZ',
    status: d0.status || '',
    joining_date: d0.joining_date || '',
    compensation: d0.compensation || '',
    location: d0.location || '',
    department: d0.department || plan.department || '',
    reporting_manager: d0.reporting_manager || '',
    approving_manager: d0.approving_manager || '',
    email: d0.email || plan.email || '',
    contact: d0.contact || plan.contact || '',
  })

  async function save() {
    setBusy(true)
    try {
      const up = await api.updateOnboardingDetails(plan.id, d)
      toast('Details saved')
      onSaved(up)
      setEditing(false)
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Candidate &amp; hire details</h4>
        {editing ? (
          <Button className="text-xs" onClick={save} disabled={busy}>{busy ? <Spinner /> : <><Check className="h-3.5 w-3.5" /> Save</>}</Button>
        ) : (
          <Button variant="ghost" className="text-xs" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
        )}
      </div>
      {editing ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Field label="Entity">
            <select className={inputClass} value={d.entity} onChange={(e) => setD((p) => ({ ...p, entity: e.target.value }))}>
              <option value="EZ">EZ</option><option value="AEZ">AEZ</option>
            </select>
          </Field>
          {DETAIL_FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.key === 'status' ? (
                <select className={inputClass} value={d.status || ''} onChange={(e) => setD((p) => ({ ...p, status: e.target.value }))}>
                  <option value="">—</option>
                  {ONBOARDING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  {d.status && !ONBOARDING_STATUSES.includes(d.status) && <option value={d.status}>{d.status}</option>}
                </select>
              ) : (
                <input className={inputClass} value={d[f.key] || ''} onChange={(e) => setD((p) => ({ ...p, [f.key]: e.target.value }))} />
              )}
            </Field>
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
          <div><dt className="text-[11px] uppercase tracking-wide text-slate-400">Entity</dt><dd className="text-slate-700">{d.entity || '—'}</dd></div>
          {DETAIL_FIELDS.map((f) => {
            const val = f.key === 'compensation' ? fmtComp(d.compensation) : d[f.key]
            return (
              <div key={f.key}><dt className="text-[11px] uppercase tracking-wide text-slate-400">{f.label}</dt><dd className="truncate text-slate-700" title={val || undefined}>{val || '—'}</dd></div>
            )
          })}
        </dl>
      )}
    </div>
  )
}

export default function Onboarding() {
  usePageTitle('Onboarding')
  const { toast } = useToast()
  const [plans, setPlans] = useState(null)
  const [view, setView] = useState(null)
  const filterCtl = useColumnFilters()

  const load = () => api.listAllOnboarding().then(setPlans).catch(() => setPlans([]))
  useEffect(() => { load() }, [])

  const filteredPlans = plans ? filterCtl.apply(plans, ONB_ACCESSORS) : []
  const distinct = useMemo(
    () => Object.fromEntries(Object.entries(ONB_ACCESSORS).map(([k, acc]) => [k, distinctValues(plans || [], acc)])),
    [plans],
  )

  // At-a-glance summary across all trackers — total hires, how many are still working through the
  // 100-day journey, and how many have finished (status "Complete" or every task checked off).
  const stats = useMemo(() => {
    const list = plans || []
    let complete = 0
    for (const p of list) {
      const { pct } = progress(p)
      const status = (p.details && p.details.status) || ''
      if (status === 'Complete' || (pct === 100 && (p.tasks || []).length > 0)) complete += 1
    }
    return { total: list.length, complete, inProgress: Math.max(0, list.length - complete) }
  }, [plans])
  const onbFilter = (fkey) => (
    <ColumnFilter label={fkey} values={distinct[fkey] || []} excluded={filterCtl.filters[fkey] || []} onChange={(arr) => filterCtl.setFilter(fkey, arr)} />
  )

  const mergePlan = (up) => {
    const keep = (prev) => ({ ...prev, ...up, candidate_name: up.candidate_name || prev.candidate_name, position: up.position || prev.position, email: up.email || prev.email, contact: up.contact || prev.contact })
    setView((v) => (v && v.id === up.id ? keep(v) : v))
    setPlans((list) => (list || []).map((x) => (x.id === up.id ? keep(x) : x)))
  }

  async function toggle(plan, taskId, done) {
    try {
      const up = await api.toggleOnboardingTask(plan.id, taskId, done)
      mergePlan(up)
    } catch (e) { toast(e.message, 'error') }
  }

  const phases = view ? groupByPhase(view.tasks) : []
  const viewProgress = view ? progress(view) : { done: 0, total: 0, pct: 0 }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding"
        subtitle="The EZ Lab 100-day journey for each hire — Pre-joining through Week 12. A tracker appears here once their entry is marked “Move to onboarding” in Offer & Docs."
      />

      {plans === null ? (
        <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Loading…</div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="No onboarding plans yet"
          description="Mark a candidate’s entry as “Move to onboarding” on the Offer & Docs page to start their tracker here."
        />
      ) : (
        <>
          {/* Summary strip — clearer hierarchy: surface the portfolio at a glance above the table. */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'New hires', value: stats.total, icon: Users, tint: 'bg-brand-50 text-brand-600' },
              { label: 'In progress', value: stats.inProgress, icon: Clock, tint: 'bg-sky-50 text-sky-600' },
              { label: 'Complete', value: stats.complete, icon: CheckCircle2, tint: 'bg-emerald-50 text-emerald-600' },
            ].map((s) => (
              <Card key={s.label} className="flex items-center gap-3 p-4">
                <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', s.tint)}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl font-semibold leading-none tabular-nums text-slate-900">{s.value}</div>
                  <div className="mt-1 text-xs text-slate-500">{s.label}</div>
                </div>
              </Card>
            ))}
          </div>

          <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5"><span className="inline-flex items-center gap-1">New hire {onbFilter('hire')}</span></th>
                  <th className="px-4 py-2.5"><span className="inline-flex items-center gap-1">Position {onbFilter('position')}</span></th>
                  <th className="px-4 py-2.5"><span className="inline-flex items-center gap-1">Joining date {onbFilter('joining')}</span></th>
                  <th className="px-4 py-2.5 w-56">Progress</th>
                  <th className="px-4 py-2.5"><span className="inline-flex items-center gap-1">Status {onbFilter('status')}</span></th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((p) => {
                  const { done, total, pct } = progress(p)
                  const status = (p.details && p.details.status) || ''
                  return (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2"><Rocket className="h-4 w-4 shrink-0 text-brand-500" /><span className="font-medium text-slate-800">{p.candidate_name || 'New hire'}</span></span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{p.position || p.role_position || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500">{(p.details && p.details.joining_date) || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
                            <div className={cx('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-slate-400">{done}/{total}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {status
                          ? <Badge tone={STATUS_TONE[status] || 'gray'}>{status}</Badge>
                          : pct === 100 ? <Badge tone="green">Complete</Badge> : <Badge tone="gray">In progress</Badge>}
                      </td>
                      <td className="px-4 py-2.5"><div className="flex justify-end"><Button variant="ghost" className="text-xs" onClick={() => setView(p)}>Open</Button></div></td>
                    </tr>
                  )
                })}
                {!filteredPlans.length && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">No onboarding plans match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </Card>
        </>
      )}

      <Modal
        open={!!view}
        onClose={() => setView(null)}
        size="lg"
        title={view ? `Onboarding — ${view.candidate_name || 'New hire'}` : ''}
      >
        {view && (
          <div className="space-y-4">
            <DetailsEditor key={view.id} plan={view} onSaved={mergePlan} />

            {/* Overall progress banner — surfaces completion at a glance above the phase list. */}
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <ListChecks className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">100-day progress</span>
                  <span className="text-xs tabular-nums text-slate-500">{viewProgress.done}/{viewProgress.total} tasks · {viewProgress.pct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={cx('h-full rounded-full transition-[width] duration-300 ease-snappy', viewProgress.pct === 100 ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${viewProgress.pct}%` }} />
                </div>
              </div>
            </div>

            {phases.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title="No tasks in this plan yet"
                description="This onboarding tracker has no checklist tasks. They are seeded from the EZ Lab template when the plan is created."
              />
            ) : phases.map(({ phase, tasks }) => {
              const done = tasks.filter((t) => t.done).length
              const pct = tasks.length ? Math.round((100 * done) / tasks.length) : 0
              return (
                <div key={phase} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-700">{phase}</h4>
                    <span className="text-[11px] tabular-nums text-slate-400">{done}/{tasks.length}</span>
                    <div className="ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                      <div className={cx('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {tasks.map((t) => (
                        <tr key={t.id} onClick={() => toggle(view, t.id, !t.done)} className="cursor-pointer border-b border-slate-100 transition-colors duration-150 ease-snappy last:border-0 hover:bg-slate-50">
                          <td className="w-8 py-2 align-middle">{t.done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-slate-300" />}</td>
                          <td className={cx('py-2 pr-2', t.done && 'text-slate-400 line-through')}>{t.title}</td>
                          <td className="py-2 pr-2">{t.category && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{t.category}</span>}</td>
                          <td className="py-2 pr-2 text-right text-[11px] text-slate-400">{t.owner}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}
      </Modal>
    </div>
  )
}
