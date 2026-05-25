import { ScoreBar, Badge, Avatar, scoreTone } from '../../ui'

export default function CompareModal({ apps, open, onClose }) {
  if (!open || !apps?.length) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Compare candidates ({apps.length})</h2>
        <div className={`grid gap-4 ${apps.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
          {apps.map((app) => {
            const c = app.candidate || {}
            const tone = scoreTone(app.score_overall)
            return (
              <div key={app.id} className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <Avatar name={c.name} />
                  <div>
                    <div className="font-semibold text-slate-900">{c.name || 'Unnamed'}</div>
                    <div className="text-xs text-slate-400">{c.email}</div>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge tone={tone}>{Math.round(app.score_overall)}/100</Badge>
                  <Badge tone="gray">{app.stage}</Badge>
                  <Badge tone="violet">{(app.recommendation || '').replace('_', ' ')}</Badge>
                </div>
                {c.ai_summary && <p className="mb-3 text-xs text-slate-600">{c.ai_summary}</p>}
                <div className="space-y-2">
                  {Object.entries(app.score_dimensions || {}).map(([k, v]) => (
                    <ScoreBar key={k} label={k} value={v} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Close</button>
        </div>
      </div>
    </div>
  )
}
