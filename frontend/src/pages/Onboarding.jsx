import { useEffect, useMemo, useState } from 'react'
import {
  Rocket, CheckCircle2, Pencil, Check, ListChecks, Users, Clock, CalendarDays,
  ChevronUp, ChevronDown, ExternalLink, RotateCcw, Mail,
} from 'lucide-react'
import { api } from '../api'
import { Card, Badge, Button, Spinner, EmptyState, PageHeader, Modal, Field, inputClass, cx } from '../ui'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'
import { useColumnFilters, ColumnFilter, distinctValues } from '../components/tableFilters'

// Compensation is free text ("20-28 LPA" / "1800000"); ₹-prefix + group a bare figure.
const fmtComp = (v) => {
  const s = (v || '').trim().replace(/\s+/g, ' ')
  if (!s) return ''
  const bare = s.replace(/[, ]/g, '')
  if (/^\d{4,}$/.test(bare)) return `₹${Number(bare).toLocaleString('en-IN')}`
  return s
}
const fmtDate = (s) => {
  const d = (s || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return s || ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return d }
}

const ONBOARDING_STATUSES = ['Onboarding', 'NA', 'Absconding/Abandonment', 'Early Release', 'Termination', 'On-hold/emergency', 'Complete']
const STATUS_TONE = {
  Onboarding: 'blue', NA: 'gray', 'Absconding/Abandonment': 'rose', 'Early Release': 'amber',
  Termination: 'rose', 'On-hold/emergency': 'amber', Complete: 'green',
}
// Per-step status (the Done / Pending / NA dropdown from the sheet).
const STEP_STATUSES = [{ v: '', l: '—' }, { v: 'done', l: 'Done' }, { v: 'pending', l: 'Pending' }, { v: 'na', l: 'NA' }]
const STEP_TONE = { done: 'green', pending: 'amber', na: 'gray' }

const ONB_ACCESSORS = {
  hire: (p) => p.candidate_name || '',
  position: (p) => p.position || p.role_position || '',
  joining: (p) => (p.details && p.details.joining_date) || '',
  status: (p) => (p.details && p.details.status) || '',
}

// Tolerant reader: new plans carry {label,group,type,status,...}; legacy plans carry {title,phase,done}.
const normalizeStep = (t) => ({
  id: t.id,
  label: t.label || t.title || '',
  group: t.group || t.phase || 'Tasks',
  type: t.type || 'status',
  day: t.day ?? null,
  owner: t.owner || '',
  automation: t.automation || '',
  is_session: !!t.is_session,
  status: t.status || (t.done ? 'done' : ''),
  value: t.value || '',
  date: t.date || '',
  comments: t.comments || '',
  attendance: t.attendance || '',
})

const progress = (p) => {
  const steps = (p.tasks || []).map(normalizeStep).filter((s) => s.type !== 'percent')
  const na = steps.filter((s) => s.status === 'na').length
  const done = steps.filter((s) => s.status === 'done').length
  const denom = Math.max(1, steps.length - na)
  return { done, total: steps.length - na, pct: Math.round((100 * done) / denom) }
}

const GROUP_ORDER = ['Pre-joining', 'Joining day', 'Week 1', 'Week 2', 'Sessions', 'Day 30', 'Day 45', 'Day 90', 'Day 95', 'Day 100', 'Tasks']
const groupSteps = (tasks) => {
  const map = {}
  for (const raw of tasks || []) {
    const s = normalizeStep(raw)
    ;(map[s.group] ||= []).push(s)
  }
  const order = [...GROUP_ORDER.filter((g) => map[g]), ...Object.keys(map).filter((g) => !GROUP_ORDER.includes(g))]
  return order.map((g) => ({ group: g, steps: map[g] }))
}

const DETAIL_FIELDS = [
  { key: 'status', label: 'Status' },
  { key: 'joining_date', label: 'Joining date' },
  { key: 'lwd', label: 'LWD (from ERP)' },
  { key: 'compensation', label: 'Compensation' },
  { key: 'location', label: 'Location' },
  { key: 'department', label: 'Department' },
  { key: 'reporting_manager', label: 'Reporting manager' },
  { key: 'approving_manager', label: 'Approving manager' },
  { key: 'email', label: 'Email' },
  { key: 'contact', label: 'Contact number' },
]

function DetailsEditor({ plan, onSaved }) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const d0 = plan.details || {}
  const [d, setD] = useState({
    entity: d0.entity || 'EZ', status: d0.status || '', joining_date: d0.joining_date || '', lwd: d0.lwd || '',
    compensation: d0.compensation || '', location: d0.location || '', department: d0.department || plan.department || '',
    reporting_manager: d0.reporting_manager || '', approving_manager: d0.approving_manager || '',
    email: d0.email || plan.email || '', contact: d0.contact || plan.contact || '',
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
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Candidate &amp; hire details <span className="font-normal normal-case text-slate-400">· auto-picked, editable</span></h4>
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
              <option value="EZ">EZ</option><option value="AEZ">AEZ</option><option value="ArabEasy">ArabEasy</option>
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
              ) : (f.key === 'joining_date' || f.key === 'lwd') ? (
                <input type="date" className={inputClass} value={(d[f.key] || '').slice(0, 10)} onChange={(e) => setD((p) => ({ ...p, [f.key]: e.target.value }))} />
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
            const val = f.key === 'compensation' ? fmtComp(d.compensation) : (f.key === 'joining_date' || f.key === 'lwd') ? fmtDate(d[f.key]) : d[f.key]
            return <div key={f.key}><dt className="text-[11px] uppercase tracking-wide text-slate-400">{f.label}</dt><dd className="truncate text-slate-700" title={val || undefined}>{val || '—'}</dd></div>
          })}
        </dl>
      )}
    </div>
  )
}

// Inline status pill <select>.
function StatusSelect({ value, onChange }) {
  return (
    <select
      className={cx('rounded-md border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/40',
        value === 'done' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : value === 'pending' ? 'border-amber-200 bg-amber-50 text-amber-700'
            : value === 'na' ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-200 bg-white text-slate-500')}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    >
      {STEP_STATUSES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
    </select>
  )
}

// One row of the 100-day checklist; the control adapts to the step type.
function StepRow({ step, pct, onPatch }) {
  const [value, setValue] = useState(step.value)
  const [comments, setComments] = useState(step.comments)
  const auto = step.type === 'email' || /^auto/i.test(step.automation)

  const control = () => {
    switch (step.type) {
      case 'link':
        return (
          <div className="flex items-center gap-1">
            <input className={cx(inputClass, 'h-8 py-1 text-xs')} placeholder="Paste link…" value={value}
              onChange={(e) => setValue(e.target.value)} onBlur={() => value !== step.value && onPatch({ value })} />
            {step.value && <a href={step.value} target="_blank" rel="noreferrer" className="text-brand-600 hover:text-brand-700"><ExternalLink className="h-4 w-4" /></a>}
          </div>
        )
      case 'fill':
        return <input className={cx(inputClass, 'h-8 py-1 text-xs')} placeholder="Fill…" value={value}
          onChange={(e) => setValue(e.target.value)} onBlur={() => value !== step.value && onPatch({ value })} />
      case 'percent':
        return <Badge tone={pct === 100 ? 'green' : 'blue'}>{pct}% complete</Badge>
      case 'session':
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusSelect value={step.status} onChange={(status) => onPatch({ status })} />
            <select className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600" value={step.attendance || ''} onChange={(e) => onPatch({ attendance: e.target.value })}>
              <option value="">Attendance</option><option value="present">Present</option><option value="absent">Absent</option>
            </select>
          </div>
        )
      default: // status, email, comment
        return <StatusSelect value={step.status} onChange={(status) => onPatch({ status })} />
    }
  }

  return (
    <>
      <tr className="border-b border-slate-100 last:border-0 align-top hover:bg-slate-50/60">
        <td className="py-2 pr-2">
          <div className="flex items-start gap-1.5">
            <span className="text-sm text-slate-700">{step.label}</span>
            {auto && <span title={step.automation} className="mt-0.5 inline-flex items-center gap-0.5 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600"><Mail className="h-3 w-3" /> auto</span>}
          </div>
          {step.automation && !auto && <div className="mt-0.5 text-[11px] text-slate-400">{step.automation}</div>}
        </td>
        <td className="py-2 pr-2 text-xs text-slate-400 whitespace-nowrap">{step.owner}</td>
        <td className="py-2 pr-2 whitespace-nowrap">
          {step.day != null ? (
            <input type="date" className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600"
              value={(step.date || '').slice(0, 10)} onChange={(e) => onPatch({ date: e.target.value })} />
          ) : <span className="text-xs text-slate-300">—</span>}
        </td>
        <td className="py-2 pr-2">{control()}</td>
        <td className="py-2">
          <input className={cx(inputClass, 'h-8 py-1 text-xs')} placeholder="Note…" value={comments}
            onChange={(e) => setComments(e.target.value)} onBlur={() => comments !== step.comments && onPatch({ comments })} />
        </td>
      </tr>
    </>
  )
}

function CandidateTracker({ plan, onPatch, onReset }) {
  const groups = useMemo(() => groupSteps(plan.tasks), [plan.tasks])
  const { done, total, pct } = progress(plan)
  return (
    <div className="space-y-4">
      <DetailsEditor key={plan.id} plan={plan} onSaved={onPatch.savePlan} />

      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><ListChecks className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">100-day progress</span>
            <span className="text-xs tabular-nums text-slate-500">{done}/{total} done · {pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={cx('h-full rounded-full transition-[width] duration-300 ease-snappy', pct === 100 ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Button variant="ghost" className="text-xs" onClick={onReset} title="Rebuild from the latest 100-day template (keeps your statuses)"><RotateCcw className="h-3.5 w-3.5" /> Reset to template</Button>
      </div>

      {groups.map(({ group, steps }) => (
        <div key={group} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-slate-50/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">{group}</div>
          <div className="overflow-x-auto px-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="py-1.5 pr-2 font-semibold">Step</th><th className="py-1.5 pr-2">Owner</th><th className="py-1.5 pr-2">When</th><th className="py-1.5 pr-2">Status</th><th className="py-1.5">Notes</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => <StepRow key={s.id} step={s} pct={pct} onPatch={(patch) => onPatch.step(s.id, patch)} />)}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- Sessions view: every scheduled session across all hires, grouped by session, reschedulable ----
function SessionsView({ plans, onStep }) {
  const sessions = useMemo(() => {
    const byLabel = {}
    for (const p of plans || []) {
      for (const raw of p.tasks || []) {
        const s = normalizeStep(raw)
        if (!s.is_session) continue
        ;(byLabel[s.label] ||= []).push({
          planId: p.id, stepId: s.id, candidate: p.candidate_name || 'New hire',
          position: p.position || p.role_position || '', date: s.date, day: s.day, status: s.status, attendance: s.attendance,
        })
      }
    }
    // Order session groups by their earliest working-day.
    return Object.entries(byLabel)
      .map(([label, rows]) => ({ label, day: Math.min(...rows.map((r) => r.day ?? 999)), rows: rows.sort((a, b) => (a.date || '~').localeCompare(b.date || '~')) }))
      .sort((a, b) => a.day - b.day)
  }, [plans])

  if (!sessions.length) {
    return <EmptyState icon={CalendarDays} title="No sessions scheduled yet" description="Sessions appear here once hires are on the 100-day plan. Each session shows who it’s for and when — and you can shift the date." />
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Every onboarding session across your hires — who it’s for and when. Change a date to reschedule, or use the arrows to shift a session earlier / later by a working day.</p>
      {sessions.map(({ label, rows }) => (
        <Card key={label} className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2">
            <CalendarDays className="h-4 w-4 text-brand-500" />
            <h4 className="text-sm font-semibold text-slate-800">{label}</h4>
            <Badge tone="gray">{rows.length} {rows.length === 1 ? 'hire' : 'hires'}</Badge>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.planId}-${r.stepId}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{r.candidate}</div>
                    <div className="text-xs text-slate-400">{r.position || '—'}</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <input type="date" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
                        value={(r.date || '').slice(0, 10)} onChange={(e) => onStep(r.planId, { step_id: r.stepId, date: e.target.value })} />
                      {r.day != null && (
                        <div className="flex flex-col">
                          <button title="Shift one working day earlier" className="text-slate-400 hover:text-brand-600" onClick={() => onStep(r.planId, { step_id: r.stepId, day: Math.max(0, r.day - 1) })}><ChevronUp className="h-3.5 w-3.5" /></button>
                          <button title="Shift one working day later" className="text-slate-400 hover:text-brand-600" onClick={() => onStep(r.planId, { step_id: r.stepId, day: r.day + 1 })}><ChevronDown className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusSelect value={r.status} onChange={(status) => onStep(r.planId, { step_id: r.stepId, status })} />
                  </td>
                  <td className="px-3 py-2.5">
                    <select className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600" value={r.attendance || ''} onChange={(e) => onStep(r.planId, { step_id: r.stepId, attendance: e.target.value })}>
                      <option value="">Attendance</option><option value="present">Present</option><option value="absent">Absent</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  )
}

export default function Onboarding() {
  usePageTitle('Onboarding')
  const { toast } = useToast()
  const [plans, setPlans] = useState(null)
  const [view, setView] = useState(null)
  const [tab, setTab] = useState('hires')
  const filterCtl = useColumnFilters()

  const load = () => api.listAllOnboarding().then(setPlans).catch(() => setPlans([]))
  useEffect(() => { load() }, [])

  const filteredPlans = plans ? filterCtl.apply(plans, ONB_ACCESSORS) : []
  const distinct = useMemo(() => Object.fromEntries(Object.entries(ONB_ACCESSORS).map(([k, acc]) => [k, distinctValues(plans || [], acc)])), [plans])

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
  const onbFilter = (fkey) => <ColumnFilter label={fkey} values={distinct[fkey] || []} excluded={filterCtl.filters[fkey] || []} onChange={(arr) => filterCtl.setFilter(fkey, arr)} />

  const mergePlan = (up) => {
    const keep = (prev) => ({ ...prev, ...up, candidate_name: up.candidate_name || prev.candidate_name, position: up.position || prev.position, email: up.email || prev.email, contact: up.contact || prev.contact })
    setView((v) => (v && v.id === up.id ? keep(v) : v))
    setPlans((list) => (list || []).map((x) => (x.id === up.id ? keep(x) : x)))
  }

  const patchStep = async (planId, body) => {
    try { mergePlan(await api.updateOnboardingStep(planId, body)) } catch (e) { toast(e.message, 'error') }
  }
  const resetPlan = async (planId) => {
    try { mergePlan(await api.resetOnboarding(planId)); toast('Rebuilt from the latest template') } catch (e) { toast(e.message, 'error') }
  }

  const trackerHandlers = {
    step: (stepId, patch) => patchStep(view.id, { step_id: stepId, ...patch }),
    savePlan: mergePlan,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding"
        subtitle="The EZ Lab 100-day plan for every hire. A tracker appears once a candidate is marked “Move to onboarding” in Offer &amp; Docs."
      />

      {plans === null ? (
        <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Loading…</div>
      ) : plans.length === 0 ? (
        <EmptyState icon={Rocket} title="No onboarding plans yet" description="Mark a candidate’s entry as “Move to onboarding” on the Offer & Docs page to start their 100-day tracker here." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'New hires', value: stats.total, icon: Users, tint: 'bg-brand-50 text-brand-600' },
              { label: 'In progress', value: stats.inProgress, icon: Clock, tint: 'bg-sky-50 text-sky-600' },
              { label: 'Complete', value: stats.complete, icon: CheckCircle2, tint: 'bg-emerald-50 text-emerald-600' },
            ].map((s) => (
              <Card key={s.label} className="flex items-center gap-3 p-4">
                <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', s.tint)}><s.icon className="h-5 w-5" /></div>
                <div className="min-w-0"><div className="text-2xl font-semibold leading-none tabular-nums text-slate-900">{s.value}</div><div className="mt-1 text-xs text-slate-500">{s.label}</div></div>
              </Card>
            ))}
          </div>

          {/* Tabs: the hires checklist vs the cross-hire sessions schedule. */}
          <div className="flex items-center gap-1 border-b border-slate-200">
            {[{ k: 'hires', l: 'Hires', icon: Users }, { k: 'sessions', l: 'Sessions', icon: CalendarDays }].map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={cx('inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  tab === t.k ? 'border-brand-500 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700')}>
                <t.icon className="h-4 w-4" /> {t.l}
              </button>
            ))}
          </div>

          {tab === 'sessions' ? (
            <SessionsView plans={plans} onStep={patchStep} />
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2.5"><span className="inline-flex items-center gap-1">New hire {onbFilter('hire')}</span></th>
                      <th className="px-4 py-2.5"><span className="inline-flex items-center gap-1">Position {onbFilter('position')}</span></th>
                      <th className="px-4 py-2.5"><span className="inline-flex items-center gap-1">Joining {onbFilter('joining')}</span></th>
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
                          <td className="px-4 py-2.5"><span className="flex items-center gap-2"><Rocket className="h-4 w-4 shrink-0 text-brand-500" /><span className="font-medium text-slate-800">{p.candidate_name || 'New hire'}</span></span></td>
                          <td className="px-4 py-2.5 text-slate-500">{p.position || p.role_position || '—'}</td>
                          <td className="px-4 py-2.5 text-slate-500">{fmtDate((p.details && p.details.joining_date)) || '—'}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100"><div className={cx('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} /></div>
                              <span className="text-xs tabular-nums text-slate-400">{done}/{total}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">{status ? <Badge tone={STATUS_TONE[status] || 'gray'}>{status}</Badge> : pct === 100 ? <Badge tone="green">Complete</Badge> : <Badge tone="gray">In progress</Badge>}</td>
                          <td className="px-4 py-2.5"><div className="flex justify-end"><Button variant="ghost" className="text-xs" onClick={() => setView(p)}>Open tracker</Button></div></td>
                        </tr>
                      )
                    })}
                    {!filteredPlans.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">No onboarding plans match your filters.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <Modal open={!!view} onClose={() => setView(null)} size="lg" title={view ? `Onboarding — ${view.candidate_name || 'New hire'}` : ''}>
        {view && <CandidateTracker plan={view} onPatch={trackerHandlers} onReset={() => resetPlan(view.id)} />}
      </Modal>
    </div>
  )
}
