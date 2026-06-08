import { Link } from 'react-router-dom'
import { Badge } from '../../ui'

export default function RoleHeader({ role, jd, apps, screeningDone }) {
  const hasDecision = apps.some((a) => ['offer', 'hired', 'rejected'].includes(a.stage))
  const steps = [
    { n: 1, label: 'Job created', done: true },
    { n: 2, label: 'Description', done: !!jd },
    { n: 3, label: 'Add candidates', done: apps.length > 0 },
    { n: 4, label: 'AI screen', done: screeningDone },
    { n: 5, label: 'Decide & email', done: hasDecision },
  ]

  return (
    <div className="space-y-4">
      <Link to="/roles" className="rounded text-xs text-slate-400 transition-colors duration-150 ease-snappy hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">← All jobs</Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-balance text-2xl font-bold tracking-tight text-slate-900">{role.position}</h1>
          <p className="mt-1 text-sm text-slate-500">{role.department} · {role.location} · {role.work_mode} · {role.num_openings} opening(s)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(role.mandatory_skills || []).map((s) => <Badge key={s} tone="violet">{s}</Badge>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
        {steps.map((s, i, arr) => (
          <div key={s.n} className="flex items-center gap-1">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${s.done ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
              {s.done ? '✓' : s.n}
            </span>
            <span className={s.done ? 'text-slate-700' : 'text-slate-400'}>{s.label}</span>
            {i < arr.length - 1 && <span className="mx-1 text-slate-300">→</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
