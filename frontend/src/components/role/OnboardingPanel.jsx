import { useEffect, useState } from 'react'
import {
  Rocket, Users, Laptop, FileText, GraduationCap, ShieldCheck, Wrench,
  CheckCircle2, CalendarDays, RefreshCw,
} from 'lucide-react'
import { api } from '../../api'
import { Button, Spinner } from '../../ui'
import { useToast } from '../Toast'

// Category → icon + chip colors (keys match the AI-generated task categories).
const CATS = {
  IT: { icon: Laptop, label: 'IT & Access', chip: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
  HR: { icon: FileText, label: 'HR & Paperwork', chip: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
  Team: { icon: Users, label: 'Team', chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  Learning: { icon: GraduationCap, label: 'Learning', chip: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  Compliance: { icon: ShieldCheck, label: 'Compliance', chip: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
}
const DEFAULT_CAT = { icon: CheckCircle2, label: 'Other', chip: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' }
const CAT_ORDER = ['HR', 'IT', 'Compliance', 'Learning', 'Team']

function Ring({ pct, done }) {
  const r = 26
  const circ = 2 * Math.PI * r
  const color = done ? '#10b981' : '#7c3aed'
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ} className="transition-all duration-500" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800">{pct}%</div>
    </div>
  )
}

export default function OnboardingPanel({ app }) {
  const { toast } = useToast()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = () => api.listOnboarding(app.id)
    .then((list) => setPlan(list[0] || null))
    .catch(() => {})
    .finally(() => setLoading(false))
  useEffect(() => { load() }, [app.id])

  async function generate() {
    setBusy(true)
    try { setPlan(await api.generateOnboarding(app.id)); toast('Onboarding plan generated') }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  async function toggle(taskId, done) {
    setPlan((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, done } : t)) }))
    try { await api.toggleOnboardingTask(plan.id, taskId, done) }
    catch (e) { toast(e.message, 'error'); load() }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>

  if (!plan) {
    return (
      <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><Rocket className="h-6 w-6" /></div>
        <p className="mx-auto mb-4 max-w-xs text-sm text-slate-600">Generate a tailored onboarding plan — a task checklist, week-by-week induction schedule, tools, and a suggested buddy.</p>
        <Button onClick={generate} disabled={busy}>{busy ? <><Spinner /> Generating…</> : <><Rocket className="h-4 w-4" /> Generate onboarding plan</>}</Button>
      </div>
    )
  }

  const tasks = plan.tasks || []
  const done = tasks.filter((t) => t.done).length
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0
  const complete = tasks.length > 0 && done === tasks.length

  // Group tasks by category, ordered.
  const groups = {}
  tasks.forEach((t) => { const k = t.category && CATS[t.category] ? t.category : (t.category || 'Other'); (groups[k] ||= []).push(t) })
  const orderedKeys = [
    ...CAT_ORDER.filter((k) => groups[k]),
    ...Object.keys(groups).filter((k) => !CAT_ORDER.includes(k)),
  ]

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-violet-50 to-white p-4">
        <Ring pct={pct} done={complete} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-800">{complete ? '🎉 Onboarding complete' : 'Onboarding in progress'}</div>
          <div className="text-xs text-slate-500">{done} of {tasks.length} tasks done</div>
          {plan.buddy && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs text-violet-700 shadow-sm">
              <Users className="h-3.5 w-3.5" /> Buddy: <strong>{plan.buddy}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Tasks grouped by category */}
      <div className="space-y-4">
        {orderedKeys.map((cat) => {
          const meta = CATS[cat] || DEFAULT_CAT
          const Icon = meta.icon
          const items = groups[cat]
          const gd = items.filter((t) => t.done).length
          return (
            <div key={cat}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${meta.chip}`}><Icon className="h-3.5 w-3.5" /></span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{meta.label}</span>
                <span className="text-[11px] tabular-nums text-slate-400">{gd}/{items.length}</span>
              </div>
              <div className="space-y-1.5">
                {items.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition hover:border-violet-200 hover:bg-violet-50/40">
                    <input type="checkbox" checked={!!t.done} onChange={(e) => toggle(t.id, e.target.checked)} className="h-4 w-4 shrink-0 accent-violet-600" />
                    <span className={t.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{t.title}</span>
                    {t.owner && <span className="ml-auto shrink-0 text-xs text-slate-400">{t.owner}</span>}
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Induction timeline */}
      {plan.induction?.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><CalendarDays className="h-3.5 w-3.5" /> Induction schedule</h4>
          <ol className="relative ml-1 space-y-4 border-l-2 border-violet-100 pl-5">
            {plan.induction.map((d, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full bg-violet-500 ring-4 ring-white" />
                <div className="text-xs font-semibold text-violet-700">{d.day}</div>
                <ul className="mt-1 space-y-1">
                  {(d.items || []).map((it, j) => (
                    <li key={j} className="flex gap-2 text-xs text-slate-600"><span className="mt-0.5 text-violet-300">•</span><span>{it}</span></li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Tools */}
      {plan.tools?.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><Wrench className="h-3.5 w-3.5" /> Tools &amp; access</h4>
          <div className="flex flex-wrap gap-1.5">
            {plan.tools.map((tool, i) => <span key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">{tool}</span>)}
          </div>
        </div>
      )}

      <button type="button" onClick={generate} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-violet-600 disabled:opacity-50">
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Regenerate plan
      </button>
    </div>
  )
}
