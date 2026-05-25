import { Card } from '../../ui'

export default function PipelineStats({ apps }) {
  const active = apps.filter((a) => !['rejected', 'hired'].includes(a.stage)).length
  const avg = apps.length ? Math.round(apps.reduce((s, a) => s + (a.score_overall || 0), 0) / apps.length) : 0
  const topScore = apps.length ? Math.round(Math.max(...apps.map((a) => a.score_overall || 0))) : 0
  const advanced = apps.filter((a) => ['shortlisted', 'interview', 'offer', 'hired'].includes(a.stage)).length

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: 'In pipeline', value: active },
        { label: 'Avg score', value: apps.length ? avg : '—' },
        { label: 'Top score', value: apps.length ? topScore : '—' },
        { label: 'Advanced', value: advanced },
      ].map((s) => (
        <Card key={s.label} className="p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">{s.label}</div>
          <div className="text-xl font-bold tabular-nums text-slate-900">{s.value}</div>
        </Card>
      ))}
    </div>
  )
}
