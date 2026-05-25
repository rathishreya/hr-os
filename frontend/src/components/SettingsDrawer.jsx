import { useEffect, useState } from 'react'
import { X, Cpu, Mail } from 'lucide-react'
import { api } from '../api'
import { Badge, IconButton } from '../ui'

export default function SettingsDrawer({ open, onClose }) {
  const [ai, setAi] = useState(null)
  const [email, setEmail] = useState(null)

  useEffect(() => {
    if (!open) return
    api.aiStatus().then(setAi).catch(() => {})
    api.emailTemplates().then(setEmail).catch(() => {})
  }, [open])

  if (!open) return null

  const tone = { claude: 'violet', groq: 'green', ollama: 'green', mock: 'amber' }[ai?.provider] || 'gray'

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
          <IconButton onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></IconButton>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Cpu className="h-3.5 w-3.5" /> AI engine
            </div>
            {ai ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <Badge tone={tone}>{ai.provider}</Badge>
                <p className="mt-2 text-sm text-slate-600">{ai.model}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Loading…</p>
            )}
          </section>
          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Mail className="h-3.5 w-3.5" /> Email
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              {email?.email_configured ? (
                <Badge tone="green">SMTP configured</Badge>
              ) : (
                <>
                  <Badge tone="amber">Log-only mode</Badge>
                  <p className="mt-2 text-xs text-slate-500">Set SMTP_HOST in backend .env to send real emails.</p>
                </>
              )}
            </div>
          </section>
          <section className="text-xs text-slate-500">
            <p className="font-medium text-slate-700">Environment</p>
            <p className="mt-1">Configure AI_PROVIDER, GROQ_API_KEY, CLAUDE_API_KEY, and SMTP in backend/.env — see README.</p>
          </section>
        </div>
      </aside>
    </div>
  )
}
