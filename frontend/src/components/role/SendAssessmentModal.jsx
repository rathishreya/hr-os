import { useEffect, useState } from 'react'
import { Eye, Sparkles, Send } from 'lucide-react'
import { api } from '../../api'
import { Modal, Button, Spinner, Field, inputClass } from '../../ui'
import { useToast } from '../Toast'

/** Pick an assessment (with preview), draft/AI-draft the email, and send it to one or more
 *  candidates. Reused by the interview "assessment round" flow and the bulk table action. */
export default function SendAssessmentModal({ open, onClose, applicationIds = [], assessmentId = null, onSent }) {
  const { toast } = useToast()
  const [assessments, setAssessments] = useState([])
  const [aid, setAid] = useState(assessmentId || '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [drafting, setDrafting] = useState(false)

  const firstApp = applicationIds[0] || null
  const n = applicationIds.length

  useEffect(() => {
    if (!open) return
    let alive = true
    api.listAssessments().then((list) => {
      if (!alive) return
      setAssessments(list)
      setAid(assessmentId || list[0]?.id || '')  // reset selection each time the modal opens
    }).catch(() => {})
    return () => { alive = false }
  }, [open, assessmentId])

  // (Re)load a template draft whenever the chosen assessment changes.
  useEffect(() => {
    if (!open || !aid) return
    let alive = true
    api.draftAssessmentEmail(aid, { application_id: firstApp, use_ai: false })
      .then((d) => { if (alive) { setSubject(d.subject); setBody(d.body) } })
      .catch(() => {})
    return () => { alive = false }
  }, [open, aid, firstApp])

  async function aiDraft() {
    if (!aid) return
    setDrafting(true)
    try {
      const d = await api.draftAssessmentEmail(aid, { application_id: firstApp, use_ai: true })
      setSubject(d.subject); setBody(d.body)
      toast('AI drafted the email — edit as needed')
    } catch (e) { toast(e.message, 'error') } finally { setDrafting(false) }
  }

  async function send() {
    if (!aid) { toast('Pick an assessment first', 'error'); return }
    if (!n) { toast('No candidates selected', 'error'); return }
    setBusy(true)
    try {
      const r = await api.sendAssessment(aid, { application_ids: applicationIds, subject, body })
      const parts = [r.sent && `${r.sent} sent`, r.logged && `${r.logged} logged`, r.failed && `${r.failed} failed`].filter(Boolean)
      toast(`Assessment sent to ${r.total} candidate${r.total !== 1 ? 's' : ''}${parts.length ? ` (${parts.join(', ')})` : ''}`)
      onSent?.(r)
      onClose?.()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={n > 1 ? `Send assessment to ${n} candidates` : 'Send assessment'}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={send} disabled={busy || !aid}>{busy ? <Spinner /> : <><Send className="h-4 w-4" /> Send to {n || 0}</>}</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <Field label="Assessment">
          <div className="flex items-center gap-2">
            <select className={inputClass} value={aid} onChange={(e) => setAid(Number(e.target.value) || '')}>
              <option value="">Select an assessment…</option>
              {assessments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {aid ? (
              <a href={api.assessmentFileUrl(aid)} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-600 hover:border-brand-300 hover:text-brand-700">
                <Eye className="h-3.5 w-3.5" /> Preview
              </a>
            ) : null}
          </div>
        </Field>
        {assessments.length === 0 && <p className="text-xs text-amber-600">No assessments yet — add one on the Assessments page first.</p>}

        <Field label="Subject"><input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label={(
          <span className="flex w-full items-center justify-between">
            Email body
            <button type="button" onClick={aiDraft} disabled={drafting || !aid} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 transition-transform duration-150 ease-snappy hover:text-brand-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-50">
              {drafting ? <Spinner /> : <Sparkles className="h-3.5 w-3.5" />} AI draft
            </button>
          </span>
        )}>
          <textarea className={`${inputClass} h-48 resize-y text-xs`} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <p className="text-[11px] leading-relaxed text-slate-400">
          <code className="rounded bg-slate-100 px-1">{'{name}'}</code> is personalized per candidate; the email includes a link to the assessment file.
          {n > 1 ? ` Sending to ${n} selected candidates.` : ''}
        </p>
      </div>
    </Modal>
  )
}
