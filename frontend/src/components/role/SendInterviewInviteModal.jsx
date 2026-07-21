import { useEffect, useState } from 'react'
import { Send, ExternalLink, Calendar, Video } from 'lucide-react'
import { api } from '../../api'
import { Modal, Button, Spinner, Field, inputClass } from '../../ui'
import { useToast } from '../Toast'

/** Preview + send the interview SCHEDULE email for a live round (screening/technical/round_x/final).
 *  The email carries the date/time, the auto-created meeting link, and a calendar (.ics) invite.
 *  Works off the created round rows (roundIds); the first round drives the preview. */
export default function SendInterviewInviteModal({ open, onClose, roundIds = [], onSent }) {
  const { toast } = useToast()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [when, setWhen] = useState('')
  const [where, setWhere] = useState('')
  const [roundLabel, setRoundLabel] = useState('')
  const [busy, setBusy] = useState(false)

  const firstRound = roundIds[0] || null
  const n = roundIds.length
  const isLink = /^https?:\/\//i.test(where || '')

  useEffect(() => {
    if (!open || !firstRound) return
    let alive = true
    api.draftRoundInvite(firstRound)
      .then((d) => {
        if (!alive) return
        setSubject(d.subject); setBody(d.body)
        setWhen(d.when || ''); setWhere(d.where || ''); setRoundLabel(d.round || '')
      })
      .catch(() => {})
    return () => { alive = false }
  }, [open, firstRound])

  async function send() {
    if (!n) { toast('No rounds to send', 'error'); return }
    setBusy(true)
    try {
      const r = await api.sendRoundInvite({ round_ids: roundIds, subject, body })
      const parts = [r.sent && `${r.sent} sent`, r.logged && `${r.logged} logged`, r.failed && `${r.failed} failed`].filter(Boolean)
      toast(`Interview details sent to ${r.total} candidate${r.total !== 1 ? 's' : ''}${parts.length ? ` (${parts.join(', ')})` : ''}`)
      onSent?.(r)
      onClose?.()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={n > 1 ? `Send interview details to ${n} candidates` : 'Send interview details'}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={send} disabled={busy}>{busy ? <Spinner /> : <><Send className="h-4 w-4" /> Send to {n || 0}</>}</Button>
        </>
      )}
    >
      <div className="space-y-3">
        {/* Resolved schedule details for the first candidate (each candidate gets their own link). */}
        <div className="space-y-2 rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-xs text-brand-900">
          {roundLabel && <div className="font-semibold">{roundLabel}</div>}
          <div className="flex items-start gap-2"><Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{when || 'No date/time set'}</span></div>
          <div className="flex items-center gap-2">
            <Video className="h-3.5 w-3.5 shrink-0" />
            {isLink ? (
              <>
                <code className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">{where}</code>
                <a href={where} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-700"><ExternalLink className="h-3 w-3" /> Open</a>
              </>
            ) : (
              <span>{where || 'A meeting link will be created automatically'}</span>
            )}
          </div>
          {n > 1 && <p className="text-[11px] text-brand-700/80">Each of the {n} candidates gets their own meeting link &amp; calendar invite.</p>}
        </div>

        <Field label="Subject"><input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Email body">
          <textarea className={`${inputClass} h-48 resize-y text-xs`} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <p className="text-[11px] leading-relaxed text-slate-400">
          <code className="rounded bg-slate-100 px-1">{'{name}'}</code>, <code className="rounded bg-slate-100 px-1">{'{when}'}</code> and <code className="rounded bg-slate-100 px-1">{'{where}'}</code> are filled per candidate. A calendar (.ics) invite is attached automatically.
        </p>
      </div>
    </Modal>
  )
}
