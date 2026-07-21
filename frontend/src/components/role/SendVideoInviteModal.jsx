import { useEffect, useState } from 'react'
import { Send, ExternalLink, Video } from 'lucide-react'
import { api } from '../../api'
import { Modal, Button, Spinner, Field, inputClass } from '../../ui'
import { useToast } from '../Toast'

/** Preview + send the async AI video-interview invite email (with the /interview/{id} link) to one
 *  or more candidates. Mirrors SendAssessmentModal. The link target is a PUBLIC page — the candidate
 *  needs no login to take the interview; the link is inserted per candidate at send time. */
export default function SendVideoInviteModal({ open, onClose, applicationIds = [], onSent }) {
  const { toast } = useToast()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)

  const firstApp = applicationIds[0] || null
  const n = applicationIds.length

  // Load the suggested draft (subject/body keep {name}/{link} tokens) + the resolved link for the
  // first candidate, so the recruiter can preview and open it.
  useEffect(() => {
    if (!open || !firstApp) return
    let alive = true
    api.draftVideoInvite(firstApp)
      .then((d) => { if (alive) { setSubject(d.subject); setBody(d.body); setLink(d.link || '') } })
      .catch(() => {})
    return () => { alive = false }
  }, [open, firstApp])

  async function send() {
    if (!n) { toast('No candidates selected', 'error'); return }
    setBusy(true)
    try {
      const r = await api.sendVideoInvite({ application_ids: applicationIds, subject, body })
      const parts = [r.sent && `${r.sent} sent`, r.logged && `${r.logged} logged`, r.failed && `${r.failed} failed`].filter(Boolean)
      toast(`Interview invite sent to ${r.total} candidate${r.total !== 1 ? 's' : ''}${parts.length ? ` (${parts.join(', ')})` : ''}`)
      onSent?.(r)
      onClose?.()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={n > 1 ? `Send video interview to ${n} candidates` : 'Send video interview'}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={send} disabled={busy}>{busy ? <Spinner /> : <><Send className="h-4 w-4" /> Send to {n || 0}</>}</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-brand-100 bg-brand-50/60 p-2.5 text-xs text-brand-800">
          <Video className="mt-0.5 h-4 w-4 shrink-0" />
          <span>The candidate opens the link and records answers on camera — <strong>no login needed</strong>. AI transcribes &amp; evaluates the responses for you. Set the questions on the round form; defaults are used otherwise.</span>
        </div>
        {link && (
          <Field label="Interview link (a personalized one is added to each candidate's email)">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">{link}</code>
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </a>
            </div>
          </Field>
        )}
        <Field label="Subject"><input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Email body">
          <textarea className={`${inputClass} h-48 resize-y text-xs`} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <p className="text-[11px] leading-relaxed text-slate-400">
          <code className="rounded bg-slate-100 px-1">{'{name}'}</code> and <code className="rounded bg-slate-100 px-1">{'{link}'}</code> are personalized per candidate.
          {n > 1 ? ` Sending to ${n} selected candidates.` : ''}
        </p>
      </div>
    </Modal>
  )
}
