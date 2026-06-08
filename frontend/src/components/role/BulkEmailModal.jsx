import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { api } from '../../api'
import { Modal, Button, Spinner, Field, inputClass } from '../../ui'
import { useToast } from '../Toast'

/** Pick a template, EDIT the subject/body (with {name}/{role} tokens), preview how it
 *  renders for the first recipient, and send to many candidates — each gets their own
 *  personalized copy. Or let AI compose each email individually. */
export default function BulkEmailModal({ open, onClose, applicationIds = [], onSent }) {
  const { toast } = useToast()
  const [templates, setTemplates] = useState([])
  const [configured, setConfigured] = useState(false)
  const [template, setTemplate] = useState('acknowledgment')
  const [useAi, setUseAi] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [ctx, setCtx] = useState({ name: '', role: '', company: '', sender: '' })
  const [drafting, setDrafting] = useState(false)
  const [busy, setBusy] = useState(false)

  const n = applicationIds.length
  const firstApp = applicationIds[0] || null

  useEffect(() => {
    if (!open) return
    setTemplate('acknowledgment'); setUseAi(false) // eslint-disable-line react-hooks/set-state-in-effect
    api.emailTemplates().then((t) => { setTemplates(t.templates); setConfigured(t.email_configured) }).catch(() => {})
  }, [open])

  // Load the raw template (with {name} tokens) for editing whenever the template changes.
  useEffect(() => {
    if (!open || !firstApp || useAi) return
    let alive = true
    setDrafting(true) // eslint-disable-line react-hooks/set-state-in-effect
    api.previewEmail({ application_id: firstApp, template, raw: true })
      .then((d) => {
        if (!alive) return
        setSubject(d.subject); setBody(d.body)
        setCtx({ name: d.to_name || 'there', role: d.role || 'the role', company: d.company || '', sender: d.sender || '' })
      })
      .catch(() => {})
      .finally(() => { if (alive) setDrafting(false) })
    return () => { alive = false }
  }, [open, firstApp, template, useAi])

  const fill = (txt) => (txt || '')
    .replaceAll('{name}', ctx.name || 'there')
    .replaceAll('{role}', ctx.role || 'the role')
    .replaceAll('{company}', ctx.company || '')
    .replaceAll('{sender}', ctx.sender || '')

  async function send() {
    if (!n) { toast('No candidates selected', 'error'); return }
    if (!useAi && (!subject.trim() || !body.trim())) { toast('Subject and message are required', 'error'); return }
    setBusy(true)
    try {
      const payload = useAi
        ? { application_ids: applicationIds, template, use_ai: true }
        : { application_ids: applicationIds, template, subject, body }
      const r = await api.sendBulkEmail(payload)
      const parts = [r.sent && `${r.sent} sent`, r.logged && `${r.logged} logged`, r.failed && `${r.failed} failed`, r.skipped && `${r.skipped} no-email`].filter(Boolean)
      toast(`Emailed ${r.total} candidate${r.total !== 1 ? 's' : ''}${parts.length ? ` (${parts.join(', ')})` : ''}`)
      onSent?.(r)
      onClose?.()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Send email to ${n} candidate${n !== 1 ? 's' : ''}`}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={send} disabled={busy || !n}>{busy ? <><Spinner /> Sending…</> : <><Send className="h-4 w-4" /> Send to {n}</>}</Button>
        </>
      )}
    >
      <div className="space-y-3">
        {!configured && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            SMTP not configured — emails will be logged, not delivered. Configure it in Settings → Email.
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <Field label="Email type">
              <select className={inputClass} value={template} onChange={(e) => setTemplate(e.target.value)}>
                {templates.filter((t) => t.key !== 'custom').map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </Field>
          </div>
          <label className="inline-flex h-[42px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="rounded border-slate-300 text-brand-600" />
            AI writes each
          </label>
        </div>

        {useAi ? (
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 text-sm text-brand-900">
            AI will compose a unique email for each of the <strong>{n}</strong> candidate{n !== 1 ? 's' : ''} using the “{templates.find((t) => t.key === template)?.label || template}” intent. Slower for large selections, and not editable here.
          </div>
        ) : (
          <>
            <Field label="Subject">
              <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject…" />
            </Field>
            <Field label="Message">
              <textarea className={`${inputClass} h-44 resize-y font-mono text-xs leading-relaxed`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message… use {name} and {role}" />
            </Field>
            <p className="text-[11px] leading-relaxed text-slate-400">
              <code className="rounded bg-slate-100 px-1">{'{name}'}</code>, <code className="rounded bg-slate-100 px-1">{'{role}'}</code> and <code className="rounded bg-slate-100 px-1">{'{company}'}</code> are filled in per candidate.
            </p>

            {/* Live preview for the first recipient */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Preview{ctx.name ? ` — for ${ctx.name}` : ''}
              </div>
              {drafting ? (
                <div className="flex items-center gap-2 py-4 text-sm text-slate-400"><Spinner /> Loading draft…</div>
              ) : (
                <>
                  <div className="text-sm font-semibold text-slate-800">{fill(subject) || '—'}</div>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{fill(body) || '—'}</p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
