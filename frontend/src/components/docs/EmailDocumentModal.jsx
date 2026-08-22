import { useEffect, useState } from 'react'
import { Mail, Paperclip, Send, AlertTriangle } from 'lucide-react'
import { api } from '../../api'
import { Button, Spinner, Modal, Field, inputClass } from '../../ui'
import { useToast } from '../Toast'
import { documentToPdfBase64 } from './pdfDocument'

/**
 * Review-then-send for a document's covering email.
 *
 * The draft is fetched from the server (subject/body/To/Cc all come from the People team's
 * approved matrix), shown in full, and only sent when the recruiter presses Send — nothing goes
 * out on open. Everything on this screen is editable, because a draft that cannot be corrected
 * just gets worked around.
 */
export default function EmailDocumentModal({ doc, onClose, onSent }) {
  const { toast } = useToast()
  const [draft, setDraft] = useState(null)
  const [err, setErr] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let alive = true
    api.documentEmailDraft(doc.id)
      .then((d) => { if (alive) setDraft({ ...d, cc: (d.cc || []).join(', ') }) })
      .catch((e) => { if (alive) setErr(e.message) })
    return () => { alive = false }
  }, [doc.id])

  const set = (k) => (e) => setDraft((p) => ({ ...p, [k]: e.target.value }))

  async function send() {
    if (!draft?.to_email?.trim()) return toast('Add a recipient before sending', 'error')
    if (!draft?.subject?.trim()) return toast('Add a subject before sending', 'error')
    setSending(true)
    try {
      // Build the attachment from the same blocks the preview renders, so the candidate receives
      // exactly the document on screen.
      const pdf_base64 = await documentToPdfBase64(doc)
      const rec = await api.sendDocumentEmail(doc.id, {
        to_email: draft.to_email.trim(),
        subject: draft.subject,
        body: draft.body,
        cc: draft.cc.split(',').map((s) => s.trim()).filter(Boolean),
        pdf_base64,
        filename: draft.attachment_filename,
      })
      toast(rec.status === 'sent' ? `Email sent to ${draft.to_email}` : `Email ${rec.status} — check Settings → Email`)
      onSent?.(rec)
      onClose()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Review the email before sending"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={sending || !draft} variant="primary">
            {sending ? <Spinner /> : <><Send className="h-4 w-4" /> Send email</>}
          </Button>
        </>
      )}
    >
      {err && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}
      {!draft && !err && <div className="flex justify-center py-10"><Spinner /></div>}

      {draft && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2.5 text-xs leading-relaxed text-brand-800">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <span>
              Nothing has been sent yet. Check the wording and recipients below, then press
              <strong> Send email</strong>.
            </span>
          </div>

          {!draft.known && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                There is no People-team-approved wording for this document type yet — the draft below is
                borrowed from the offer letter. Read it carefully before sending.
              </span>
            </div>
          )}

          {draft.already_sent && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>This document has already been emailed once. Sending again will deliver a second copy.</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="To"><input className={inputClass} value={draft.to_email} onChange={set('to_email')} /></Field>
            <Field label="From" hint="The mailbox connected in Settings → Email">
              <input className={`${inputClass} bg-slate-50 text-slate-500`} value={draft.from_email} readOnly />
            </Field>
          </div>
          <Field label="Cc" hint="Comma-separated">
            <input className={inputClass} value={draft.cc} onChange={set('cc')} />
          </Field>
          <Field label="Subject"><input className={inputClass} value={draft.subject} onChange={set('subject')} /></Field>
          <Field label="Message">
            <textarea className={`${inputClass} h-64 resize-y font-sans`} value={draft.body} onChange={set('body')} />
          </Field>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
            <span>
              <strong className="text-slate-700">{draft.attachment_filename}</strong> will be attached — generated
              from this document, exactly as it previews.
            </span>
          </div>
        </div>
      )}
    </Modal>
  )
}
