import { AlertTriangle } from 'lucide-react'
import { Card, Badge } from '../../ui'

function Section({ title, children }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </div>
  )
}

export default function InsightsTab({ role }) {
  const flags = [...(role.ai_validation?.issues || []), ...(role.ai_validation?.inconsistencies || [])]
  const diffPct = role.difficulty_score || 0

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <Section title="AI Summary">
          <p className="text-sm text-slate-700">{role.ai_summary || '—'}</p>
        </Section>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-slate-400">Difficulty</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${diffPct}%` }} />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{role.difficulty_score}</span>
            <span className="text-sm text-slate-400">/100</span>
            <Badge tone={{ 'very hard': 'rose', hard: 'amber', moderate: 'blue', easy: 'green' }[role.difficulty_label] || 'gray'}>{role.difficulty_label}</Badge>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-400">Est. time to hire</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">~{role.est_time_to_hire_days}d</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-400">Suggested salary</div>
          <div className="mt-1 text-lg font-bold text-slate-900">
            {role.suggested_salary?.min ? `${Math.round(role.suggested_salary.min / 100000)}–${Math.round(role.suggested_salary.max / 100000)}L` : '—'}
          </div>
          <div className="text-xs text-slate-400">{role.suggested_salary?.note}</div>
        </Card>
      </div>
      {flags.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 p-5">
          <Section title="AI flags to review">
            <ul className="space-y-2">
              {flags.map((x, i) => (
                <li key={i} className="flex gap-2 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {x}
                </li>
              ))}
            </ul>
          </Section>
        </Card>
      )}
      {role.hiring_plan?.length > 0 && (
        <Card className="p-5">
          <Section title="AI hiring plan">
            <ol className="relative ml-2 space-y-4 border-l border-slate-200 pl-6">
              {role.hiring_plan.map((s, i) => (
                <li key={i} className="text-sm text-slate-700">
                  <span className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </Section>
        </Card>
      )}
    </div>
  )
}
