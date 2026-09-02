// Onboarding, rebuilt around the People team's own process.
//
// Three views, because there are three questions: where is this new joiner up to, what sessions
// does EZ run, and what is happening when. They are tabs on one page rather than three routes,
// because the answer to one is usually the reason you opened another.
//
// Every list filters through the same faceted machinery the rest of the app uses, and everything
// is entity-scoped: the API returns only the steps a candidate's entity has, so ArabEasy simply
// does not have a go-to-person row to hide.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, CalendarDays, Check, ChevronRight, ClipboardList, Clock, Filter, Inbox,
  Mail, MapPin, MoreHorizontal, PencilLine, Search, Send, Users, Video,
} from 'lucide-react'
import { api } from '../api'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Spinner, cx, focusRing, inputClass } from '../ui'
import { EMPTY, ROW, ROW_GROUP, ROW_HOVER, TABLE_WRAP, TD, TH, TH_TYPE, THEAD, THEAD_ROW } from '../components/tableStyles'
import { ColumnFilter, distinctValues, useColumnFilters } from '../components/tableFilters'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'
import OnboardingFormsModal from '../components/onboarding/OnboardingFormsModal'

const TOOLBAR = cx('h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none',
  'transition-colors duration-150 ease-snappy hover:border-slate-300 focus:border-brand-500', focusRing)

const STATUS_TONE = {
  Done: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Pending: 'border-slate-200 bg-white text-slate-700',
  NA: 'border-slate-200 bg-slate-100 text-slate-500',
}

// Where a read-only step gets its value. Naming the place matters: "from their paperwork" tells
// somebody which screen to go and fix it on.
const SOURCE_LABEL = {
  documents: 'their paperwork',
  application: 'their application',
  form: 'the onboarding form',
}

const KIND_ICON = {
  mail: Mail, session: Users, meeting: CalendarDays, feedback: ClipboardList,
  date: CalendarDays, status: Check, text: PencilLine, source: Inbox, derived: Filter,
}

const fmtDate = (v) => {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
const fmtDateTime = (v) => {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function ProgressBar({ percent, tone = 'bg-brand-600' }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={cx('h-full rounded-full transition-[width] duration-300 ease-snappy', tone)}
        style={{ width: `${percent}%` }} />
    </div>
  )
}

// ── View 1: who is on onboarding, and one person's checklist ────────────────────────────────

const BOARD_COLUMNS = [
  { key: 'name', label: 'Candidate', get: (r) => r.candidate_name || '' },
  { key: 'entity', label: 'Entity', get: (r) => r.entity || '' },
  { key: 'role', label: 'Role', get: (r) => r.role || '' },
  { key: 'joining', label: 'Joining', get: (r) => fmtDate(r.joining_date) },
  { key: 'progress', label: 'Progress', get: (r) => `${r.progress.percent}%` },
  { key: 'overdue', label: 'Overdue', get: (r) => (r.overdue ? `${r.overdue} overdue` : 'On track') },
  { key: 'next', label: 'Next due', get: (r) => (r.next_due ? fmtDate(r.next_due.on) : '') },
]

function CandidatesView({ rows, onOpen }) {
  const [q, setQ] = useState('')
  const colFilters = useColumnFilters()

  const searched = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return rows
    return rows.filter((r) => BOARD_COLUMNS.some((c) => String(c.get(r) || '').toLowerCase().includes(n)))
  }, [rows, q])
  const accessors = useMemo(() => Object.fromEntries(BOARD_COLUMNS.map((c) => [c.key, c.get])), [])
  const shown = useMemo(() => colFilters.apply(searched, accessors), [searched, colFilters, accessors])
  const values = useMemo(
    () => Object.fromEntries(BOARD_COLUMNS.map((c) => [c.key, distinctValues(rows, c.get)])), [rows])

  if (!rows.length) {
    return (
      <EmptyState icon={Users} title="Nobody is on onboarding yet"
        description="A candidate joins this page once their entry is marked “Move to onboarding” on Offer & Docs." />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a candidate…"
            className={cx(TOOLBAR, 'h-9 w-full pl-8 text-sm')} />
        </label>
        {colFilters.active > 0 && (
          <button type="button" onClick={colFilters.clear}
            className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">
            <span className="tabular-nums">{colFilters.active}</span> filtered
          </button>
        )}
        <span className="text-xs tabular-nums text-slate-500">{shown.length} of {rows.length}</span>
      </div>

      <div className={TABLE_WRAP}>
        <div className="overflow-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className={cx(THEAD, 'sticky top-0 z-10')}>
              <tr className={THEAD_ROW}>
                {BOARD_COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className={TH}>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      {c.label}
                      <ColumnFilter label={c.label} values={values[c.key]}
                        excluded={colFilters.filters[c.key] || []}
                        onChange={(a) => colFilters.setFilter(c.key, a)} />
                    </span>
                  </th>
                ))}
                <th scope="col" className={cx(TH, 'text-right')} />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.plan_id} onClick={() => onOpen(r)}
                  className={cx('cursor-pointer border-b border-slate-100 last:border-0', ROW_HOVER)}>
                  <td className={TD}>
                    <span className="block truncate font-medium text-slate-800">{r.candidate_name}</span>
                    <span className="block truncate text-xs text-slate-500">{r.email}</span>
                  </td>
                  <td className={TD}>
                    <span className="inline-flex shrink-0 items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-px text-[11px] font-medium text-slate-600">{r.entity}</span>
                  </td>
                  <td className={cx(TD, 'text-slate-600')}><span className="block truncate">{r.role || <span className={EMPTY}>—</span>}</span></td>
                  <td className={cx(TD, 'whitespace-nowrap text-slate-600')}>{fmtDate(r.joining_date) || <span className={EMPTY}>—</span>}</td>
                  <td className={cx(TD, 'w-40')}>
                    <div className="flex items-center gap-2">
                      <ProgressBar percent={r.progress.percent} />
                      <span className="shrink-0 text-xs tabular-nums text-slate-600">{r.progress.percent}%</span>
                    </div>
                    <span className="mt-0.5 block text-[11px] text-slate-500">{r.progress.done} of {r.progress.counted} done</span>
                  </td>
                  <td className={TD}>
                    {r.overdue ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />{r.overdue} overdue
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-700">
                        <Check className="h-3.5 w-3.5" aria-hidden />On track
                      </span>
                    )}
                  </td>
                  <td className={cx(TD, 'whitespace-nowrap text-slate-600')}>
                    {r.next_due ? fmtDate(r.next_due.on) : <span className={EMPTY}>—</span>}
                  </td>
                  <td className={cx(TD, 'text-right')}><ChevronRight className="ml-auto h-4 w-4 text-slate-400" aria-hidden /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/** One candidate's checklist, grouped by phase. */
/** Read a mail, change what you want, send it.
 *
 * The same window serves a candidate's mail and a session's, because they differ only in who is
 * on the other end: one person, or everyone who was invited. Nothing is ever sent from a list
 * without passing through here first. */
function MailComposer({ planId, occurrenceId, templateKey, onClose, onSent }) {
  const { toast } = useToast()
  const [draft, setDraft] = useState(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const load = occurrenceId
      ? api.onboardingSessionMailDraft(occurrenceId, templateKey)
      : api.onboardingMailDraft(planId, templateKey)
    load.then((d) => {
      setDraft(d)
      setSubject(d.subject || '')
      setBody(d.body || '')
      setTo(d.to || '')
      setCc((d.cc || []).join(', '))
    }).catch((e) => { toast(e.message, 'error'); onClose() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, occurrenceId, templateKey])

  const recipients = draft?.recipients || []
  const canSend = occurrenceId ? recipients.length > 0 : !!to.trim()

  async function send() {
    setSending(true)
    try {
      const payload = { subject, body }
      if (!occurrenceId) {
        payload.to = to.trim()
        payload.cc = cc.split(',').map((s) => s.trim()).filter(Boolean)
      }
      const res = occurrenceId
        ? await api.onboardingSendSessionMail(occurrenceId, templateKey, payload)
        : await api.onboardingSendMail(planId, templateKey, payload)
      toast(occurrenceId ? `Sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}` : `Sent to ${res.to}`, 'success')
      onSent?.()
      onClose()
    } catch (e) { toast(e.message, 'error') } finally { setSending(false) }
  }

  return (
    <Modal open onClose={onClose} size="wide" title={draft?.name || 'Mail'}>
      {!draft ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Spinner className="h-4 w-4" /> Loading the draft…</div>
      ) : (
        <div className="space-y-4">
          {draft.sent_at && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              This one already went out on {fmtDateTime(draft.sent_at)}. Sending again will send a second copy.
            </p>
          )}
          {!!draft.missing?.length && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Still to fill in: <strong>{draft.missing.join(', ')}</strong>. They are left in the text
                below as {'{{'}…{'}}'} so you can see where they go.
              </span>
            </p>
          )}
          {draft.note && <p className="text-xs italic text-slate-500">{draft.note}</p>}

          {occurrenceId ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Goes to {recipients.length} {recipients.length === 1 ? 'person' : 'people'}
              </p>
              {recipients.length ? (
                <p className="mt-1 text-xs leading-relaxed text-slate-700">
                  {recipients.map((r) => r.name || r.email).join(', ')}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  Nobody yet. Add people to the sitting, and for a feedback mail mark who came.
                </p>
              )}
              {!!draft.per_recipient?.length && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {draft.per_recipient.join(', ')} is filled in separately for each of them.
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">To</span>
                <input value={to} onChange={(e) => setTo(e.target.value)} className={cx(inputClass, 'h-9 text-sm')} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Cc</span>
                <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Separate with commas"
                  className={cx(inputClass, 'h-9 text-sm')} />
              </label>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={cx(inputClass, 'h-9 text-sm')} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Message</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18}
              className={cx(inputClass, 'resize-y font-sans text-sm leading-relaxed')} />
          </label>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={send} disabled={sending || !canSend}>
              {sending ? <Spinner className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              {draft.sent_at ? 'Send again' : 'Send'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ChecklistModal({ planId, phases, onClose, onChanged }) {
  const { toast } = useToast()
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState('')
  const [mails, setMails] = useState([])
  const [composing, setComposing] = useState(null)

  useEffect(() => {
    api.onboardingPlanDetail(planId).then(setPlan).catch(() => setPlan(null))
  }, [planId])

  const loadMails = useCallback(() => {
    api.onboardingPlanMails(planId).then((r) => setMails(r.mails || [])).catch(() => setMails([]))
  }, [planId])
  useEffect(() => { loadMails() }, [loadMails])

  // A step can carry more than one mail: the ISO course and its quiz, the training form and the
  // manager's. Group them so the row offers each by name rather than one nameless button.
  const mailsByStep = useMemo(() => {
    const m = new Map()
    for (const x of mails) {
      if (!m.has(x.step_key)) m.set(x.step_key, [])
      m.get(x.step_key).push(x)
    }
    return m
  }, [mails])

  async function patch(stepKey, body) {
    setBusy(stepKey)
    try {
      const up = await api.onboardingStepPatch(planId, stepKey, body)
      setPlan(up)
      onChanged?.()
    } catch (e) { toast(e.message, 'error') } finally { setBusy('') }
  }

  const byPhase = useMemo(() => {
    if (!plan) return []
    return phases
      .map((p) => ({ ...p, steps: plan.steps.filter((s) => s.phase === p.id) }))
      .filter((p) => p.steps.length)
  }, [plan, phases])

  return (
    <Modal open onClose={onClose} size="wide"
      title={plan ? `${plan.candidate_name} — onboarding` : 'Onboarding'}>
      {!plan ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Spinner className="h-4 w-4" /> Loading…</div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{plan.candidate_name}</p>
              <p className="text-xs text-slate-500">
                {plan.role || 'Role not set'} · joined {fmtDate(plan.joining_date) || 'date not set'}
              </p>
            </div>
            <Badge tone="violet">{plan.entity}</Badge>
            <div className="ml-auto w-56">
              <div className="flex items-center gap-2">
                <ProgressBar percent={plan.progress.percent} />
                <span className="shrink-0 text-xs font-medium tabular-nums text-slate-700">{plan.progress.percent}%</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {plan.progress.done} of {plan.progress.counted} done
                {plan.progress.total !== plan.progress.counted && ` · ${plan.progress.total - plan.progress.counted} marked N/A`}
              </p>
            </div>
          </div>

          {byPhase.map((p) => (
            <section key={p.id}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-800">{p.title}</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className={THEAD}>
                    <tr className={THEAD_ROW}>
                      <th scope="col" className={cx(TH, 'w-[38%]')}>Step</th>
                      <th scope="col" className={cx(TH, 'w-[22%]')}>Status</th>
                      <th scope="col" className={cx(TH, 'w-[16%]')}>Due</th>
                      <th scope="col" className={TH}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.steps.map((s) => {
                      const Icon = KIND_ICON[s.kind] || Check
                      return (
                        <tr key={s.key} className="border-b border-slate-100 last:border-0 align-top">
                          <td className={TD}>
                            <span className="flex items-start gap-2">
                              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                              <span className="min-w-0">
                                <span className="block font-medium text-slate-800">{s.label}</span>
                                {s.kind === 'mail' && (
                                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                    <span className={cx('text-[11px]', s.auto ? 'text-emerald-700' : 'text-slate-500')}>
                                      {s.auto ? 'Drafts itself' : 'HR writes it'}
                                    </span>
                                    {(mailsByStep.get(s.key) || []).map((m, _i, all) => (
                                      <button key={m.template_key} type="button"
                                        onClick={() => setComposing({ templateKey: m.template_key })}
                                        title={m.name}
                                        className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                                          'transition-colors duration-150 ease-snappy', focusRing,
                                          m.sent_at
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                            : 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100')}>
                                        {m.sent_at ? <Check className="h-3 w-3" aria-hidden /> : <Send className="h-3 w-3" aria-hidden />}
                                        {/* Two mails on one step need their own names; one does not. */}
                                        {all.length > 1 ? m.name : (m.sent_at ? `Sent ${fmtDate(m.sent_at)}` : 'Read & send')}
                                      </button>
                                    ))}
                                  </span>
                                )}
                                {s.note && <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{s.note}</span>}
                              </span>
                            </span>
                          </td>
                          <td className={TD}>
                            {s.kind === 'derived' ? (
                              <span className="text-sm font-medium tabular-nums text-slate-700">{plan.progress.percent}%</span>
                            ) : s.kind === 'source' ? (
                              <span className="text-xs text-slate-500">from {SOURCE_LABEL[s.source] || 'elsewhere'}</span>
                            ) : (
                              <select value={s.status} disabled={busy === s.key}
                                onChange={(e) => patch(s.key, { status: e.target.value })}
                                className={cx('h-8 rounded-full border px-2.5 text-xs font-medium outline-none',
                                  STATUS_TONE[s.status] || STATUS_TONE.Pending, focusRing)}>
                                {['Pending', 'Done', 'NA'].map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            )}
                          </td>
                          <td className={cx(TD, 'whitespace-nowrap')}>
                            {s.due_on ? (
                              <span className={cx('text-xs', s.overdue ? 'font-medium text-amber-700' : 'text-slate-600')}>
                                {fmtDate(s.due_on)}
                                {s.due_working_day && <span className="block text-[11px] text-slate-400">day {s.due_working_day}</span>}
                              </span>
                            ) : <span className={EMPTY}>—</span>}
                          </td>
                          <td className={TD}>
                            {(s.comments || s.comment_slots?.length) ? (
                              <div className="space-y-1.5">
                                {(s.comment_slots?.length ? s.comment_slots : ['']).map((slot) => (
                                  <label key={slot || 'note'} className="block">
                                    {slot && <span className="mb-0.5 block text-[11px] text-slate-500">{slot}</span>}
                                    <input
                                      defaultValue={(s.comments || {})[slot] || ''}
                                      placeholder="Add a note…"
                                      onBlur={(e) => {
                                        const next = { ...(s.comments || {}), [slot]: e.target.value }
                                        if (e.target.value !== ((s.comments || {})[slot] || '')) patch(s.key, { comments: next })
                                      }}
                                      className={cx(inputClass, 'h-8 py-0 text-xs')} />
                                  </label>
                                ))}
                              </div>
                            ) : s.kind === 'date' || s.kind === 'text' ? (
                              <input
                                type={s.kind === 'date' ? 'date' : 'text'} defaultValue={s.value || ''}
                                onBlur={(e) => { if (e.target.value !== (s.value || '')) patch(s.key, { value: e.target.value }) }}
                                className={cx(inputClass, 'h-8 py-0 text-xs')} />
                            ) : s.attendance ? (
                              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                                <input type="checkbox" checked={!!s.attended}
                                  onChange={(e) => patch(s.key, { attended: e.target.checked })}
                                  className="h-4 w-4 rounded border-slate-300 accent-brand-600" />
                                Attended
                              </label>
                            ) : <span className={EMPTY}>—</span>}
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
      )}

      {composing && (
        <MailComposer planId={planId} templateKey={composing.templateKey}
          onClose={() => setComposing(null)}
          onSent={() => { loadMails(); api.onboardingPlanDetail(planId).then(setPlan).catch(() => {}); onChanged?.() }} />
      )}
    </Modal>
  )
}

// ── View 2: the session catalogue ───────────────────────────────────────────────────────────

const SESSION_COLUMNS = [
  { key: 'name', label: 'Session', get: (s) => s.name },
  { key: 'frequency', label: 'Frequency', get: (s) => s.frequency },
  { key: 'mode', label: 'Where', get: (s) => s.mode },
  { key: 'entities', label: 'Entity', get: (s) => s.entities.join(', ') },
  { key: 'audience', label: 'To', get: (s) => s.audience },
  { key: 'mails', label: 'Mails', get: (s) => s.mails.map((m) => m.label).join(', ') },
]

function SessionsView({ sessions, frequencies, modes, onSchedule }) {
  const [q, setQ] = useState('')
  const colFilters = useColumnFilters()
  const label = (list, id) => list.find((x) => x.id === id)?.label || id

  const searched = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return sessions
    return sessions.filter((s) => SESSION_COLUMNS.some((c) => String(c.get(s) || '').toLowerCase().includes(n)))
  }, [sessions, q])
  const accessors = useMemo(() => Object.fromEntries(SESSION_COLUMNS.map((c) => [c.key, c.get])), [])
  const shown = useMemo(() => colFilters.apply(searched, accessors), [searched, colFilters, accessors])
  const values = useMemo(
    () => Object.fromEntries(SESSION_COLUMNS.map((c) => [c.key, distinctValues(sessions, c.get)])), [sessions])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a session…"
            className={cx(TOOLBAR, 'h-9 w-full pl-8 text-sm')} />
        </label>
        {colFilters.active > 0 && (
          <button type="button" onClick={colFilters.clear}
            className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">
            <span className="tabular-nums">{colFilters.active}</span> filtered
          </button>
        )}
        <span className="text-xs tabular-nums text-slate-500">{shown.length} of {sessions.length}</span>
      </div>

      <div className={TABLE_WRAP}>
        <div className="overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className={cx(THEAD, 'sticky top-0 z-10')}>
              <tr className={THEAD_ROW}>
                {SESSION_COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className={TH}>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      {c.label}
                      <ColumnFilter label={c.label} values={values[c.key]}
                        excluded={colFilters.filters[c.key] || []}
                        onChange={(a) => colFilters.setFilter(c.key, a)} />
                    </span>
                  </th>
                ))}
                <th scope="col" className={cx(TH, 'text-right')}>Schedule</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.key} className={cx('border-b border-slate-100 last:border-0', ROW_HOVER)}>
                  <td className={TD}>
                    <span className="block font-medium text-slate-800">{s.name}</span>
                    {s.note && <span className="block text-[11px] leading-relaxed text-slate-500">{s.note}</span>}
                  </td>
                  <td className={cx(TD, 'text-slate-600')}>{label(frequencies, s.frequency)}</td>
                  <td className={cx(TD, 'text-slate-600')}>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      {s.mode === 'remote' ? <Video className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        : <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden />}
                      {label(modes, s.mode)}
                    </span>
                  </td>
                  <td className={TD}>
                    <span className="flex flex-wrap gap-1">
                      {s.entities.map((e) => (
                        <span key={e} className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-px text-[11px] font-medium text-slate-600">{e}</span>
                      ))}
                    </span>
                  </td>
                  <td className={cx(TD, 'text-slate-600')}>{s.audience}</td>
                  <td className={TD}>
                    <span className="flex flex-wrap gap-1">
                      {s.mails.map((m) => (
                        <span key={m.key} className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                          <Mail className="h-3 w-3" aria-hidden />{m.label}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className={cx(TD, 'text-right')}>
                    <Button size="sm" variant="ghost" onClick={() => onSchedule(s)}>
                      <CalendarDays className="h-3.5 w-3.5" /> Schedule
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        Invites go out at 10:00 on the Friday a week before each sitting, as the People team set out.
        Scheduling one puts it on the calendar; the invite is sent from there.
      </p>
    </div>
  )
}

// ── View 3: the calendar ────────────────────────────────────────────────────────────────────

const monthKey = (v) => {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? 'Unscheduled'
    : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

// The five columns, in one place, so the header strip and every row cannot drift apart.
// Below md the grid collapses to a single column and each row stacks; nothing scrolls sideways.
const CAL_COLS = 'md:grid-cols-[5.75rem_minmax(0,1fr)_8rem_5.25rem_10.5rem]'

const dayKey = (v) => {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? 'nodate' : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

const fmtDay = (v) => {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? 'No date set'
    : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

const fmtTime = (v) => {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

const parseDay = (v) => {
  if (!v) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v))
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

const shortDay = (v) => {
  const t = parseDay(v)
  return t == null ? String(v || '')
    : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const shortStamp = (v) => {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v || '')
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function whereLabel(o) {
  if (o.mode === 'remote') return o.meet_link ? 'Google Meet' : 'Online'
  if (o.mode === 'both') return o.location ? `${o.location} and online` : 'On campus and online'
  return o.location || 'On campus'
}

function inviteState(o, today) {
  if (o.invites_sent_at) {
    return {
      key: 'sent', icon: Check, iconClass: 'text-emerald-600', textClass: 'text-slate-600',
      label: `Sent ${shortStamp(o.invites_sent_at)}`,
      full: `Invite sent ${shortStamp(o.invites_sent_at)}`,
    }
  }
  const due = parseDay(o.invite_due)
  if (due == null) return { key: 'none' }
  if (due <= today) {
    const isToday = due === today
    return {
      key: 'now', icon: AlertTriangle, iconClass: 'text-amber-700', textClass: 'font-medium text-amber-800',
      label: isToday ? 'Due today' : `Overdue since ${shortDay(o.invite_due)}`,
      full: isToday ? 'Invite due today' : `Invite overdue since ${shortDay(o.invite_due)}`,
    }
  }
  return {
    key: 'due', icon: Clock, iconClass: 'text-slate-500', textClass: 'text-slate-600',
    label: `Due ${shortDay(o.invite_due)}`,
    full: `Invite due ${shortDay(o.invite_due)}`,
  }
}

const needsInvite = (o, today) => {
  if (o.invites_sent_at) return false
  const due = parseDay(o.invite_due)
  return due != null && due <= today
}

function attendanceLabel(o) {
  const list = o.attendees || []
  if (!list.length) return { text: 'Nobody yet', dim: true }
  const marked = list.filter((a) => a.attended != null).length
  if (!marked) return { text: `${list.length} invited`, dim: false }
  return { text: `${list.filter((a) => a.attended).length} of ${list.length} came`, dim: false }
}

function primaryFor(o, past, inv, run) {
  if (inv.key !== 'sent') return { label: 'Send invite', icon: Mail, onSelect: run.mail }
  if (past && !(o.attendees || []).some((a) => a.attended != null)) {
    return { label: 'Mark who came', icon: ClipboardList, onSelect: run.came }
  }
  return { label: 'Open mails', icon: Mail, onSelect: run.mail }
}

function RowMenu({ label, items }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const W = 208
    const H = items.length * 36 + 8
    const left = Math.min(Math.max(8, r.right - W), Math.max(8, window.innerWidth - W - 8))
    const below = r.bottom + 6
    const top = below + H > window.innerHeight - 8 ? Math.max(8, r.top - 6 - H) : below
    setPos({ top, left, width: W })
  }, [open, items.length])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btnRef.current?.focus()
    }
    const onMove = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  useEffect(() => {
    if (open && pos) popRef.current?.querySelector('[role="menuitem"]')?.focus()
  }, [open, pos])

  const onMenuKey = (e) => {
    const all = [...(popRef.current?.querySelectorAll('[role="menuitem"]') || [])]
    if (!all.length) return
    const i = all.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); all[(i + 1) % all.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); all[(i - 1 + all.length) % all.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); all[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); all[all.length - 1]?.focus() }
    else if (e.key === 'Tab') setOpen(false)
  }

  const itemClass = cx(
    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700',
    'transition-colors duration-150 ease-snappy hover:bg-brand-50 hover:text-brand-800', focusRing,
  )

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More for ${label}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) } }}
        className={cx(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500',
          'transition-colors duration-150 ease-snappy hover:bg-slate-100 hover:text-slate-800',
          focusRing, open && 'bg-slate-100 text-slate-800',
        )}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open && pos && createPortal(
        <div
          ref={popRef}
          role="menu"
          aria-label={`Actions for ${label}`}
          onKeyDown={onMenuKey}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="menu-in z-[120] origin-top-right rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          {items.map((it) => {
            const Icon = it.icon
            return it.href ? (
              <a key={it.key} role="menuitem" href={it.href} target="_blank" rel="noreferrer"
                onClick={() => setOpen(false)} className={itemClass}>
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />{it.label}
              </a>
            ) : (
              <button key={it.key} type="button" role="menuitem"
                onClick={() => { setOpen(false); it.onSelect() }} className={itemClass}>
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />{it.label}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}

function SittingRow({ o, showDay, endsDay, today, now, onMail, onOpen, onReschedule }) {
  const start = new Date(o.starts_at)
  const valid = !Number.isNaN(start.getTime())
  const past = valid && start.getTime() < now

  const inv = inviteState(o, today)
  const came = attendanceLabel(o)
  const run = { mail: () => onMail(o), came: () => onOpen(o), move: () => onReschedule(o) }
  const primary = primaryFor(o, past, inv, run)

  const PrimaryIcon = primary.icon
  const InviteIcon = inv.icon
  const ModeIcon = o.mode === 'remote' ? Video : MapPin

  const items = [
    { key: 'mail', label: 'Open mails', icon: Mail, onSelect: run.mail },
    { key: 'came', label: 'Mark who came', icon: ClipboardList, onSelect: run.came },
    { key: 'move', label: 'Move this sitting', icon: CalendarDays, onSelect: run.move },
  ]
  if (o.meet_link) items.push({ key: 'link', label: 'Open the meet link', icon: Video, href: o.meet_link })

  return (
    <li
      className={cx(
        'grid grid-cols-1 gap-y-1 px-3 py-2.5',
        'md:items-center md:gap-x-3 md:gap-y-0', CAL_COLS,
        ROW_HOVER, endsDay ? ROW_GROUP : ROW, 'last:border-b-0',
      )}
    >
      {/* Sitting */}
      <div className="min-w-0 md:col-start-2 md:row-start-1">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium text-slate-900">{o.name}</span>
          {o.entity && (
            <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-px text-[11px] font-medium text-slate-600">
              {o.entity}
            </span>
          )}
        </p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-slate-600">
          <ModeIcon className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
          <span className="min-w-0 truncate">{whereLabel(o)}</span>
        </p>
      </div>

      {/* When. On a phone every row carries its own day; on a wide screen the day is set once. */}
      <div className="md:col-start-1 md:row-start-1">
        <span className="flex items-center gap-1.5 text-[11px] text-slate-600 md:hidden">
          <Clock className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
          {valid ? `${fmtDay(o.starts_at)} · ${fmtTime(o.starts_at)}` : 'No date set'}
        </span>
        <span className="hidden md:block">
          {showDay && (
            <span className={cx('block text-[13px] font-semibold leading-tight',
              past ? 'text-slate-600' : 'text-slate-900')}>
              {fmtDay(o.starts_at)}
            </span>
          )}
          {valid && (
            <span className="block text-xs leading-tight tabular-nums text-slate-600">
              {fmtTime(o.starts_at)}
            </span>
          )}
        </span>
      </div>

      {/* Invite */}
      <div className="md:col-start-3 md:row-start-1">
        {inv.key === 'none' ? (
          <span className="text-[11px] text-slate-500">No invite date</span>
        ) : (
          <span className={cx('flex items-start gap-1.5 text-[11px] leading-tight md:text-xs', inv.textClass)}>
            <InviteIcon className={cx('mt-px h-3.5 w-3.5 shrink-0', inv.iconClass)} aria-hidden />
            <span className="md:hidden">{inv.full}</span>
            <span className="hidden md:inline">{inv.label}</span>
          </span>
        )}
      </div>

      {/* Who came */}
      <div className="md:col-start-4 md:row-start-1">
        <span className={cx('text-[11px] leading-tight tabular-nums',
          came.dim ? 'text-slate-500' : 'text-slate-600')}>
          {came.text}
        </span>
      </div>

      {/* Next step */}
      <div className="mt-1 flex items-center gap-1 md:col-start-5 md:row-start-1 md:mt-0 md:justify-end">
        <Button size="sm" variant="ghost" onClick={primary.onSelect}
          className="min-w-[7.5rem] justify-center whitespace-nowrap">
          <PrimaryIcon className="h-3.5 w-3.5" aria-hidden />{primary.label}
        </Button>
        <RowMenu label={o.name} items={items} />
      </div>
    </li>
  )
}

function CalendarView({ occurrences, onReschedule, onOpen, onMail }) {
  const [month, setMonth] = useState('')
  const [q, setQ] = useState('')
  const [onlyDue, setOnlyDue] = useState(false)

  const today = useMemo(() => startOfToday(), [])
  const now = Date.now()

  const months = useMemo(
    () => [...new Set(occurrences.map((o) => monthKey(o.starts_at)))], [occurrences])

  const dueCount = useMemo(
    () => occurrences.filter((o) => needsInvite(o, today)).length, [occurrences, today])

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return occurrences
      .filter((o) => (!month || monthKey(o.starts_at) === month))
      .filter((o) => !onlyDue || needsInvite(o, today))
      .filter((o) => !n || [o.name, o.location, o.entity, whereLabel(o)]
        .some((v) => String(v || '').toLowerCase().includes(n)))
      .sort((a, b) => {
        const ta = new Date(a.starts_at).getTime()
        const tb = new Date(b.starts_at).getTime()
        if (Number.isNaN(ta)) return Number.isNaN(tb) ? 0 : 1
        if (Number.isNaN(tb)) return -1
        return ta - tb
      })
  }, [occurrences, month, q, onlyDue, today])

  const byMonth = useMemo(() => {
    const m = new Map()
    for (const o of shown) {
      const key = monthKey(o.starts_at)
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(o)
    }
    return [...m.entries()]
  }, [shown])

  const reset = () => { setQ(''); setMonth(''); setOnlyDue(false) }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sittings"
            placeholder="Search a sitting…" className={cx(TOOLBAR, 'h-9 w-full pl-8 text-sm')} />
        </label>

        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Show one month"
          className={cx(TOOLBAR, 'h-9')}>
          <option value="">Every month</option>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        {/* The only task on the page, so the only warm colour on it. A filter, not a badge. */}
        {(dueCount > 0 || onlyDue) && (
          <button type="button" aria-pressed={onlyDue} onClick={() => setOnlyDue((v) => !v)}
            className={cx(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium',
              'transition-colors duration-150 ease-snappy', focusRing,
              onlyDue ? 'border-amber-400 bg-amber-100 text-amber-900'
                : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100',
            )}>
            <Mail className="h-3.5 w-3.5" aria-hidden />
            <span className="tabular-nums">{dueCount}</span>
            {dueCount === 1 ? 'invite to send' : 'invites to send'}
          </button>
        )}

        <span className="ml-auto shrink-0 text-xs tabular-nums text-slate-600">
          {shown.length === occurrences.length
            ? `${occurrences.length} sitting${occurrences.length === 1 ? '' : 's'}`
            : `${shown.length} of ${occurrences.length}`}
        </span>
      </div>

      {!occurrences.length ? (
        <EmptyState icon={CalendarDays} title="Nothing is scheduled yet"
          description="Pick a session on the Sessions tab and schedule a sitting; it appears here." />
      ) : (
        <>
          <div className={TABLE_WRAP}>
            <div className={cx('hidden gap-x-3 border-b border-brand-200 bg-brand-100 px-3 py-2 md:grid', CAL_COLS)}>
              <span className={TH_TYPE}>When</span>
              <span className={TH_TYPE}>Sitting</span>
              <span className={TH_TYPE}>Invite</span>
              <span className={TH_TYPE}>Who came</span>
              <span className={cx(TH_TYPE, 'text-right')}>Next step</span>
            </div>

            {!shown.length ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-slate-600">No sittings match that.</p>
                <button type="button" onClick={reset}
                  className={cx('mt-2 rounded px-1 py-0.5 text-xs font-medium text-brand-700 underline underline-offset-2',
                    'transition-colors duration-150 ease-snappy hover:text-brand-800', focusRing)}>
                  Clear the filters
                </button>
              </div>
            ) : byMonth.map(([m, list], mi) => (
              <section key={m}>
                <h3 className={cx('flex items-baseline justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2',
                  mi > 0 && 'border-t')}>
                  <span className="text-[13px] font-semibold text-brand-900">{m}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-600">
                    {list.length} {list.length === 1 ? 'sitting' : 'sittings'}
                  </span>
                </h3>
                <ul>
                  {list.map((o, i) => (
                    <SittingRow
                      key={o.id}
                      o={o}
                      showDay={i === 0 || dayKey(o.starts_at) !== dayKey(list[i - 1].starts_at)}
                      endsDay={i === list.length - 1 || dayKey(o.starts_at) !== dayKey(list[i + 1].starts_at)}
                      today={today}
                      now={now}
                      onMail={onMail}
                      onOpen={onOpen}
                      onReschedule={onReschedule}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <p className="text-xs leading-relaxed text-slate-600">
            Every invite is due on the Friday a week before its sitting. Open the mails on a row to send it.
          </p>
        </>
      )}
    </div>
  )
}

/** Schedule a new sitting, or move one. */
function SittingModal({ session, occurrence, onClose, onSaved }) {
  const { toast } = useToast()
  const editing = !!occurrence
  const [when, setWhen] = useState(() => {
    const v = occurrence?.starts_at ? new Date(occurrence.starts_at) : null
    if (!v || Number.isNaN(v.getTime())) return ''
    return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
  const [entity, setEntity] = useState(occurrence?.entity || session?.entities?.[0] || 'EZ')
  const [location, setLocation] = useState(occurrence?.location || '')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!when) { toast('Pick a date and time', 'error'); return }
    setBusy(true)
    try {
      const saved = editing
        ? await api.onboardingUpdateOccurrence(occurrence.id, { starts_at: new Date(when).toISOString(), location })
        : await api.onboardingCreateOccurrence({
          session_key: session.key, entity, starts_at: new Date(when).toISOString(), location,
        })
      toast(editing ? 'Sitting moved' : 'Sitting scheduled')
      onSaved(saved)
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} size="md"
      title={editing ? `Move ${occurrence.name}` : `Schedule ${session.name}`}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {editing ? 'Move it' : 'Schedule'}
          </Button>
        </div>
      }>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800">When</span>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputClass} />
        </label>
        {!editing && (session?.entities?.length > 1) && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-800">Entity</span>
            <select value={entity} onChange={(e) => setEntity(e.target.value)} className={inputClass}>
              {session.entities.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800">Where</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)}
            placeholder={session?.mode === 'remote' ? 'A meeting link' : 'Room or office'} className={inputClass} />
        </label>
        <p className="text-xs leading-relaxed text-slate-500">
          The invite is due at 10:00 on the Friday a week before, and moves with the sitting.
        </p>
      </div>
    </Modal>
  )
}

/** Who was invited and who came. Attendance decides who gets the feedback mail. */
function AttendanceModal({ occurrence, onClose, onSaved }) {
  const { toast } = useToast()
  const [occ, setOcc] = useState(occurrence)
  const [busy, setBusy] = useState(0)

  async function mark(id, attended) {
    setBusy(id)
    try {
      const up = await api.onboardingMarkAttendance(id, attended)
      setOcc(up)
      onSaved?.(up)
    } catch (e) { toast(e.message, 'error') } finally { setBusy(0) }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={`${occ.name} — who came`}>
      {occ.attendees.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Nobody has been invited to this sitting yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className={THEAD}>
              <tr className={THEAD_ROW}>
                <th scope="col" className={TH}>Name</th>
                <th scope="col" className={TH}>Email</th>
                <th scope="col" className={TH}>Came</th>
              </tr>
            </thead>
            <tbody>
              {occ.attendees.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0">
                  <td className={cx(TD, 'font-medium text-slate-800')}>{a.name || <span className={EMPTY}>—</span>}</td>
                  <td className={cx(TD, 'text-slate-600')}>{a.email || <span className={EMPTY}>—</span>}</td>
                  <td className={TD}>
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={!!a.attended} disabled={busy === a.id}
                        onChange={(e) => mark(a.id, e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 accent-brand-600" />
                      Attended
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        The feedback mail goes by this list, so it reaches the people who were actually there.
      </p>
    </Modal>
  )
}

// ── The page ────────────────────────────────────────────────────────────────────────────────

/** The mails one sitting sends: the invite, and whatever follows it. */
function SessionMailsModal({ occurrence, mails, onClose, onSent }) {
  const [composing, setComposing] = useState(null)
  const mine = mails.filter((m) => m.session_key === occurrence.session_key
    && (m.mode === 'both' || m.mode === (occurrence.mode || 'campus')))

  return (
    <Modal open onClose={onClose} title={`${occurrence.name} — mails`}>
      <div className="space-y-2">
        <p className="text-xs text-slate-500">
          {fmtDateTime(occurrence.starts_at)} · {occurrence.attendees.length} invited
          {occurrence.invite_due && ` · invite due ${fmtDate(occurrence.invite_due)}`}
        </p>
        {mine.map((m) => (
          <button key={m.key} type="button" onClick={() => setComposing(m.key)}
            className={cx('flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left',
              'transition-colors duration-150 ease-snappy hover:border-brand-300 hover:bg-brand-50/50', focusRing)}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Mail className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-800">{m.name}</span>
              <span className="block truncate text-xs text-slate-500">
                {m.session_role === 'invite'
                  ? 'Goes to everyone invited'
                  : 'Goes to the people who came'}
              </span>
            </span>
            {m.session_role === 'invite' && occurrence.invites_sent_at
              ? <Badge tone="emerald">Sent</Badge>
              : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
          </button>
        ))}
      </div>
      {composing && (
        <MailComposer occurrenceId={occurrence.id} templateKey={composing}
          onClose={() => setComposing(null)} onSent={onSent} />
      )}
    </Modal>
  )
}

// ── View 4: every mail, and which ones write themselves ─────────────────────────────────────

const MAIL_COLUMNS = [
  { key: 'who', label: 'For', get: (r) => r.who || '' },
  { key: 'name', label: 'Mail', get: (r) => r.name || '' },
  { key: 'kind', label: 'Kind', get: (r) => r.kind || '' },
  { key: 'sending', label: 'Sending', get: (r) => r.sending || '' },
  { key: 'to', label: 'Goes to', get: (r) => r.to || '' },
  { key: 'entity', label: 'Entity', get: (r) => r.entity || '' },
  { key: 'due', label: 'Due', get: (r) => (r.due_on ? fmtDate(r.due_on) : '') },
  { key: 'state', label: 'State', get: (r) => r.state || '' },
  { key: 'missing', label: 'Ready', get: (r) => (r.missing?.length ? 'Needs a field' : 'Ready') },
]

const STATE_TONE = {
  Sent: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Overdue: 'border-amber-200 bg-amber-50 text-amber-800',
  'Due today': 'border-brand-200 bg-brand-50 text-brand-800',
  Waiting: 'border-slate-200 bg-slate-50 text-slate-600',
}

function MailsView({ rows, onOpen }) {
  const [q, setQ] = useState('')
  const colFilters = useColumnFilters()

  const searched = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return rows
    return rows.filter((r) => MAIL_COLUMNS.some((c) => String(c.get(r) || '').toLowerCase().includes(n)))
  }, [rows, q])
  const accessors = useMemo(() => Object.fromEntries(MAIL_COLUMNS.map((c) => [c.key, c.get])), [])
  const shown = useMemo(() => colFilters.apply(searched, accessors), [searched, colFilters, accessors])
  const values = useMemo(
    () => Object.fromEntries(MAIL_COLUMNS.map((c) => [c.key, distinctValues(rows, c.get)])), [rows])

  const autoCount = rows.filter((r) => r.sending === 'Automatic').length

  if (!rows.length) {
    return (
      <EmptyState icon={Mail} title="No mails yet"
        description="Mails appear here once somebody is on onboarding or a session has a sitting on the calendar." />
    )
  }

  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <strong className="font-semibold text-slate-800">{autoCount}</strong> of these {rows.length} draft
        themselves from the candidate&rsquo;s own details; the rest are written by hand. None of them
        leaves without somebody opening it and pressing send.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a mail…"
            className={cx(TOOLBAR, 'h-9 w-full pl-8 text-sm')} />
        </label>
        {colFilters.active > 0 && (
          <button type="button" onClick={colFilters.clear}
            className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">
            <span className="tabular-nums">{colFilters.active}</span> filtered
          </button>
        )}
        <span className="text-xs tabular-nums text-slate-500">{shown.length} of {rows.length}</span>
      </div>

      <div className={TABLE_WRAP}>
        <div className="overflow-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
            <thead className={cx(THEAD, 'sticky top-0 z-10')}>
              <tr className={THEAD_ROW}>
                {MAIL_COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className={TH}>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      {c.label}
                      <ColumnFilter label={c.label} values={values[c.key]}
                        excluded={colFilters.filters[c.key] || []}
                        onChange={(a) => colFilters.setFilter(c.key, a)} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={`${r.plan_id || r.occurrence_id}-${r.template_key}-${i}`}
                  onClick={() => onOpen(r)}
                  className={cx('cursor-pointer border-b border-slate-100 last:border-0', ROW_HOVER)}>
                  <td className={TD}><span className="block truncate font-medium text-slate-800">{r.who}</span></td>
                  <td className={cx(TD, 'text-slate-700')}>
                    <span className="block truncate">{r.name}</span>
                    {r.step_label && <span className="block truncate text-[11px] text-slate-500">{r.step_label}</span>}
                  </td>
                  <td className={cx(TD, 'text-slate-600')}>{r.kind}</td>
                  <td className={TD}>
                    <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      r.sending === 'Automatic'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-600')}>
                      {r.sending}
                    </span>
                  </td>
                  <td className={cx(TD, 'capitalize text-slate-600')}>{r.to}</td>
                  <td className={TD}>
                    <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-px text-[11px] font-medium text-slate-600">{r.entity}</span>
                  </td>
                  <td className={cx(TD, 'whitespace-nowrap text-slate-600')}>
                    {r.due_on ? fmtDate(r.due_on) : <span className={EMPTY}>—</span>}
                  </td>
                  <td className={TD}>
                    <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      STATE_TONE[r.state] || STATE_TONE.Waiting)}>
                      {r.state}
                    </span>
                  </td>
                  <td className={TD}>
                    {r.missing?.length
                      ? <span className="text-[11px] text-amber-700" title={r.missing.join(', ')}>Needs {r.missing.join(', ')}</span>
                      : <span className="text-[11px] text-slate-500">Ready</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const TABS = [
  { id: 'candidates', label: 'Candidates', icon: Users },
  { id: 'sessions', label: 'Sessions', icon: ClipboardList },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'mails', label: 'Mails', icon: Mail },
]

export default function Onboarding() {
  usePageTitle('Onboarding')
  const [tab, setTab] = useState('candidates')
  const [defs, setDefs] = useState(null)
  const [board, setBoard] = useState(null)
  const [occurrences, setOccurrences] = useState([])
  const [openPlan, setOpenPlan] = useState(null)
  const [scheduling, setScheduling] = useState(null)   // { session } | { occurrence }
  const [attendance, setAttendance] = useState(null)
  const [formsOpen, setFormsOpen] = useState(false)
  const [mails, setMails] = useState(null)
  const [sessionMails, setSessionMails] = useState(null)   // an occurrence
  const [composing, setComposing] = useState(null)         // a row from the mails table

  const loadBoard = () => api.onboardingBoard().then(setBoard).catch(() => setBoard([]))
  const loadOccurrences = () => api.onboardingOccurrences().then(setOccurrences).catch(() => setOccurrences([]))
  const loadMails = () => api.onboardingAllMails().then(setMails).catch(() => setMails([]))

  useEffect(() => {
    api.onboardingDefinitions().then(setDefs).catch(() => setDefs({ steps: [], sessions: [], phases: [] }))
    loadBoard()
    loadOccurrences()
    loadMails()
  }, [])

  const totals = useMemo(() => {
    const rows = board || []
    return {
      people: rows.length,
      overdue: rows.filter((r) => r.overdue).length,
      sittings: occurrences.filter((o) => new Date(o.starts_at) >= new Date()).length,
      mails: (mails || []).filter((m) => m.state === 'Due today' || m.state === 'Overdue').length,
    }
  }, [board, occurrences, mails])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Onboarding"
        subtitle="Every new joiner's first hundred days, the sessions EZ runs, and what is happening when."
        action={
          <Button variant="ghost" onClick={() => setFormsOpen(true)}>
            <ClipboardList className="h-3.5 w-3.5" /> Onboarding form
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'On onboarding', value: totals.people, icon: Users, tint: 'bg-brand-50 text-brand-700' },
          { label: 'With something overdue', value: totals.overdue, icon: AlertTriangle, tint: totals.overdue ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500' },
          { label: 'Sittings coming up', value: totals.sittings, icon: CalendarDays, tint: 'bg-slate-100 text-slate-600' },
          { label: 'Mails to send', value: totals.mails, icon: Mail, tint: totals.mails ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500', tab: 'mails' },
        ].map((s) => {
          const body = (
            <Card className="flex h-full items-center gap-3 p-4">
              <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', s.tint)}>
                <s.icon className="h-4.5 w-4.5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xl font-semibold leading-none tabular-nums text-slate-900">{s.value}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{s.label}</p>
              </div>
            </Card>
          )
          // Card renders a plain div and forwards no handlers, so a clickable stat has to be a
          // real button around it rather than a div that merely looks pressable.
          return s.tab ? (
            <button key={s.label} type="button" onClick={() => setTab(s.tab)}
              className={cx('rounded-2xl text-left transition-transform duration-150 ease-snappy hover:-translate-y-0.5', focusRing)}>
              {body}
            </button>
          ) : <div key={s.label}>{body}</div>
        })}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={cx('inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150 ease-snappy',
              tab === t.id ? 'border-brand-600 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800',
              focusRing)}>
            <t.icon className="h-3.5 w-3.5" aria-hidden />{t.label}
          </button>
        ))}
      </div>

      {tab === 'candidates' && (
        board === null
          ? <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>
          : <CandidatesView rows={board} onOpen={(r) => setOpenPlan(r.plan_id)} />
      )}

      {tab === 'sessions' && (
        !defs ? <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>
          : <SessionsView sessions={defs.sessions} frequencies={defs.frequencies || []}
              modes={defs.modes || []} onSchedule={(s) => setScheduling({ session: s })} />
      )}

      {tab === 'calendar' && (
        <CalendarView occurrences={occurrences}
          onReschedule={(o) => setScheduling({ occurrence: o })}
          onOpen={(o) => setAttendance(o)}
          onMail={(o) => setSessionMails(o)} />
      )}

      {tab === 'mails' && (
        mails === null
          ? <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>
          : <MailsView rows={mails} onOpen={(r) => {
              if (r.occurrence_id) {
                const occ = occurrences.find((o) => o.id === r.occurrence_id)
                if (occ) setSessionMails(occ)
              } else {
                setComposing({ planId: r.plan_id, templateKey: r.template_key })
              }
            }} />
      )}

      {openPlan && defs && (
        <ChecklistModal planId={openPlan} phases={defs.phases || []}
          onClose={() => setOpenPlan(null)} onChanged={() => { loadBoard(); loadMails() }} />
      )}
      {sessionMails && defs && (
        <SessionMailsModal occurrence={sessionMails} mails={defs.mails || []}
          onClose={() => setSessionMails(null)}
          onSent={() => { loadOccurrences(); loadMails() }} />
      )}
      {composing && (
        <MailComposer planId={composing.planId} templateKey={composing.templateKey}
          onClose={() => setComposing(null)}
          onSent={() => { loadMails(); loadBoard() }} />
      )}
      {scheduling && (
        <SittingModal session={scheduling.session} occurrence={scheduling.occurrence}
          onClose={() => setScheduling(null)}
          onSaved={() => { setScheduling(null); loadOccurrences(); setTab('calendar') }} />
      )}
      {attendance && (
        <AttendanceModal occurrence={attendance} onClose={() => setAttendance(null)}
          onSaved={loadOccurrences} />
      )}
      <OnboardingFormsModal key={formsOpen ? 'o' : 'c'} open={formsOpen} onClose={() => setFormsOpen(false)} />
    </div>
  )
}
