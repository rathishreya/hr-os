import { useEffect, useState } from 'react'
import { Rocket, Users } from 'lucide-react'
import { api } from '../../api'
import { Badge, Button, Spinner } from '../../ui'
import { useToast } from '../Toast'

const CAT_TONE = { IT: 'blue', HR: 'violet', Team: 'green', Learning: 'amber', Compliance: 'rose' }

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
      <div className="rounded-xl bg-slate-50 p-4 text-center">
        <p className="mb-3 text-sm text-slate-600">Generate an AI onboarding plan — tasks, induction schedule, and tools for this hire.</p>
        <Button onClick={generate} disabled={busy}>{busy ? <><Spinner /> Generating…</> : <><Rocket className="h-4 w-4" /> Generate onboarding plan</>}</Button>
      </div>
    )
  }

  const tasks = plan.tasks || []
  const done = tasks.filter((t) => t.done).length
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span>Onboarding progress</span>
          <span className="font-medium text-slate-700">{done}/{tasks.length} done</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-1.5">
        {tasks.map((t) => (
          <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">
            <input type="checkbox" checked={!!t.done} onChange={(e) => toggle(t.id, e.target.checked)} className="h-4 w-4 accent-violet-600" />
            <span className={t.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{t.title}</span>
            <span className="ml-auto flex items-center gap-1.5">
              {t.owner && <span className="text-xs text-slate-400">{t.owner}</span>}
              {t.category && <Badge tone={CAT_TONE[t.category] || 'gray'}>{t.category}</Badge>}
            </span>
          </label>
        ))}
      </div>

      {plan.buddy && (
        <div className="flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">
          <Users className="h-4 w-4" /> Suggested buddy: <strong>{plan.buddy}</strong>
        </div>
      )}

      {plan.induction?.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Induction schedule</h4>
          <div className="space-y-2">
            {plan.induction.map((d, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="text-xs font-semibold text-violet-700">{d.day}</div>
                <ul className="mt-1 list-disc pl-4 text-xs text-slate-600">
                  {(d.items || []).map((it, j) => <li key={j}>{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {plan.tools?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {plan.tools.map((tool, i) => <Badge key={i} tone="gray">{tool}</Badge>)}
        </div>
      )}

      <Button variant="ghost" className="px-3 py-1 text-xs" onClick={generate} disabled={busy}>Regenerate plan</Button>
    </div>
  )
}
