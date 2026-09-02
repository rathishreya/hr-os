// What a candidate sent on the onboarding form, as a table HR can read and correct.
//
// It reads the SAME field definitions the public form renders from, so a label the candidate saw
// is the label HR sees, and a key never drifts between the two. Fields the respondent was never
// shown are not listed at all — an organisation has no blood group, and a blank row saying so
// would only be noise.
import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Paperclip, PencilLine, X } from 'lucide-react'
import { api } from '../../api'
import { Badge, Button, Modal, Spinner, cx, inputClass } from '../../ui'
import { EMPTY, TD, TH, THEAD, THEAD_ROW } from '../tableStyles'
import { useToast } from '../Toast'
import { SECTIONS, VARIANTS, fieldsFor, isFile, isRequired, labelFor } from '../../onboardingFields'

const fmtSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)

/** Open a stored document. The route is auth-gated, so it is fetched with the header. */
async function openUpload(uploadId, toast) {
  let url = ''
  try {
    url = URL.createObjectURL(await api.fetchOnboardingUpload(uploadId))
    if (!window.open(url, '_blank', 'noopener')) toast('Allow pop-ups to open the file', 'error')
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}

export default function SubmissionModal({ submission, onClose, onSaved }) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)

  const s = submission
  const variant = s?.variant || 'individual'
  const answers = editing ? draft : (s?.answers || {})

  const filesByKey = useMemo(() => {
    const m = {}
    for (const f of s?.files || []) m[f.field_key] = f
    return m
  }, [s])

  const sections = useMemo(() => {
    const shown = fieldsFor(variant)
    return SECTIONS
      .map((sec) => ({ ...sec, fields: shown.filter((f) => f.section === sec.id) }))
      .filter((sec) => sec.fields.length)
  }, [variant])

  if (!s) return null

  const startEdit = () => { setDraft({ ...(s.answers || {}) }); setEditing(true) }

  async function save() {
    setBusy(true)
    try {
      onSaved(await api.updateOnboardingSubmission(s.id, { answers: draft }))
      toast('Details updated')
      setEditing(false)
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const variantLabel = VARIANTS.find((v) => v.value === variant)?.label || variant
  const missing = fieldsFor(variant).filter(
    (f) => isRequired(f, answers) && !(isFile(f) ? filesByKey[f.key] : answers[f.key]),
  )

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${s.legal_name || s.candidate_name || 'Onboarding form'} — ${s.reference}`}
      footer={
        editing ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy}>
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />} Save changes
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button onClick={startEdit}><PencilLine className="h-3.5 w-3.5" /> Edit details</Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <Badge tone="violet">{variantLabel}</Badge>
          {s.candidate_id
            ? <span>Attached to {s.candidate_name || `candidate ${s.candidate_id}`}</span>
            : <span className="inline-flex items-center gap-1 text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />Not attached to a candidate
              </span>}
          <span className="text-slate-400">·</span>
          <span>Sent {new Date(s.submitted_at).toLocaleString()}</span>
        </div>

        {missing.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {missing.length} required {missing.length === 1 ? 'answer is' : 'answers are'} still
              missing: {missing.map((f) => labelFor(f, variant)).join(', ')}.
            </span>
          </p>
        )}

        {sections.map((sec) => (
          <section key={sec.id}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-brand-800">{sec.title}</h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-left text-sm">
                <thead className={THEAD}>
                  <tr className={THEAD_ROW}>
                    <th scope="col" className={cx(TH, 'w-[42%]')}>Field</th>
                    <th scope="col" className={TH}>Answer</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.fields.map((f) => {
                    const file = filesByKey[f.key]
                    const value = answers[f.key]
                    return (
                      <tr key={f.key} className="border-b border-slate-100 last:border-0">
                        <td className={cx(TD, 'align-top text-slate-600')}>
                          {labelFor(f, variant)}
                          {isRequired(f, answers) && <span className="ml-1 text-rose-500" aria-hidden>*</span>}
                        </td>
                        <td className={TD}>
                          {isFile(f) ? (
                            file ? (
                              <button
                                type="button" onClick={() => openUpload(file.id, toast)}
                                className="inline-flex max-w-full items-center gap-1.5 text-brand-700 hover:underline"
                              >
                                <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                <span className="min-w-0 truncate">{file.filename}</span>
                                <span className="shrink-0 text-xs tabular-nums text-slate-500">{fmtSize(file.size)}</span>
                              </button>
                            ) : <span className={EMPTY}>Not sent</span>
                          ) : editing ? (
                            f.type === 'select' || f.type === 'radio' ? (
                              <select
                                className={cx(inputClass, 'h-8 py-0 text-sm')} value={value || ''}
                                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                              >
                                <option value="">—</option>
                                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
                              <input
                                className={cx(inputClass, 'h-8 py-0 text-sm')} value={value || ''}
                                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                              />
                            )
                          ) : (
                            value ? <span className="whitespace-pre-wrap break-words text-slate-800">{value}</span>
                              : <span className={EMPTY}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </Modal>
  )
}

/** A dismissible cross for headers that need one. Exported so callers can match the modal. */
export const CloseIcon = X
