import { useEffect, useState } from 'react'
import { Sparkles, Send } from 'lucide-react'
import { api } from '../../api'
import { Badge, Button, Spinner, Field, inputClass } from '../../ui'
import { useToast } from '../Toast'

export default function EmailPanel({ app }) {
  const { toast } = useToast()
  const [emails, setEmails] = useState([])
  const [template, setTemplate] = useState('acknowledgment')
  const [templates, setTemplates] = useState([])
  const [configured, setConfigured] = useState(false)
  const [fromAddr, setFromAddr] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [toInfo, setToInfo] = useState({ to_email: app.candidate?.email || '', to_name: app.candidate?.name || '' })
  const [drafting, setDrafting] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = () => api.listEmails(app.id).then(setEmails).catch(() => {})

  useEffect(() => {
    load()
    api.emailTemplates().then((t) => { setTemplates(t.templates); setConfigured(t.email_configured); setFromAddr(t.from || '') }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id])

  // Load the draft (subject + body) for the chosen template — this is exactly what gets sent.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (template === 'custom') { setSubject(''); setBody(''); return }
    let alive = true
    setDrafting(true)
    api.previewEmail({ application_id: app.id, template })
      .then((d) => { if (alive) { setSubject(d.subject); setBody(d.body); setToInfo({ to_email: d.to_email, to_name: d.to_name }) } })
      .catch(() => {})
      .finally(() => { if (alive) setDrafting(false) })
    return () => { alive = false }
  }, [app.id, template])

  async function aiDraft() {
    setDrafting(true)
    try {
      const d = await api.previewEmail({ application_id: app.id, template: template === 'custom' ? 'acknowledgment' : template, use_ai: true })
      setSubject(d.subject); setBody(d.body)
      toast('AI drafted the email — edit as needed')
    } catch (e) { toast(e.message, 'error') } finally { setDrafting(false) }
  }

  async function send() {
    if (!subject.trim() || !body.trim()) { toast('Subject and body are required', 'error'); return }
    setBusy(true)
    try {
      // Pass subject+body so the email sent is EXACTLY the draft shown above.
      const rec = await api.sendEmail({ application_id: app.id, template, subject, body })
      await load()
      if (rec.status === 'sent') toast('Email sent')
      else if (rec.status === 'logged') toast('Logged — SMTP not configured', 'error')
      else toast(`Send failed: ${rec.error || 'unknown error'}`, 'error')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const noEmail = !app.candidate?.email

  return (
    <div className="space-y-3">
      {!configured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          SMTP not configured — emails are composed and logged, not delivered. Configure it in Settings → Email.
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Field label="Template">
            <select className={inputClass} value={template} onChange={(e) => setTemplate(e.target.value)}>
              {templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
        </div>
        <button
          type="button"
          onClick={aiDraft}
          disabled={drafting}
          className="inline-flex h-[42px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-brand-600 transition-transform duration-150 ease-snappy hover:border-brand-300 hover:text-brand-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-50"
        >
          {drafting ? <Spinner /> : <Sparkles className="h-3.5 w-3.5" />} AI draft
        </button>
      </div>

      {/* The exact draft that will be sent */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span>To: <span className="font-medium text-slate-600">{toInfo.to_name || '—'}{toInfo.to_email ? ` <${toInfo.to_email}>` : ''}</span></span>
          {fromAddr && <span className="hidden sm:inline">From: {fromAddr}</span>}
        </div>
        <Field label="Subject"><input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" /></Field>
        <div className="mt-2">
          <Field label="Message">
            <textarea className={`${inputClass} h-56 resize-y font-mono text-xs leading-relaxed`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" />
          </Field>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">This is exactly what the candidate receives. Edit freely before sending.</span>
          <Button onClick={send} disabled={busy || noEmail}>
            {busy ? <Spinner /> : <><Send className="h-4 w-4" /> Send email</>}
          </Button>
        </div>
        {noEmail && <p className="mt-1 text-right text-xs text-rose-500">No email address on file for this candidate.</p>}
      </div>

      {/* Sent history */}
      {emails.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">History</div>
          {emails.map((e) => (
            <div key={e.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
              <div className="flex items-center gap-2">
                <Badge tone={{ sent: 'green', logged: 'blue', failed: 'rose' }[e.status] || 'gray'}>{e.status}</Badge>
                <span className="font-medium text-slate-700">{e.subject}</span>
                {e.ai_generated && <Badge tone="violet">AI</Badge>}
                <span className="ml-auto text-slate-400">{new Date(e.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-slate-500">{e.body}</p>
              {e.status === 'failed' && e.error && <p className="mt-1 text-rose-500">{e.error}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
