import { useEffect, useState } from 'react'
import { api } from '../../api'
import { Badge, Button, Spinner, inputClass } from '../../ui'
import { useToast } from '../Toast'

export default function EmailPanel({ app }) {
  const { toast } = useToast()
  const [emails, setEmails] = useState([])
  const [template, setTemplate] = useState('acknowledgment')
  const [useAi, setUseAi] = useState(true)
  const [templates, setTemplates] = useState([])
  const [configured, setConfigured] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = () => api.listEmails(app.id).then(setEmails).catch(() => {})
  useEffect(() => {
    load()
    api.emailTemplates().then((t) => { setTemplates(t.templates); setConfigured(t.email_configured) }).catch(() => {})
  }, [app.id])

  async function send() {
    setBusy(true)
    try {
      await api.sendEmail({ application_id: app.id, template, use_ai: useAi })
      await load()
      toast('Email sent')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {!configured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          SMTP not configured — emails are composed and logged. Set SMTP_HOST to send for real.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select className={inputClass} value={template} onChange={(e) => setTemplate(e.target.value)}>
          {templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> AI-personalize
        </label>
        <Button variant="ghost" className="px-3 py-1 text-xs" onClick={send} disabled={busy || !app.candidate?.email}>
          {busy ? <Spinner /> : 'Send email'}
        </Button>
        {!app.candidate?.email && <span className="text-xs text-rose-500">no email on file</span>}
      </div>
      {emails.length > 0 && (
        <div className="space-y-2">
          {emails.map((e) => (
            <div key={e.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
              <div className="flex items-center gap-2">
                <Badge tone={{ sent: 'green', logged: 'blue', failed: 'rose' }[e.status] || 'gray'}>{e.status}</Badge>
                <span className="font-medium text-slate-700">{e.subject}</span>
                {e.ai_generated && <Badge tone="violet">AI</Badge>}
                <span className="ml-auto text-slate-400">{new Date(e.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-slate-500">{e.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
