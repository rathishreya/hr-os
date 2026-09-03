// Onboarding, rebuilt around the People team's own process.
//
// Three views, because there are three questions: where is this new joiner up to, what sessions
// does EZ run, and what is happening when. They are tabs on one page rather than three routes,
// because the answer to one is usually the reason you opened another.
//
// Every list filters through the same faceted machinery the rest of the app uses, and everything
// is entity-scoped: the API returns only the steps a candidate's entity has, so ArabEasy simply
// does not have a go-to-person row to hide.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, Clock, Filter,
  Inbox, Link2 as LinkIcon, Mail, MapPin, PencilLine, Plus, Search, Send,
  Table as TableIcon, Users, Video,
} from 'lucide-react'
import { api } from '../api'
import { Badge, Button, Card, EmptyState, IconButton, Modal, PageHeader, Spinner, cx, focusRing, inputClass } from '../ui'
import { EMPTY, ROW_HOVER, TABLE_WRAP, TD, TH, THEAD, THEAD_ROW } from '../components/tableStyles'
import { ColumnFilter, distinctValues, useColumnFilters } from '../components/tableFilters'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'
import OnboardingFormsModal from '../components/onboarding/OnboardingFormsModal'

const TOOLBAR = cx('h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none',
  'transition-colors duration-150 ease-snappy hover:border-slate-300 focus:border-brand-500', focusRing)

// "Nobody has taken the register yet" is a different fact from "they did not come", and a tick
// could only ever say two of the three.
const ATTENDANCE_TONE = {
  Attended: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'Did not attend': 'border-amber-200 bg-amber-50 text-amber-800',
  NA: 'border-slate-200 bg-slate-100 text-slate-500',
}

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

// A box labelled "Notes" is not where anybody looks to name a go-to person. These are the
// prompts that say what the row wants.
const PROMPTS = {
  go_to_person: 'Name of the go-to person',
  lwd: 'Last working day at their old place',
  induction_session: 'Date of the induction session',
  performance_buddy: 'Date of the performance buddy meeting',
  linkedin_update: 'Their LinkedIn profile',
  joining_date: 'The date they join',
  candidate_name: 'Their name',
  role: 'The role they were hired into',
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

function CandidatesView({ rows, onOpen, mails, onChanged }) {
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState(() => new Set())
  const [mailing, setMailing] = useState(false)
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

  // Selecting follows what you can see: tick the header box after filtering and you get the
  // filtered people, not everyone.
  const allShown = shown.length > 0 && shown.every((r) => chosen.has(r.plan_id))
  function toggle(id) {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAll() {
    setChosen((prev) => {
      const next = new Set(prev)
      if (allShown) shown.forEach((r) => next.delete(r.plan_id))
      else shown.forEach((r) => next.add(r.plan_id))
      return next
    })
  }

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
                <th scope="col" className={cx(TH, 'w-9')}>
                  <input type="checkbox" checked={allShown} onChange={toggleAll}
                    aria-label={allShown ? 'Clear selection' : 'Select everyone shown'}
                    className={cx('h-4 w-4 rounded border-slate-300 accent-brand-600', focusRing)} />
                </th>
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
                  className={cx('cursor-pointer border-b border-slate-100 last:border-0', ROW_HOVER,
                    chosen.has(r.plan_id) && 'bg-brand-50/50')}>
                  <td className={TD} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={chosen.has(r.plan_id)}
                      onChange={() => toggle(r.plan_id)}
                      aria-label={`Select ${r.candidate_name}`}
                      className={cx('h-4 w-4 rounded border-slate-300 accent-brand-600', focusRing)} />
                  </td>
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

      {chosen.size > 0 && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 shadow-card">
          <span className="text-sm font-medium text-slate-800">{chosen.size} selected</span>
          <button type="button" onClick={() => setChosen(new Set())}
            className={cx('rounded px-1 text-xs text-slate-500 hover:text-slate-800', focusRing)}>
            Clear
          </button>
          <div className="ml-auto">
            <Button size="sm" onClick={() => setMailing(true)}>
              <Send className="h-3.5 w-3.5" /> Send a mail
            </Button>
          </div>
        </div>
      )}

      {mailing && (
        <BulkMailModal planIds={[...chosen]} templates={mails || []}
          onClose={() => setMailing(false)}
          onSent={() => { setChosen(new Set()); onChanged?.() }} />
      )}
    </div>
  )
}

/** Send one mail to several joiners at once.
 *
 * The mail is the same; the letters are not. Each one is rendered from that person's own
 * paperwork, so this shows a real draft for the first of them rather than a template with the
 * tokens still in, and says plainly who will not be getting it and why. The commonest reason is
 * that they work remotely and there is a remote version of the same mail. */
function BulkMailModal({ planIds, templates, onClose, onSent }) {
  const { toast } = useToast()
  const [key, setKey] = useState('')
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  // Only the mails that belong to a step: a session's invite goes out from the calendar, where
  // the sitting and its date live.
  const choices = useMemo(
    () => templates.filter((t) => t.step_key).sort((a, b) => a.name.localeCompare(b.name)),
    [templates])

  // Fetched when the choice is made rather than in an effect: the preview answers a click, not a
  // render, and doing it here keeps the two in step without a cascade.
  async function pick(next) {
    setKey(next)
    setPreview(null)
    if (!next) return
    setLoading(true)
    try {
      setPreview(await api.onboardingBulkMailPreview(planIds, next))
    } catch (e) { toast(e.message, 'error') } finally { setLoading(false) }
  }

  async function send() {
    setSending(true)
    try {
      const res = await api.onboardingBulkMailSend(planIds, key)
      toast(`Sent to ${res.sent.length} ${res.sent.length === 1 ? 'person' : 'people'}`,
        res.sent.length ? 'success' : 'error')
      if (res.failed?.length) toast(`${res.failed.length} did not go out`, 'error')
      onSent?.()
      onClose()
    } catch (e) { toast(e.message, 'error') } finally { setSending(false) }
  }

  const going = preview?.recipients?.length || 0

  return (
    <Modal open onClose={onClose} size="wide"
      title={`Send a mail to ${planIds.length} ${planIds.length === 1 ? 'joiner' : 'joiners'}`}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Which mail
          </span>
          <select value={key} onChange={(e) => pick(e.target.value)}
            className={cx(inputClass, 'h-9 text-sm')}>
            <option value="">Choose one…</option>
            {choices.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
        </label>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Spinner className="h-4 w-4" /> Working out who it reaches…
          </div>
        )}

        {preview && !loading && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Goes to {going}
                </p>
                <ul className="mt-1.5 space-y-1 text-xs text-slate-700">
                  {preview.recipients.map((r) => (
                    <li key={r.plan_id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{r.name}</span>
                      {r.sent_at
                        ? <span className="shrink-0 text-[11px] text-amber-700">already sent</span>
                        : <span className="shrink-0 truncate text-[11px] text-slate-400">{r.to}</span>}
                    </li>
                  ))}
                  {!going && <li className="text-slate-500">Nobody, for the reasons opposite.</li>}
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Not going to {preview.skipped.length}
                </p>
                <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
                  {preview.skipped.map((s) => (
                    <li key={s.plan_id}>
                      <span className="font-medium text-slate-800">{s.name}</span> — {s.why}
                    </li>
                  ))}
                  {!preview.skipped.length && <li className="text-slate-500">Everyone gets it.</li>}
                </ul>
              </div>
            </div>

            {preview.recipients.some((r) => r.sent_at) && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Some of these have had this mail already. Sending again sends a second copy.
              </p>
            )}

            {preview.sample && (
              <div className="rounded-xl border border-slate-200">
                <div className="border-b border-slate-100 px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    What {preview.sample.for} will get
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    To {preview.sample.to}
                    {preview.sample.cc?.length ? ` · Cc ${preview.sample.cc.join(', ')}` : ''}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{preview.sample.subject}</p>
                </div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-3 py-2.5 font-sans text-xs leading-relaxed text-slate-700">
                  {preview.sample.body}
                </pre>
                <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
                  Everyone else gets the same letter with their own name, date and manager in it.
                </p>
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={sending || !going}>
            {sending ? <Spinner className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            Send {going ? `to ${going}` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** A textarea with the formatting buttons above it.
 *
 * The letters are stored as markup so they stay editable in a plain box and diff cleanly, but
 * nobody should have to remember that bold is an asterisk. These buttons wrap whatever is
 * selected, put the cursor back where it was, and leave the text as the same markup a person could
 * have typed. */
function RichTextArea({ value, onChange, rows = 18, label = 'Message', links = [] }) {
  const ref = useRef(null)

  function wrap(before, after = before) {
    const el = ref.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b } = el
    const chosen = value.slice(a, b)
    // Pressing the same button again on wrapped text unwraps it, which is what people expect from
    // a bold button and what stops markers piling up.
    const already = value.slice(a - before.length, a) === before
      && value.slice(b, b + after.length) === after
    const next = already
      ? value.slice(0, a - before.length) + chosen + value.slice(b + after.length)
      : value.slice(0, a) + before + (chosen || 'text') + after + value.slice(b)
    onChange(next)
    const shift = already ? -before.length : before.length
    requestAnimationFrame(() => {
      el.focus()
      const start = a + shift
      el.setSelectionRange(start, start + (chosen || 'text').length)
    })
  }

  function insert(text) {
    const el = ref.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b } = el
    const next = value.slice(0, a) + text + value.slice(b)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(a + text.length, a + text.length)
    })
  }

  function addLink() {
    const el = ref.current
    if (!el) return
    const chosen = value.slice(el.selectionStart, el.selectionEnd) || 'these words'
    const target = window.prompt(
      'Link to an address (https://…), or to one of the saved links by name:\n\n'
      + links.slice(0, 12).map((l) => `#${l.key}  — ${l.label}`).join('\n'))
    if (!target) return
    const t = target.trim()
    const { selectionStart: a, selectionEnd: b } = el
    const md = `[${chosen}](${t.startsWith('#') || t.startsWith('http') ? t : `https://${t}`})`
    onChange(value.slice(0, a) + md + value.slice(b))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + md.length, a + md.length) })
  }

  const TOOL = cx('inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs',
    'text-slate-600 transition-colors duration-150 ease-snappy hover:bg-slate-100 hover:text-slate-900',
    focusRing)

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <button type="button" onClick={() => wrap('*')} title="Bold" aria-label="Bold"
          className={cx(TOOL, 'font-bold')}>B</button>
        <button type="button" onClick={() => wrap('/')} title="Italic" aria-label="Italic"
          className={cx(TOOL, 'italic font-serif')}>I</button>
        <button type="button" onClick={() => wrap('_')} title="Underline" aria-label="Underline"
          className={cx(TOOL, 'underline')}>U</button>
        <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden />
        <button type="button" onClick={addLink} title="Add a link" aria-label="Add a link"
          className={TOOL}><LinkIcon className="h-3.5 w-3.5" aria-hidden /></button>
        <button type="button" title="Insert a table" aria-label="Insert a table" className={TOOL}
          onClick={() => insert('\n| Heading | Heading |\n| Cell | Cell |\n')}>
          <TableIcon className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <textarea ref={ref} value={value} rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className={cx(inputClass, 'resize-y font-sans text-sm leading-relaxed')} />
      <p className="mt-1 text-[11px] text-slate-500">
        Select some words and press a button, or type it: *bold*, /italic/, _underline_,
        [words](#link-name). A row of | cells | makes a table.
      </p>
    </div>
  )
}

/** The link register: every phrase in these letters that carries a link, and where it points.
 *
 * The People team's document hyperlinked words like "Take the Test" without ever showing the
 * address, so those cannot be transcribed. They are listed here, once, rather than left as dead
 * words in every letter that mentions them. Filling one in fixes it everywhere. */
function LinksModal({ onClose, onChanged }) {
  const { toast } = useToast()
  const [rows, setRows] = useState(null)
  const [saving, setSaving] = useState('')

  useEffect(() => {
    api.onboardingLinks().then((r) => setRows(r.links)).catch(() => setRows([]))
  }, [])

  async function save(key, url) {
    setSaving(key)
    try {
      await api.onboardingSetLink(key, url)
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, url, needs_a_url: !url } : r)))
      onChanged?.()
    } catch (e) { toast(e.message, 'error') } finally { setSaving('') }
  }

  const needed = (rows || []).filter((r) => r.needs_a_url)
  const known = (rows || []).filter((r) => !r.needs_a_url)

  return (
    <Modal open onClose={onClose} size="wide" title="Links in the letters">
      {!rows ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Spinner className="h-4 w-4" /> Loading…</div>
      ) : (
        <div className="space-y-5">
          <p className="text-xs leading-relaxed text-slate-600">
            These are the words in the onboarding letters that carry a link. The addresses below
            came from the People team&rsquo;s own document. The ones without an address were
            hyperlinks whose target the document never showed, so they have to be typed in once
            here rather than pasted into every letter that mentions them.
          </p>

          {!!needed.length && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-amber-900">
                {needed.length} still need an address
              </h3>
              <div className="space-y-2">
                {needed.map((r) => (
                  <LinkRow key={r.key} row={r} saving={saving === r.key} onSave={save} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">
              {known.length} already point somewhere
            </h3>
            <div className="space-y-2">
              {known.map((r) => (
                <LinkRow key={r.key} row={r} saving={saving === r.key} onSave={save} />
              ))}
            </div>
          </section>
        </div>
      )}
    </Modal>
  )
}

/** The letter as it will land, rather than the markup it is written in.
 *
 * The bodies carry *bold*, /italic/ and [words](#link) so they can be edited in a plain textarea.
 * Nobody should have to read that and imagine the result, so this shows the rendered version
 * beside it. The HTML comes from the server, which is the same renderer that builds the mail. */
function BodyPreview({ html }) {
  if (!html) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        As the reader sees it
      </p>
      <div className="max-h-80 overflow-auto rounded-lg bg-white p-3 [&_a]:underline"
        // The renderer escapes the letter before adding its own tags, so what lands here is the
        // template's formatting and nothing the template did not put there.
        dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

function LinkRow({ row, saving, onSave }) {
  const [url, setUrl] = useState(row.url || '')
  const dirty = (url || '') !== (row.url || '')
  return (
    <div className={cx('flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2',
      row.needs_a_url ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200')}>
      <div className="min-w-40 flex-1">
        <p className="text-sm font-medium text-slate-800">{row.label}</p>
        {row.note && <p className="text-[11px] text-slate-500">{row.note}</p>}
      </div>
      <input value={url} onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        aria-label={`Address for ${row.label}`}
        className={cx(inputClass, 'h-8 min-w-64 flex-[2] py-0 text-xs')} />
      <Button size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty || saving}
        onClick={() => onSave(row.key, url.trim())}>
        {saving ? <Spinner className="h-3.5 w-3.5" /> : 'Save'}
      </Button>
      {row.from_document && !dirty && (
        <span className="text-[11px] text-slate-400">from the document</span>
      )}
    </div>
  )
}

// ── who a mail goes to ──────────────────────────────────────────────────────────────────────

/** Pick the audience for a mail, and see the actual people before sending.
 *
 * A group here is a rule, not a frozen list: "everyone with a login" is resolved at the moment you
 * look, so the count is right today. The resolved names are one click away rather than hidden,
 * because the number on its own is exactly the thing people press send on without reading. */
function AudiencePicker({ value, onChange, occurrenceId, onSavedListsChanged }) {
  const { toast } = useToast()
  const [cat, setCat] = useState(null)
  const [people, setPeople] = useState(null)
  const [showWho, setShowWho] = useState(false)
  const [adding, setAdding] = useState(false)
  const [typed, setTyped] = useState('')
  const [saving, setSaving] = useState(false)

  const spec = useMemo(
    () => ({ groups: value.groups || [], saved: value.saved || [], emails: value.emails || [] }),
    [value])

  useEffect(() => {
    api.onboardingAudiences(occurrenceId).then(setCat).catch(() => setCat(null))
  }, [occurrenceId])

  useEffect(() => {
    let live = true
    api.onboardingResolveAudience(spec, occurrenceId)
      .then((r) => { if (live) setPeople(r) })
      .catch(() => { if (live) setPeople(null) })
    return () => { live = false }
  }, [spec, occurrenceId])

  // What is on the To line right now, as removable tokens.
  const chosen = useMemo(() => {
    const groups = (cat?.groups || []).filter((g) => spec.groups.includes(g.key))
      .map((g) => ({ id: `g:${g.key}`, label: g.label, count: g.count,
        drop: () => onChange({ ...spec, groups: spec.groups.filter((x) => x !== g.key) }) }))
    const lists = (cat?.saved || []).filter((g) => spec.saved.includes(g.id))
      .map((g) => ({ id: `s:${g.id}`, label: g.name, count: g.count,
        drop: () => onChange({ ...spec, saved: spec.saved.filter((x) => x !== g.id) }) }))
    const typedIn = spec.emails.map((e) => ({ id: `e:${e}`, label: e, count: null,
      drop: () => onChange({ ...spec, emails: spec.emails.filter((x) => x !== e) }) }))
    return [...groups, ...lists, ...typedIn]
  }, [cat, spec, onChange])

  // Everything not yet on the line, offered only when somebody asks to add.
  const unchosen = useMemo(() => [
    ...(cat?.groups || []).filter((g) => !spec.groups.includes(g.key))
      .map((g) => ({ key: `g:${g.key}`, label: g.label, count: g.count, hint: g.source,
        pick: () => onChange({ ...spec, groups: [...spec.groups, g.key] }) })),
    ...(cat?.saved || []).filter((g) => !spec.saved.includes(g.id))
      .map((g) => ({ key: `s:${g.id}`, label: g.name, count: g.count,
        hint: g.note || 'A list somebody built by hand',
        pick: () => onChange({ ...spec, saved: [...spec.saved, g.id] }) })),
  ], [cat, spec, onChange])

  function addTyped() {
    const parts = typed.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x.includes('@'))
    if (!parts.length) return
    onChange({ ...spec, emails: [...new Set([...spec.emails, ...parts])] })
    setTyped('')
  }

  async function saveAsList() {
    const name = window.prompt('Name this list')
    if (!name) return
    setSaving(true)
    try {
      const members = (people?.people || []).map((p) => ({ name: p.name, email: p.email }))
      const g = await api.onboardingCreateGroup({ name, members })
      toast(`Saved “${g.name}” with ${g.members.length} in it`, 'success')
      setCat(await api.onboardingAudiences(occurrenceId))
      onSavedListsChanged?.()
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  const count = people?.count ?? 0

  return (
    <div className="rounded-xl border border-slate-200">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">To</span>
        {chosen.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">
            {c.label}
            {c.count != null && <span className="tabular-nums opacity-60">{c.count}</span>}
            <button type="button" onClick={c.drop} aria-label={`Remove ${c.label}`}
              className={cx('rounded px-0.5 text-brand-500 hover:text-brand-900', focusRing)}>&times;</button>
          </span>
        ))}
        <button type="button" onClick={() => setAdding((v) => !v)}
          className={cx('inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-600',
            'transition-colors duration-150 ease-snappy hover:border-slate-400 hover:text-slate-800', focusRing)}>
          <Plus className="h-3 w-3" aria-hidden />{chosen.length ? 'Add' : 'Add someone'}
        </button>
      </div>

      {adding && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-3 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {unchosen.map((g) => (
              <button key={g.key} type="button" onClick={g.pick} title={g.hint}
                className={cx('inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700',
                  'transition-colors duration-150 ease-snappy hover:border-brand-300 hover:text-brand-800', focusRing)}>
                {g.label}<span className="tabular-nums opacity-60">{g.count}</span>
              </button>
            ))}
            {!unchosen.length && (
              <span className="text-xs text-slate-500">Everything is already on the To line.</span>
            )}
          </div>
          <input value={typed} onChange={(ev) => setTyped(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addTyped() } }}
            onBlur={addTyped}
            placeholder="Or type an address and press enter"
            className={cx(TOOLBAR, 'h-8 w-full text-xs')} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2">
        <Users className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
        <span className="text-xs font-medium text-slate-700">
          {count === 0 ? 'Reaches nobody yet' : `Reaches ${count} ${count === 1 ? 'person' : 'people'}`}
        </span>
        {count > 0 && (
          <button type="button" onClick={() => setShowWho((v) => !v)}
            className={cx('rounded px-1 text-xs font-medium text-brand-700 hover:text-brand-900', focusRing)}>
            {showWho ? 'Hide who' : 'Show who'}
          </button>
        )}
        {count > 0 && (
          <button type="button" onClick={saveAsList} disabled={saving}
            className={cx('ml-auto rounded px-1 text-xs text-slate-500 hover:text-slate-800', focusRing)}>
            Save as a list
          </button>
        )}
      </div>

      {showWho && (
        <ul className="max-h-44 overflow-auto border-t border-slate-100 px-3 py-2 text-xs">
          {(people?.people || []).map((p) => (
            <li key={p.email} className="flex items-center justify-between gap-3 py-0.5">
              <span className="min-w-0 truncate text-slate-800">{p.name || p.email}</span>
              <span className="shrink-0 truncate text-[11px] text-slate-500">
                {p.name ? `${p.email} · ` : ''}{p.source}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Send a session's mail: from the catalogue, or from a sitting on the calendar.
 *
 * The date, weekday and time come from whichever sitting is picked. With none picked those tokens
 * stay standing in the text, which is the honest state of a mail about a session nobody has
 * scheduled yet. */
function SessionMailComposer({ sessionKey, templateKey, occurrenceId, onClose, onSent }) {
  const { toast } = useToast()
  const [draft, setDraft] = useState(null)
  const [sitting, setSitting] = useState(occurrenceId || '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState({ groups: [], saved: [], emails: [] })
  const [on, setOn] = useState('')
  const [at, setAt] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [extras, setExtras] = useState({})
  const [sending, setSending] = useState(false)

  // Reading the draft is a fetch, and the fetch is the only thing that sets this window up, so it
  // settles state from the promise rather than from the effect body.
  const apply = useCallback((d) => {
    setDraft(d)
    setSubject(d.subject)
    setBody(d.body)
    setAudience(d.audience || { groups: [], saved: [], emails: [] })
    setOn(d.on || '')
    setAt(d.at || '')
  }, [])

  useEffect(() => {
    api.onboardingSessionCatalogueMail(sessionKey, templateKey, occurrenceId || undefined)
      .then(apply)
      .catch((e) => { toast(e.message, 'error'); onClose() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, templateKey, occurrenceId])

  // Re-draft whenever the sitting, the date or the time changes: those three are what the letter
  // says about WHEN, and a subject line still reading {{Session Date}} is the whole thing this
  // window exists to prevent.
  function redraft(next) {
    const occ = next.sitting !== undefined ? next.sitting : sitting
    const d = next.on !== undefined ? next.on : on
    const t = next.at !== undefined ? next.at : at
    api.onboardingSessionCatalogueMail(sessionKey, templateKey, occ ? Number(occ) : undefined, d, t)
      .then(apply)
      .catch((e) => toast(e.message, 'error'))
  }

  function pickSitting(v) {
    setSitting(v)
    setDraft(null)
    redraft({ sitting: v, on: '', at: '' })
  }

  // A typed value replaces its token everywhere it appears, in the subject as well as the body.
  const withExtras = (text) => Object.entries(extras).reduce(
    (out, [field, value]) => (value
      ? out.split(`{{${field}}}`).join(value)
      : out),
    text)

  async function send() {
    setSending(true)
    try {
      const res = await api.onboardingSendSessionCatalogueMail(sessionKey, templateKey, {
        subject: withExtras(subject), body: withExtras(body),
        audience, occurrence_id: sitting ? Number(sitting) : null,
      })
      toast(`Sent to ${res.sent} ${res.sent === 1 ? 'person' : 'people'}`, 'success')
      onSent?.()
      onClose()
    } catch (e) { toast(e.message, 'error') } finally { setSending(false) }
  }

  return (
    <Modal open onClose={onClose} size="wide" title={draft ? draft.name : 'Mail'}>
      {!draft ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Spinner className="h-4 w-4" /> Loading the draft…</div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Which sitting
              <select value={sitting} onChange={(e) => pickSitting(e.target.value)}
                className={cx(TOOLBAR, 'h-8')}>
                <option value="">Not scheduled yet</option>
                {draft.sittings.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fmtDateTime(s.starts_at)} · {s.mode} · {s.attendees} invited
                    {s.invites_sent_at ? ' · invites sent' : ''}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs text-slate-500">{draft.session_name}</span>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Date
              <input type="date" value={on}
                onChange={(e) => { setOn(e.target.value); redraft({ on: e.target.value }) }}
                className={cx(TOOLBAR, 'h-8')} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Time
              <input type="time" value={at}
                onChange={(e) => { setAt(e.target.value); redraft({ at: e.target.value }) }}
                className={cx(TOOLBAR, 'h-8')} />
            </label>
          </div>
          {sitting && draft.on && on && on !== draft.on && (
            <p className="text-xs text-amber-800">
              This letter will say {on}, but the sitting itself is still on {draft.on}. Move it from
              the calendar if the session really has changed.
            </p>
          )}

          {!!draft.missing?.length && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
              <p className="flex items-start gap-2 text-xs text-amber-900">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  {draft.missing.length} still to fill in.
                  {!sitting && ' Picking a sitting fills the date and time.'}
                </span>
              </p>
              {/* Typing here fills the letter, rather than leaving somebody to find {{Facilitator}}
                  somewhere in the body and replace it by hand. */}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {draft.missing.filter((f) => !f.startsWith('a link for')).map((f) => (
                  <label key={f} className="flex items-center gap-2 text-xs text-amber-900">
                    <span className="w-28 shrink-0 truncate">{f}</span>
                    <input value={extras[f] || ''}
                      onChange={(e) => setExtras({ ...extras, [f]: e.target.value })}
                      placeholder={`Type the ${f.toLowerCase()}`}
                      className={cx(inputClass, 'h-8 flex-1 py-0 text-xs')} />
                  </label>
                ))}
              </div>
              {draft.missing.some((f) => f.startsWith('a link for')) && (
                <p className="mt-2 text-[11px] text-amber-800">
                  {draft.missing.filter((f) => f.startsWith('a link for')).join(', ')} &mdash; set
                  those once under Links in the page header.
                </p>
              )}
            </div>
          )}

          <AudiencePicker value={audience} onChange={setAudience}
            occurrenceId={sitting ? Number(sitting) : undefined} />

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Subject</span>
            <input value={withExtras(subject)} onChange={(e) => setSubject(e.target.value)}
              className={cx(inputClass, 'h-9 text-sm')} />
          </label>
          <RichTextArea value={withExtras(body)} onChange={setBody} rows={16} />
          {showPreview && <BodyPreview html={draft.html} />}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setShowPreview((v) => !v)}
              className={cx('rounded px-1 text-xs font-medium text-brand-700 hover:text-brand-900', focusRing)}>
              {showPreview ? 'Hide the preview' : 'Preview it'}
            </button>
            <p className="text-[11px] text-slate-500">
              Everyone gets this letter with their own name in the greeting.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={send} disabled={sending}>
              {sending ? <Spinner className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />} Send
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

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
  const [showPreview, setShowPreview] = useState(false)
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
          <RichTextArea value={body} onChange={setBody} />
          {showPreview
            ? <BodyPreview html={draft.html} />
            : (
              <button type="button" onClick={() => setShowPreview(true)}
                className={cx('rounded px-1 text-xs font-medium text-brand-700 hover:text-brand-900', focusRing)}>
                Preview it
              </button>
            )}

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

/** The answer a step is asking for, in the column where the reader is already looking.
 *
 * A read-only row shows what the offer letter says and lets it be corrected, because paperwork is
 * typed by people and sometimes typed wrong. Correcting the joining date moves every working-day
 * due date with it, which is the whole reason it is editable here rather than read-only. */
function StepValue({ step, busy, onSave }) {
  const [v, setV] = useState(step.resolved ?? step.value ?? '')
  const [editing, setEditing] = useState(false)

  const asDate = step.key === 'joining_date' || step.kind === 'date'
  const placeholder = step.kind === 'source'
    ? `From ${SOURCE_LABEL[step.source] || 'elsewhere'}`
    : PROMPTS[step.key] || 'Type it here'

  if (step.kind === 'source' && !editing) {
    return (
      <span className="flex items-center gap-1.5">
        {v
          ? <span className="text-sm text-slate-800">{asDate ? fmtDate(v) : v}</span>
          : <span className="text-xs text-slate-500">Not on their paperwork yet</span>}
        <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${step.label}`}
          className={cx('rounded p-0.5 text-slate-400 hover:text-brand-700', focusRing)}>
          <PencilLine className="h-3 w-3" aria-hidden />
        </button>
      </span>
    )
  }
  return (
    <input type={asDate ? 'date' : 'text'} value={v} disabled={busy} autoFocus={editing}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setEditing(false)
        if (v !== (step.value || '') && v !== (step.resolved || '')) onSave(v)
      }}
      aria-label={step.label}
      className={cx(inputClass, 'h-8 w-full min-w-32 py-0 text-xs')} />
  )
}

/** The due date, and a way to move it.
 *
 * The calculated date is the plan: the seventh working day, the forty-fifth. Real life moves them,
 * and a date nobody can move is a date people stop believing. Setting one here is used by every
 * other view; clearing it brings the calculated one back. */
function StepDue({ step, onSave }) {
  const [open, setOpen] = useState(false)
  // Once a step is finished, when it was finished is the more useful fact than when it was meant
  // to be. The plan is still there underneath, in the second line.
  if (step.completed_at && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className={cx('group rounded px-1 py-0.5 text-left', focusRing)}>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
          <Check className="h-3 w-3" aria-hidden />{fmtDate(step.completed_at)}
        </span>
        <span className="block text-[11px] text-slate-400">
          done{step.due_on ? ` · was due ${fmtDate(step.due_on)}` : ''}
        </span>
      </button>
    )
  }
  if (!step.due_on && !step.due_working_day) return <span className={EMPTY}>&mdash;</span>
  if (open) {
    return (
      <span className="flex items-center gap-1">
        <input type="date" defaultValue={step.due_on || ''} autoFocus
          onChange={(e) => { onSave(e.target.value); setOpen(false) }}
          onBlur={() => setOpen(false)}
          aria-label={`Due date for ${step.label}`}
          className={cx(inputClass, 'h-8 py-0 text-xs')} />
        {step.due_is_set_by_hand && (
          <button type="button" onClick={() => { onSave(''); setOpen(false) }}
            className={cx('rounded px-1 text-[11px] text-slate-500 hover:text-slate-800', focusRing)}>
            Reset
          </button>
        )}
      </span>
    )
  }
  return (
    <button type="button" onClick={() => setOpen(true)}
      className={cx('group rounded px-1 py-0.5 text-left', focusRing)}>
      <span className={cx('text-xs', step.overdue ? 'font-medium text-amber-700' : 'text-slate-600',
        'group-hover:text-brand-700')}>
        {step.due_on ? fmtDate(step.due_on) : 'Set a date'}
      </span>
      <span className="block text-[11px] text-slate-400">
        {step.due_is_set_by_hand ? 'set by hand'
          : step.due_working_day ? `day ${step.due_working_day}` : 'not set'}
      </span>
    </button>
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
                                {s.sitting && (
                                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
                                    <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                                      <CalendarDays className="h-3 w-3" aria-hidden />
                                      {fmtDateTime(s.sitting.starts_at)}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                      {s.sitting.mode === 'remote'
                                        ? <Video className="h-3 w-3" aria-hidden />
                                        : <MapPin className="h-3 w-3" aria-hidden />}
                                      {s.sitting.location || (s.sitting.mode === 'remote' ? 'Online' : s.sitting.mode)}
                                    </span>
                                    {s.sitting.invites_sent_at
                                      ? <span className="text-emerald-700">invite sent</span>
                                      : <span className="text-amber-700">invite not sent</span>}
                                  </span>
                                )}
                                {s.note && <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{s.note}</span>}
                              </span>
                            </span>
                          </td>
                          <td className={TD}>
                            {s.kind === 'derived' ? (
                              <span className="text-sm font-medium tabular-nums text-slate-700">{plan.progress.percent}%</span>
                            ) : (s.kind === 'source' || s.kind === 'text' || s.kind === 'date') ? (
                              <StepValue key={`${s.key}:${s.resolved}:${s.value}`}
                                step={s} busy={busy === s.key}
                                onSave={(v) => patch(s.key, { value: v })} />
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
                            <StepDue step={s} onSave={(v) => patch(s.key, { due_override: v })} />
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
                            ) : s.attendance ? (
                              <select value={s.attendance || 'NA'}
                                onChange={(e) => patch(s.key, { attendance: e.target.value })}
                                aria-label={`Attendance for ${s.label}`}
                                className={cx('h-8 rounded-full border px-2.5 text-xs font-medium outline-none',
                                  ATTENDANCE_TONE[s.attendance] || ATTENDANCE_TONE.NA, focusRing)}>
                                {['Attended', 'Did not attend', 'NA'].map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
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

function SessionsView({ sessions, frequencies, modes, onSchedule, onMail }) {
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
                        <button key={m.key} type="button" onClick={() => onMail(s, m)}
                          title={`Read and send: ${m.label}`}
                          className={cx('inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700',
                            'transition-colors duration-150 ease-snappy hover:border-brand-300 hover:bg-brand-100', focusRing)}>
                          <Mail className="h-3 w-3" aria-hidden />{m.label}
                        </button>
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

// ── View 3: the calendar ────────────────────────────────────────────────────────────────────
//
// A month grid, because "what is happening when" is a question about shape: which week is heavy,
// which is empty, what falls on the same day. A list can only answer it one row at a time.
//
// Deliberately NOT split by entity. A room holds whoever is in it and the People team runs one
// schedule; filtering the month by entity hid half of what was actually happening that week. Each
// sitting still says which entity it belongs to.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1)
const dayKey = (d) => (d instanceof Date && !Number.isNaN(d.getTime())
  ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  : '')
const sameDay = (a, b) => dayKey(a) === dayKey(b)

/** Monday-first index, because the working week starts on Monday here. */
const mondayIndex = (d) => (d.getDay() + 6) % 7

/** The 5 or 6 weeks a month grid needs, each a run of 7 dates. */
function weeksOf(month) {
  const first = startOfMonth(month)
  const start = new Date(first)
  start.setDate(first.getDate() - mondayIndex(first))
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const weeks = []
  const cur = new Date(start)
  while (cur <= last || weeks.length === 0 || mondayIndex(cur) !== 0) {
    const week = []
    for (let i = 0; i < 7; i += 1) {
      week.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
    if (cur > last && mondayIndex(cur) === 0) break
  }
  return weeks
}

/** What a sitting most needs somebody to notice, in one word. */
function sittingState(o, today) {
  const start = new Date(o.starts_at)
  if (!Number.isNaN(start.getTime()) && start < today) return 'past'
  if (o.invites_sent_at) return 'invited'
  const due = o.invite_due ? new Date(o.invite_due) : null
  if (due && due <= today) return 'overdue'
  return 'upcoming'
}

const CHIP_TONE = {
  past: 'border-slate-200 bg-slate-50 text-slate-500',
  invited: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  overdue: 'border-amber-300 bg-amber-50 text-amber-900',
  upcoming: 'border-brand-200 bg-brand-50 text-brand-800',
}

const STATE_WORD = {
  past: 'Done',
  invited: 'Invites sent',
  overdue: 'Invite overdue',
  upcoming: 'Invite not sent yet',
}

const hhmm = (v) => {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function CalendarView({ occurrences, onReschedule, onOpen, onMail, onChanged }) {
  const { toast } = useToast()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [picking, setPicking] = useState(false)          // selection mode
  const [chosen, setChosen] = useState(() => new Set())
  const [openDay, setOpenDay] = useState(null)           // a Date
  const [moving, setMoving] = useState(false)            // bulk reschedule modal
  const [busy, setBusy] = useState(false)

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  // Sittings keyed by the day they fall on, so a cell is a lookup rather than a scan.
  const byDay = useMemo(() => {
    const m = new Map()
    for (const o of occurrences) {
      const k = dayKey(new Date(o.starts_at))
      if (!k) continue
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(o)
    }
    for (const list of m.values()) list.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    return m
  }, [occurrences])

  const weeks = useMemo(() => weeksOf(month), [month])
  const inMonth = useMemo(
    () => occurrences.filter((o) => {
      const d = new Date(o.starts_at)
      return !Number.isNaN(d.getTime()) && d.getMonth() === month.getMonth()
        && d.getFullYear() === month.getFullYear()
    }),
    [occurrences, month],
  )

  const chosenList = useMemo(
    () => occurrences.filter((o) => chosen.has(o.id)), [occurrences, chosen])

  function toggle(id) {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function leavePicking() {
    setPicking(false)
    setChosen(new Set())
  }

  async function sendInvites() {
    setBusy(true)
    try {
      const res = await api.onboardingBulkSessionMail([...chosen], 'invite')
      const people = res.sent.reduce((n, s) => n + s.count, 0)
      toast(res.sent.length
        ? `Invites sent for ${res.sent.length} sitting${res.sent.length === 1 ? '' : 's'}, ${people} in all`
        : 'Nothing to send', res.sent.length ? 'success' : 'error')
      if (res.skipped?.length) {
        toast(res.skipped.map((s) => `${s.name}: ${s.why}`).join(' · '), 'error')
      }
      leavePicking()
      onChanged?.()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const monthLabel = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-3">
      {/* Toolbar: where you are, how to move, and the one mode switch. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <IconButton aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
        <h3 className="text-base font-semibold tracking-tight text-slate-900">{monthLabel}</h3>
        <button type="button" onClick={() => setMonth(startOfMonth(new Date()))}
          className={cx(TOOLBAR, 'h-8')}>Today</button>

        <span className="ml-auto text-xs tabular-nums text-slate-500">
          {inMonth.length} sitting{inMonth.length === 1 ? '' : 's'} this month
        </span>
        {picking ? (
          <button type="button" onClick={leavePicking} className={cx(TOOLBAR, 'h-8')}>Done selecting</button>
        ) : (
          <button type="button" onClick={() => setPicking(true)} className={cx(TOOLBAR, 'h-8')}>
            Select several
          </button>
        )}
      </div>

      {picking && (
        <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-900">
          Pick the sittings you want to act on. They can be in different weeks; move to another
          month and your choices are kept.
        </p>
      )}

      {/* The month. */}
      <div className={TABLE_WRAP}>
        <div className="grid grid-cols-7 border-b border-brand-200 bg-brand-100">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-brand-800">
              <span className="hidden sm:inline">{w}</span>
              <span className="sm:hidden">{w[0]}</span>
            </div>
          ))}
        </div>
        <div>
          {weeks.map((week) => (
            <div key={dayKey(week[0])} className="grid grid-cols-7 border-b border-slate-100 last:border-0">
              {week.map((d) => {
                const list = byDay.get(dayKey(d)) || []
                const outside = d.getMonth() !== month.getMonth()
                const isToday = sameDay(d, today)
                return (
                  <div key={dayKey(d)}
                    className={cx('min-h-[92px] border-r border-slate-100 p-1.5 last:border-r-0 sm:min-h-[116px]',
                      outside && 'bg-slate-50/60')}>
                    <div className="mb-1 flex items-center justify-between">
                      <button type="button"
                        onClick={() => list.length && setOpenDay(d)}
                        disabled={!list.length}
                        aria-label={list.length
                          ? `${list.length} sitting${list.length === 1 ? '' : 's'} on ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`
                          : undefined}
                        className={cx('inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs tabular-nums',
                          'transition-colors duration-150 ease-snappy', focusRing,
                          isToday ? 'bg-brand-600 font-semibold text-white'
                            : outside ? 'text-slate-400'
                              : 'font-medium text-slate-700',
                          list.length && !isToday && 'hover:bg-brand-50')}>
                        {d.getDate()}
                      </button>
                      {list.length > 2 && (
                        <button type="button" onClick={() => setOpenDay(d)}
                          className={cx('rounded px-1 text-[10px] font-medium text-slate-500 hover:text-brand-700', focusRing)}>
                          +{list.length - 2}
                        </button>
                      )}
                    </div>

                    <div className="space-y-1">
                      {list.slice(0, 2).map((o) => {
                        const state = sittingState(o, today)
                        const isChosen = chosen.has(o.id)
                        return (
                          <button key={o.id} type="button"
                            onClick={() => (picking ? toggle(o.id) : setOpenDay(d))}
                            title={`${o.name} · ${hhmm(o.starts_at)} · ${STATE_WORD[state]}`}
                            className={cx('flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-left',
                              'transition-colors duration-150 ease-snappy', focusRing, CHIP_TONE[state],
                              picking && isChosen && 'ring-2 ring-brand-500 ring-offset-1')}>
                            {picking && (
                              <span className={cx('flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] border',
                                isChosen ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-400 bg-white')}>
                                {isChosen && <Check className="h-2.5 w-2.5" aria-hidden />}
                              </span>
                            )}
                            <span className="shrink-0 text-[10px] font-medium tabular-nums opacity-80">{hhmm(o.starts_at)}</span>
                            <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{o.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* What the colours mean, said once rather than guessed at. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-[11px] text-slate-500">
        {['upcoming', 'overdue', 'invited', 'past'].map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cx('h-2.5 w-2.5 rounded-sm border', CHIP_TONE[k])} aria-hidden />
            {STATE_WORD[k]}
          </span>
        ))}
      </div>

      {!occurrences.length && (
        <EmptyState icon={CalendarDays} title="Nothing is scheduled yet"
          description="Pick a session on the Sessions tab and schedule a sitting; it appears here." />
      )}

      {/* Bulk bar. Sits above the fold of the page so it cannot be missed while scrolling. */}
      {picking && chosen.size > 0 && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 shadow-card">
          <span className="text-sm font-medium text-slate-800">
            {chosen.size} sitting{chosen.size === 1 ? '' : 's'} selected
          </span>
          <span className="hidden truncate text-xs text-slate-500 sm:inline">
            {chosenList.slice(0, 3).map((o) => o.name).join(', ')}{chosen.size > 3 ? ` +${chosen.size - 3}` : ''}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMoving(true)}>
              <CalendarDays className="h-3.5 w-3.5" /> Reschedule
            </Button>
            <Button size="sm" onClick={sendInvites} disabled={busy}>
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />} Send invites
            </Button>
          </div>
        </div>
      )}

      {openDay && (
        <DayModal date={openDay} sittings={byDay.get(dayKey(openDay)) || []} today={today}
          onClose={() => setOpenDay(null)}
          onMail={onMail} onAttendance={onOpen} onReschedule={onReschedule} />
      )}
      {moving && (
        <BulkRescheduleModal sittings={chosenList} onClose={() => setMoving(false)}
          onDone={() => { setMoving(false); leavePicking(); onChanged?.() }} />
      )}
    </div>
  )
}

/** One day, opened from the grid: everything on it, with what each one still needs. */
function DayModal({ date, sittings, today, onClose, onMail, onAttendance, onReschedule }) {
  const title = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-3">
        {sittings.map((o) => {
          const state = sittingState(o, today)
          const came = o.attendees.filter((a) => a.attended).length
          const marked = o.attendees.some((a) => a.attended != null)
          return (
            <div key={o.id} className="rounded-xl border border-slate-200 p-3.5">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{o.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden />{hhmm(o.starts_at)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {o.mode === 'remote' ? <Video className="h-3 w-3" aria-hidden /> : <MapPin className="h-3 w-3" aria-hidden />}
                      {o.location || (o.mode === 'remote' ? 'Online' : o.mode)}
                    </span>
                    <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-px text-[11px] font-medium text-slate-600">
                      {o.entity}
                    </span>
                  </p>
                </div>
                <span className={cx('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium', CHIP_TONE[state])}>
                  {STATE_WORD[state]}
                </span>
              </div>

              <p className="mt-2 text-xs text-slate-600">
                {o.attendees.length} invited{marked && ` · ${came} came`}
                {o.invite_due && !o.invites_sent_at && (
                  <span className={state === 'overdue' ? 'font-medium text-amber-800' : 'text-slate-500'}>
                    {' · '}invite due {fmtDate(o.invite_due)}
                  </span>
                )}
                {o.invites_sent_at && <span className="text-slate-500">{' · '}sent {fmtDate(o.invites_sent_at)}</span>}
              </p>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => { onClose(); onMail(o) }}>
                  <Mail className="h-3.5 w-3.5" /> Mails
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { onClose(); onAttendance(o) }}>Attendance</Button>
                <Button size="sm" variant="ghost" onClick={() => { onClose(); onReschedule(o) }}>
                  <CalendarDays className="h-3.5 w-3.5" /> Reschedule
                </Button>
                {o.meet_link && (
                  <a href={o.meet_link} target="_blank" rel="noreferrer"
                    className={cx('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50', focusRing)}>
                    <Video className="h-3.5 w-3.5" aria-hidden /> Join link
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

/** Move several sittings at once: slide them all, or put them all on one date. */
function BulkRescheduleModal({ sittings, onClose, onDone }) {
  const { toast } = useToast()
  const [how, setHow] = useState('shift')
  const [days, setDays] = useState(7)
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    try {
      const body = how === 'shift' ? { shift_days: Number(days) } : { move_to: when }
      const res = await api.onboardingBulkReschedule(sittings.map((s) => s.id), body)
      toast(`Moved ${res.moved.length} sitting${res.moved.length === 1 ? '' : 's'}`, 'success')
      onDone()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Move ${sittings.length} sitting${sittings.length === 1 ? '' : 's'}`}>
      <div className="space-y-4">
        <ul className="space-y-1 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-xs text-slate-700">
          {sittings.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3">
              <span className="truncate">{s.name}</span>
              <span className="shrink-0 tabular-nums text-slate-500">{fmtDateTime(s.starts_at)}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="how" checked={how === 'shift'} onChange={() => setHow('shift')}
              className="h-4 w-4 accent-brand-600" />
            Move every one of them by
            <input type="number" value={days} onChange={(e) => setDays(e.target.value)}
              onFocus={() => setHow('shift')}
              className={cx(inputClass, 'h-8 w-20 py-0 text-sm')} />
            days
          </label>
          <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="how" checked={how === 'date'} onChange={() => setHow('date')}
              className="h-4 w-4 accent-brand-600" />
            Put them all on
            <input type="date" value={when} onChange={(e) => setWhen(e.target.value)}
              onFocus={() => setHow('date')}
              className={cx(inputClass, 'h-8 w-44 py-0 text-sm')} />
            <span className="text-xs text-slate-500">keeping each one&rsquo;s time</span>
          </label>
        </div>

        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The invite was written for the old date, so moving a sitting marks its invite as not yet
          sent. Send it again from the day it now falls on.
        </p>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={go} disabled={busy || (how === 'date' && !when)}>
            {busy ? <Spinner className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />} Move them
          </Button>
        </div>
      </div>
    </Modal>
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
  const [composing, setComposing] = useState(null)   // a session role, e.g. "invite"
  // One chip per PART the mail plays. A session that has an in-campus and a remote version of its
  // invite is still one invite here; which version goes out is decided by where the sitting is.
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
          <button key={m.key} type="button" onClick={() => setComposing(m.session_role)}
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
        <SessionMailComposer sessionKey={occurrence.session_key} templateKey={composing}
          occurrenceId={occurrence.id}
          onClose={() => setComposing(null)} onSent={onSent} />
      )}
    </Modal>
  )
}

// ── View 4: every mail, and which ones write themselves ─────────────────────────────────────

const MAIL_COLUMNS = [
  { key: 'name', label: 'Mail', get: (r) => r.name || '' },
  { key: 'kind', label: 'Kind', get: (r) => r.kind || '' },
  { key: 'sending', label: 'Sending', get: (r) => r.sending || '' },
  { key: 'to', label: 'Goes to', get: (r) => r.to || '' },
  { key: 'state', label: 'State', get: (r) => r.state || '' },
  { key: 'due', label: 'Next due', get: (r) => (r.next_due ? fmtDate(r.next_due) : '') },
  { key: 'progress', label: 'Sent', get: (r) => `${r.sent} of ${r.total}` },
  { key: 'edited', label: 'Updated', get: (r) => (r.edited_at ? fmtDate(r.edited_at) : '') },
]

const STATE_TONE = {
  Sent: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Overdue: 'border-amber-200 bg-amber-50 text-amber-800',
  'Due today': 'border-brand-200 bg-brand-50 text-brand-800',
  Waiting: 'border-slate-200 bg-slate-50 text-slate-600',
  'Nobody waiting': 'border-slate-200 bg-white text-slate-400',
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

  if (!rows.length) {
    return (
      <EmptyState icon={Mail} title="No mails yet"
        description="Letters appear here once somebody is on onboarding or a session has a sitting on the calendar." />
    )
  }

  return (
    <div className="space-y-3">
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
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
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
                <th scope="col" className={cx(TH, 'text-right')} />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.template_key} onClick={() => onOpen(r)}
                  className={cx('cursor-pointer border-b border-slate-100 last:border-0', ROW_HOVER)}>
                  <td className={TD}>
                    <span className="block truncate font-medium text-slate-800">{r.name}</span>
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
                    <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      STATE_TONE[r.state] || STATE_TONE.Waiting)}>
                      {r.state}
                    </span>
                  </td>
                  <td className={cx(TD, 'whitespace-nowrap text-slate-600')}>
                    {r.next_due ? fmtDate(r.next_due) : <span className={EMPTY}>&mdash;</span>}
                  </td>
                  <td className={cx(TD, 'w-32')}>
                    <div className="flex items-center gap-2">
                      <ProgressBar percent={r.total ? Math.round((r.sent / r.total) * 100) : 0}
                        tone={r.sent === r.total ? 'bg-emerald-500' : 'bg-brand-600'} />
                      <span className="shrink-0 text-[11px] tabular-nums text-slate-600">{r.sent}/{r.total}</span>
                    </div>
                    {!!r.needs.length && (
                      <span className="mt-0.5 block truncate text-[11px] text-amber-700" title={r.needs.join(', ')}>
                        needs {r.needs[0]}{r.needs.length > 1 ? ` +${r.needs.length - 1}` : ''}
                      </span>
                    )}
                  </td>
                  <td className={cx(TD, 'whitespace-nowrap')}>
                    {r.edited_at
                      ? <span className="text-xs text-brand-700" title={r.edited_by}>{fmtDate(r.edited_at)}</span>
                      : <span className={EMPTY}>&mdash;</span>}
                  </td>
                  <td className={cx(TD, 'text-right')}>
                    <ChevronRight className="ml-auto h-4 w-4 text-slate-400" aria-hidden />
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

/** One letter: what it says, who has had it, and who is still waiting.
 *
 * The wording and the sending live in the same window on purpose. Editing a letter and then
 * hunting for the list of people it is owed to is two screens for one thought. */
function TemplateModal({ row, onClose, onPick, onEdited }) {
  const { toast } = useToast()
  const [tpl, setTpl] = useState(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [linkList, setLinkList] = useState([])

  useEffect(() => {
    api.onboardingLinks().then((r) => setLinkList(r.links)).catch(() => setLinkList([]))
  }, [])

  useEffect(() => {
    api.onboardingReadTemplate(row.template_key)
      .then((d) => { setTpl(d); setSubject(d.subject); setBody(d.body) })
      .catch((e) => { toast(e.message, 'error'); onClose() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.template_key])

  const dirty = tpl && (subject !== tpl.subject || body !== tpl.body)

  async function save() {
    setSaving(true)
    try {
      const d = await api.onboardingWriteTemplate(row.template_key, { subject, body })
      setTpl(d); setSubject(d.subject); setBody(d.body); setEditing(false)
      toast(d.edited ? 'Letter saved' : 'Back to the original wording', 'success')
      onEdited?.()
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  function resetToOriginal() {
    if (!tpl) return
    setSubject(tpl.original_subject)
    setBody(tpl.original_body)
    setEditing(true)
  }

  const pending = (row.people || []).filter((p) => p.state !== 'Sent')
  const done = (row.people || []).filter((p) => p.state === 'Sent')

  return (
    <Modal open onClose={onClose} size="wide" title={row.name}>
      {!tpl ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Spinner className="h-4 w-4" /> Loading…</div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span>{row.sending === 'Automatic' ? 'Drafts itself from their details' : 'Written by hand'}</span>
            <span className="text-slate-300">|</span>
            <span>Goes to the {tpl.to}</span>
            {tpl.edited && (
              <>
                <span className="text-slate-300">|</span>
                <span className="text-brand-700">
                  Edited {fmtDateTime(tpl.edited_at)}{tpl.edited_by ? ` by ${tpl.edited_by}` : ''}
                </span>
              </>
            )}
          </div>

          {!!tpl.needs.length && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>Still to supply: {tpl.needs.join(', ')}.</span>
            </p>
          )}

          {/* the letter */}
          <section className="rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                The letter
              </span>
              <div className="ml-auto flex items-center gap-2">
                {tpl.edited && (
                  <button type="button" onClick={resetToOriginal}
                    className={cx('rounded px-1 text-xs text-slate-500 hover:text-slate-800', focusRing)}>
                    Back to the original
                  </button>
                )}
                <button type="button" onClick={() => setEditing((v) => !v)}
                  className={cx('rounded px-1 text-xs font-medium text-brand-700 hover:text-brand-900', focusRing)}>
                  {editing ? 'Preview it' : 'Edit it'}
                </button>
              </div>
            </div>

            {editing ? (
              <div className="space-y-3 p-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Subject</span>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)}
                    className={cx(inputClass, 'h-9 text-sm')} />
                </label>
                <RichTextArea value={body} onChange={setBody} links={linkList} />
                {tpl.fields.length > 0 && (
                  <p className="text-[11px] text-slate-500">
                    Filled in per person: {tpl.fields.join(', ')}.
                  </p>
                )}
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" onClick={() => { setSubject(tpl.subject); setBody(tpl.body); setEditing(false) }}>
                    Cancel
                  </Button>
                  <Button onClick={save} disabled={saving || !dirty}>
                    {saving ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />} Save the letter
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-3">
                <p className="mb-2 text-sm font-medium text-slate-900">{rtStrip(subject)}</p>
                <div className="max-h-72 overflow-auto rounded-lg bg-slate-50/70 p-3 [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: tpl.html }} />
              </div>
            )}
          </section>

          {/* who it is owed to, and who has had it */}
          {!!pending.length && (
            <section>
              <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Still to go to {pending.length}
              </h3>
              <div className="space-y-1.5">
                {pending.map((p) => (
                  <button key={`${p.plan_id || p.occurrence_id}`} type="button" onClick={() => onPick(p)}
                    className={cx('flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 text-left',
                      'transition-colors duration-150 ease-snappy hover:border-brand-300 hover:bg-brand-50/50', focusRing)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{p.who}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {p.entity}{p.due_on ? ` · due ${fmtDate(p.due_on)}` : ''}
                      </span>
                    </span>
                    <span className={cx('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      STATE_TONE[p.state] || STATE_TONE.Waiting)}>{p.state}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {done.length ? `Sent to ${done.length}` : 'Not sent to anybody yet'}
            </h3>
            {done.length ? (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {done.map((p) => (
                  <li key={`${p.plan_id || p.occurrence_id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className="truncate text-slate-800">{p.who}</span>
                    <span className="shrink-0 text-[11px] text-slate-500">{fmtDateTime(p.sent_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">
                {row.total ? 'Nobody has had this one yet.' : 'Nobody is waiting on this one at the moment.'}
              </p>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}

/** The subject line without its markers, for showing rather than editing. */
const rtStrip = (s) => String(s || '')
  .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, '$1')
  .replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, '$1')
  .replace(/(?<![\w/])\/([^/\n]+)\/(?![\w/])/g, '$1')
  .replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, '$1')

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
  const [linksOpen, setLinksOpen] = useState(false)
  const [linksMissing, setLinksMissing] = useState(0)
  const [mails, setMails] = useState(null)
  const [sessionMails, setSessionMails] = useState(null)   // an occurrence
  const [sessionMail, setSessionMail] = useState(null)     // { sessionKey, templateKey, occurrenceId? }
  const [composing, setComposing] = useState(null)         // a row from the mails table
  const [mailPeople, setMailPeople] = useState(null)       // one letter, and who it is owed to

  const loadBoard = () => api.onboardingBoard().then(setBoard).catch(() => setBoard([]))
  const loadOccurrences = () => api.onboardingOccurrences().then(setOccurrences).catch(() => setOccurrences([]))
  const loadMails = () => api.onboardingMailsByTemplate().then(setMails).catch(() => setMails([]))
  // How many phrases in the letters still have no address behind them. Worth a number in the
  // header: every one of them is a dead link in a mail somebody is about to send.
  const loadLinks = () => api.onboardingLinks().then((r) => setLinksMissing(r.missing)).catch(() => {})

  useEffect(() => {
    api.onboardingDefinitions().then(setDefs).catch(() => setDefs({ steps: [], sessions: [], phases: [] }))
    loadBoard()
    loadOccurrences()
    loadMails()
    loadLinks()
  }, [])

  const totals = useMemo(() => {
    const rows = board || []
    return {
      people: rows.length,
      overdue: rows.filter((r) => r.overdue).length,
      sittings: occurrences.filter((o) => new Date(o.starts_at) >= new Date()).length,
      mails: (mails || []).reduce((n, m) => n + (m.outstanding || 0), 0),
    }
  }, [board, occurrences, mails])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Onboarding"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => setLinksOpen(true)}>
              <LinkIcon className="h-3.5 w-3.5" /> Links
              {linksMissing > 0 && (
                <span className="ml-0.5 rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">
                  {linksMissing}
                </span>
              )}
            </Button>
            <Button variant="ghost" onClick={() => setFormsOpen(true)}>
              <ClipboardList className="h-3.5 w-3.5" /> Onboarding form
            </Button>
          </div>
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
          : <CandidatesView rows={board} onOpen={(r) => setOpenPlan(r.plan_id)}
              mails={defs?.mails || []} onChanged={() => { loadBoard(); loadMails() }} />
      )}

      {tab === 'sessions' && (
        !defs ? <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>
          : <SessionsView sessions={defs.sessions} frequencies={defs.frequencies || []}
              modes={defs.modes || []} onSchedule={(s) => setScheduling({ session: s })}
              onMail={(sess, mail) => setSessionMail({ sessionKey: sess.key, templateKey: mail.key })} />
      )}

      {tab === 'calendar' && (
        <CalendarView occurrences={occurrences}
          onReschedule={(o) => setScheduling({ occurrence: o })}
          onOpen={(o) => setAttendance(o)}
          onMail={(o) => setSessionMails(o)}
          onChanged={() => { loadOccurrences(); loadMails() }} />
      )}

      {tab === 'mails' && (
        mails === null
          ? <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>
          : <MailsView rows={mails} onOpen={(r) => setMailPeople(r)} />
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
      {sessionMail && (
        <SessionMailComposer sessionKey={sessionMail.sessionKey} templateKey={sessionMail.templateKey}
          occurrenceId={sessionMail.occurrenceId}
          onClose={() => setSessionMail(null)}
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
      {mailPeople && (
        <TemplateModal row={mailPeople} onClose={() => setMailPeople(null)}
          onEdited={loadMails}
          onPick={(p) => {
            setMailPeople(null)
            if (p.occurrence_id) {
              const occ = occurrences.find((o) => o.id === p.occurrence_id)
              if (occ) setSessionMails(occ)
            } else {
              setComposing({ planId: p.plan_id, templateKey: p.template_key })
            }
          }} />
      )}
      {linksOpen && <LinksModal onClose={() => setLinksOpen(false)} onChanged={loadLinks} />}
      <OnboardingFormsModal key={formsOpen ? 'o' : 'c'} open={formsOpen} onClose={() => setFormsOpen(false)} />
    </div>
  )
}
