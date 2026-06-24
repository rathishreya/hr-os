const STAGE_LABELS = {
  applied: 'Applied',
  screening: 'Screening',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
}

const STAGE_ORDER = ['applied', 'shortlisted', 'interview', 'offer', 'hired', 'rejected']

export default function FunnelChart({ funnel = {} }) {
  const entries = STAGE_ORDER.map((s) => ({ stage: s, count: funnel[s] || 0 })).filter((e) => e.count > 0)
  const max = Math.max(...entries.map((e) => e.count), 1)

  if (entries.length === 0) {
    return <p className="text-sm text-slate-400">No applications in pipeline yet.</p>
  }

  return (
    <div className="space-y-3">
      {entries.map(({ stage, count }) => (
        <div key={stage}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium text-slate-600">{STAGE_LABELS[stage]}</span>
            <span className="tabular-nums text-slate-500">{count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ease-snappy ${stage === 'rejected' ? 'bg-rose-400' : stage === 'hired' ? 'bg-emerald-500' : 'bg-brand-500'}`}
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
