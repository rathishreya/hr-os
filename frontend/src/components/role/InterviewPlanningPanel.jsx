import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Calendar, Clock, Link2, MapPin, Plus, Trash2, Users, ChevronDown, ChevronUp, Bot, Video, Copy, Check,
  ShieldAlert, ShieldCheck,
} from 'lucide-react'
import { api } from '../../api'
import { Badge, Button, Field, Spinner, inputClass, cx } from '../../ui'
import { useToast } from '../Toast'
import ScreeningPanel from './ScreeningPanel'

const INTERVIEW_TYPES = [
  { value: 'phone_screen', label: 'Phone screen' },
  { value: 'technical', label: 'Technical' },
  { value: 'system_design', label: 'System design' },
  { value: 'cultural', label: 'Cultural fit' },
  { value: 'hr', label: 'HR / behavioural' },
  { value: 'panel', label: 'Panel' },
  { value: 'final', label: 'Final' },
  { value: 'assignment', label: 'Take-home / assignment' },
  { value: 'other', label: 'Other' },
]

const STATUSES = [
  { value: 'draft', label: 'Draft', tone: 'gray' },
  { value: 'scheduled', label: 'Scheduled', tone: 'blue' },
  { value: 'completed', label: 'Completed', tone: 'green' },
  { value: 'cancelled', label: 'Cancelled', tone: 'rose' },
  { value: 'no_show', label: 'No show', tone: 'amber' },
]

const DURATIONS = [30, 45, 60, 90, 120, 180]

const EMPTY_ROUND = {
  round_number: 1,
  interview_type: 'technical',
  status: 'scheduled',
  scheduled_at: '',
  duration_minutes: 60,
  panelists: [],
  location_or_link: '',
  notes: '',
  feedback: '',
}

function typeLabel(v) {
  return INTERVIEW_TYPES.find((t) => t.value === v)?.label || v
}

function statusMeta(v) {
  return STATUSES.find((s) => s.value === v) || STATUSES[1]
}

function formatSlot(iso) {
  if (!iso) return 'Slot not set'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function PanelistInput({ panelists, suggestions, onChange }) {
  const [draft, setDraft] = useState('')

  function add(name) {
    const v = (name || draft).trim()
    if (!v || panelists.includes(v)) return
    onChange([...panelists, v])
    setDraft('')
  }

  function remove(p) {
    onChange(panelists.filter((x) => x !== p))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {panelists.map((p) => (
          <span key={p} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800">
            {p}
            <button type="button" onClick={() => remove(p)} className="text-violet-400 hover:text-rose-600" aria-label={`Remove ${p}`}>×</button>
          </span>
        ))}
        {!panelists.length && <span className="text-xs text-slate-400">No panelists yet</span>}
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.filter((s) => !panelists.includes(s)).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-md border border-dashed border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-violet-300 hover:bg-violet-50"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className={inputClass}
          placeholder="Name or email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        />
        <Button type="button" variant="ghost" className="shrink-0 text-xs" onClick={() => add()}>Add</Button>
      </div>
    </div>
  )
}

function RoundForm({ form, setForm, panelSuggestions, onSave, onCancel, busy, isNew }) {
  return (
    <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Round #">
          <input
            type="number"
            min={1}
            className={inputClass}
            value={form.round_number}
            onChange={(e) => setForm({ ...form, round_number: Number(e.target.value) || 1 })}
          />
        </Field>
        <Field label="Interview type">
          <select className={inputClass} value={form.interview_type} onChange={(e) => setForm({ ...form, interview_type: e.target.value })}>
            {INTERVIEW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Duration">
          <select
            className={inputClass}
            value={form.duration_minutes}
            onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
          >
            {DURATIONS.map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Date & time">
            <input
              type="datetime-local"
              className={inputClass}
              value={form.scheduled_at}
              onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Location / meeting link">
            <input
              className={inputClass}
              placeholder="Zoom link, office room, or address"
              value={form.location_or_link}
              onChange={(e) => setForm({ ...form, location_or_link: e.target.value })}
            />
          </Field>
        </div>
      </div>
      <Field label="Panelists">
        <PanelistInput
          panelists={form.panelists}
          suggestions={panelSuggestions}
          onChange={(panelists) => setForm({ ...form, panelists })}
        />
      </Field>
      <Field label="Planning notes (internal)">
        <textarea
          className={`${inputClass} h-20 resize-y`}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Agenda, rubric areas, prep for panel…"
        />
      </Field>
      {!isNew && (
        <Field label="Post-interview feedback">
          <textarea
            className={`${inputClass} h-20 resize-y`}
            value={form.feedback}
            onChange={(e) => setForm({ ...form, feedback: e.target.value })}
            placeholder="Panel notes, recommendation, scores…"
          />
        </Field>
      )}
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={busy}>{busy ? <Spinner /> : (isNew ? 'Schedule round' : 'Save changes')}</Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </div>
  )
}

function RoundCard({ round, panelSuggestions, onUpdated, onDeleted }) {
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(null)

  const sm = statusMeta(round.status)

  async function save() {
    setBusy(true)
    try {
      await api.updateInterviewRound(round.id, form)
      toast(`Round ${round.round_number} updated`)
      setExpanded(false)
      setForm(null)
      onUpdated()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete Round ${round.round_number}?`)) return
    setBusy(true)
    try {
      await api.deleteInterviewRound(round.id)
      toast('Round removed')
      onDeleted()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  function startEdit() {
    setForm({
      round_number: round.round_number,
      interview_type: round.interview_type,
      status: round.status,
      scheduled_at: round.scheduled_at || '',
      duration_minutes: round.duration_minutes,
      panelists: [...(round.panelists || [])],
      location_or_link: round.location_or_link || '',
      notes: round.notes || '',
      feedback: round.feedback || '',
    })
    setExpanded(true)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        className="flex w-full items-start gap-3 p-4 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-sm font-bold text-violet-700">
          {round.round_number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">{typeLabel(round.interview_type)}</span>
            <Badge tone={sm.tone}>{sm.label}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{formatSlot(round.scheduled_at)}</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{round.duration_minutes} min</span>
            {(round.panelists || []).length > 0 && (
              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{(round.panelists || []).join(', ')}</span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          {form ? (
            <RoundForm
              form={form}
              setForm={setForm}
              panelSuggestions={panelSuggestions}
              onSave={save}
              onCancel={() => { setForm(null); setExpanded(false) }}
              busy={busy}
            />
          ) : (
            <div className="space-y-3 text-sm">
              {round.location_or_link && (
                <div className="flex gap-2 text-slate-600">
                  {round.location_or_link.startsWith('http') ? <Link2 className="h-4 w-4 shrink-0" /> : <MapPin className="h-4 w-4 shrink-0" />}
                  {round.location_or_link.startsWith('http') ? (
                    <a href={round.location_or_link} target="_blank" rel="noreferrer" className="text-violet-600 hover:underline break-all">{round.location_or_link}</a>
                  ) : (
                    <span>{round.location_or_link}</span>
                  )}
                </div>
              )}
              {round.notes && (
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-400">Notes</div>
                  <p className="whitespace-pre-wrap text-slate-600">{round.notes}</p>
                </div>
              )}
              {round.feedback && (
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-400">Feedback</div>
                  <p className="whitespace-pre-wrap text-slate-600">{round.feedback}</p>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="ghost" className="text-xs" onClick={startEdit}>Edit round</Button>
                <Button variant="ghost" className="text-xs text-rose-600" onClick={remove} disabled={busy}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const fmtTime = (s) => `${String(Math.floor((s || 0) / 60)).padStart(2, '0')}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`

function VideoInterviewReview({ app }) {
  const { toast } = useToast()
  const [vi, setVi] = useState(null)
  const [job, setJob] = useState(null)
  const [qs, setQs] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const vidRef = useRef(null)
  const link = `${window.location.origin}/interview/${app.id}`

  const loadVi = () => api.getVideoInterview(app.id).then(setVi).catch(() => {})
  useEffect(() => {
    loadVi()
    api.getJD(app.hiring_request_id).then((j) => { setJob(j); setQs(j.video_questions?.length ? j.video_questions : ['', '', '']) }).catch(() => setJob(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id, app.hiring_request_id])

  async function copy() { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) }
  function seek(at) { if (vidRef.current) { vidRef.current.currentTime = at || 0; vidRef.current.play().catch(() => {}) } }

  async function saveQuestions() {
    if (!job) { toast('Generate the job description first (Job post tab) to set questions.', 'error'); return }
    setSaving(true)
    try {
      const clean = qs.map((q) => q.trim()).filter(Boolean)
      await api.setVideoQuestions(job.id, clean)
      setQs(clean.length ? clean : [''])
      await loadVi()
      toast('Questions saved'); setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  const [retx, setRetx] = useState(false)
  async function deleteRecording() {
    if (!vi || !window.confirm('Delete this interview recording, transcript and summary? The candidate can re-record using the same link.')) return
    try { await api.deleteVideoInterview(vi.id); await loadVi(); toast('Recording deleted') } catch (e) { toast(e.message, 'error') }
  }
  async function generateTranscript() {
    setRetx(true)
    try { setVi(await api.retranscribeVideo(vi.id)); toast('Transcript & summary generated') }
    catch (e) { toast(e.message, 'error') } finally { setRetx(false) }
  }

  const proc = vi?.proctoring || {}
  const flags = (proc.focus_lost || 0) + (proc.fullscreen_exits || 0)

  return (
    <div className="mt-2 space-y-3">
      {/* 1) Write the questions */}
      <div className="rounded-lg border border-slate-200 bg-white p-2.5">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Interview questions {vi?.status === 'completed' && <span className="font-normal text-slate-300">· edits apply to future candidates</span>}</div>
        {job ? (
          <>
            <div className="space-y-1.5">
              {qs.map((q, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-4 text-xs tabular-nums text-slate-400">{i + 1}</span>
                  <input className={inputClass} value={q} onChange={(e) => setQs(qs.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Question the AI will ask" />
                  <button type="button" onClick={() => setQs(qs.filter((_, j) => j !== i))} className="shrink-0 text-slate-300 hover:text-rose-500" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Button variant="ghost" className="text-xs" onClick={() => setQs([...qs, ''])}><Plus className="h-3.5 w-3.5" /> Add question</Button>
              <Button className="text-xs" onClick={saveQuestions} disabled={saving}>{saving ? <Spinner /> : saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : 'Save questions'}</Button>
            </div>
          </>
        ) : <p className="text-xs text-slate-400">Generate the job description first (Job post tab) to set questions.</p>}
      </div>

      {/* 2) Share the link to start */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
        <p className="mb-1.5 text-xs text-slate-500">Then share this link — one <strong>continuous, proctored</strong> recording (AI asks, candidate answers, auto-advances on silence, transcribed free on their device).</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">{link}</code>
          <Button variant="ghost" className="shrink-0 px-2 py-1 text-xs" onClick={copy}>{copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy link'}</Button>
        </div>
      </div>

      {/* 3) Review after the interview */}
      {!vi ? null : !vi.has_recording ? (
        <p className="text-xs text-slate-400">{vi.status === 'completed' ? 'Completed (no recording stored).' : 'Not taken yet.'}</p>
      ) : (
        <>
          <video ref={vidRef} controls src={api.videoRecordingUrl(vi.id)} className="aspect-video w-full rounded-lg bg-slate-900" />
          <div className="flex justify-end">
            <button type="button" onClick={deleteRecording} className="inline-flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /> Delete recording</button>
          </div>

          <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-2.5 text-xs ${flags ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {flags ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            <span><strong>{proc.focus_lost || 0}</strong> tab switch{(proc.focus_lost || 0) !== 1 ? 'es' : ''}</span>
            <span><strong>{proc.fullscreen_exits || 0}</strong> fullscreen exit{(proc.fullscreen_exits || 0) !== 1 ? 's' : ''}</span>
            <span>Duration {fmtTime(vi.duration)}</span>
          </div>

          {!vi.transcript && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs">
              <p className="mb-2 text-amber-800">No transcript yet — the candidate&apos;s on-device transcription didn&apos;t run, or the AI quota was hit during the interview. The recording is saved; generate it now (retries on the saved video):</p>
              <Button className="text-xs" onClick={generateTranscript} disabled={retx}>{retx ? <Spinner /> : 'Generate transcript & summary'}</Button>
            </div>
          )}

          {vi.summary && (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><Bot className="h-3.5 w-3.5" /> AI summary</div>
              <p className="whitespace-pre-wrap rounded-lg bg-violet-50 p-2.5 text-xs text-slate-700">{vi.summary}</p>
            </div>
          )}

          {vi.timeline?.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Questions (click to jump)</div>
              <div className="space-y-1">
                {vi.timeline.map((t, i) => (
                  <button key={i} type="button" onClick={() => seek(t.at)} className="flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-violet-50">
                    <span className="font-mono text-violet-600">{fmtTime(t.at)}</span>
                    <span className="text-slate-600">{t.question}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {vi.transcript && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Transcript</div>
              <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-600">{vi.transcript}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function InterviewPlanningPanel({ app, onChange }) {
  const { toast } = useToast()
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [panelSuggestions, setPanelSuggestions] = useState([])
  const [showAiScreen, setShowAiScreen] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const [newRound, setNewRound] = useState({ ...EMPTY_ROUND })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, role, panellists] = await Promise.all([
        api.listInterviewRounds(app.id),
        api.getRole(app.hiring_request_id).catch(() => null),
        api.listUsers('panellist').catch(() => []),
      ])
      setRounds(list)
      const fromRole = (role?.interview_panel || []).filter(Boolean)
      const fromUsers = (panellists || []).map((u) => u.name || u.email).filter(Boolean)
      setPanelSuggestions([...new Set([...fromUsers, ...fromRole])])
      const next = (list.length ? Math.max(...list.map((r) => r.round_number)) + 1 : 1)
      setNewRound((f) => ({ ...f, round_number: next }))
    } catch {
      setRounds([])
    } finally {
      setLoading(false)
    }
  }, [app.id, app.hiring_request_id])

  useEffect(() => { load() }, [load])

  const summary = useMemo(() => {
    const scheduled = rounds.filter((r) => r.status === 'scheduled')
    const next = scheduled
      .filter((r) => r.scheduled_at)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0]
    return { total: rounds.length, scheduled: scheduled.length, completed: rounds.filter((r) => r.status === 'completed').length, next }
  }, [rounds])

  async function createRound() {
    setBusy(true)
    try {
      await api.createInterviewRound({
        application_id: app.id,
        ...newRound,
      })
      toast(`Round ${newRound.round_number} scheduled`)
      setShowAdd(false)
      setNewRound({ ...EMPTY_ROUND, round_number: newRound.round_number + 1 })
      await load()
      onChange?.()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading interview plan…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Interview plan</span>
        {!showAdd && (
          <Button variant="ghost" className="text-xs" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5" /> Add round
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
          <div className="text-lg font-semibold text-slate-900">{summary.total}</div>
          <div className="text-[10px] uppercase text-slate-400">Rounds</div>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
          <div className="text-lg font-semibold text-violet-700">{summary.scheduled}</div>
          <div className="text-[10px] uppercase text-slate-400">Scheduled</div>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
          <div className="text-lg font-semibold text-emerald-700">{summary.completed}</div>
          <div className="text-[10px] uppercase text-slate-400">Done</div>
        </div>
      </div>

      {summary.next && (
        <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">
          Next: Round {summary.next.round_number} · {typeLabel(summary.next.interview_type)} · {formatSlot(summary.next.scheduled_at)}
        </p>
      )}

      {showAdd && (
        <RoundForm
          form={newRound}
          setForm={setNewRound}
          panelSuggestions={panelSuggestions}
          onSave={createRound}
          onCancel={() => setShowAdd(false)}
          busy={busy}
          isNew
        />
      )}

      {rounds.length === 0 && !showAdd ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No interviews planned yet. Add rounds with panelists, slots, and type.
        </div>
      ) : (
        <div className="space-y-2">
          {rounds.map((r) => (
            <RoundCard
              key={r.id}
              round={r}
              panelSuggestions={panelSuggestions}
              onUpdated={load}
              onDeleted={load}
            />
          ))}
        </div>
      )}

      <div className="border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => setShowVideo((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          <span className="inline-flex items-center gap-1.5"><Video className="h-3.5 w-3.5" /> Async video interview (pre-defined questions)</span>
          {showVideo ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showVideo && <VideoInterviewReview app={app} />}
      </div>

      <div className="border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => setShowAiScreen((v) => !v)}
          className={cx(
            'flex w-full items-center justify-between rounded-lg px-2 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50',
          )}
        >
          <span className="inline-flex items-center gap-1.5"><Bot className="h-3.5 w-3.5" /> Async AI pre-screen (optional)</span>
          {showAiScreen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showAiScreen && (
          <div className="mt-2">
            <ScreeningPanel app={app} onChange={onChange} />
          </div>
        )}
      </div>
    </div>
  )
}
