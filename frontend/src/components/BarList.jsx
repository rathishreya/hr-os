// Horizontal bar list for a {label: count} map. Shared by the Analytics page and
// the Home dashboard. Sorts by count desc unless `order` fixes the label order.

const TONES = {
  violet: 'bg-brand-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-400',
  rose: 'bg-rose-400',
  blue: 'bg-sky-500',
  slate: 'bg-slate-400',
}

export default function BarList({ data = {}, order, colorFor, emptyText = 'No data yet.', max: maxProp }) {
  let entries = Object.entries(data || {}).filter(([, v]) => v > 0)
  if (order) {
    entries = order.filter((k) => (data?.[k] || 0) > 0).map((k) => [k, data[k]])
  } else {
    entries.sort((a, b) => b[1] - a[1])
  }
  if (entries.length === 0) return <p className="text-sm text-slate-400">{emptyText}</p>
  const max = maxProp || Math.max(...entries.map(([, v]) => v), 1)

  return (
    <div className="space-y-2.5">
      {entries.map(([label, count]) => {
        const tone = TONES[colorFor?.(label) || 'violet'] || TONES.violet
        return (
          <div key={label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium capitalize text-slate-600">{label}</span>
              <span className="tabular-nums text-slate-500">{count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full transition-[width] duration-300 ease-snappy ${tone}`} style={{ width: `${(count / max) * 100}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
