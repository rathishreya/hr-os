import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, MapPin, Video, Star, ChevronDown, ClipboardList, LogOut, FileText, GraduationCap, Briefcase, CheckCircle2, Sparkles, Users, Link as LinkIcon } from 'lucide-react'
import { api } from '../api'
import { Badge, Button, Spinner, inputClass, cx, EmptyState, scoreTone } from '../ui'
import { useAuth } from '../contexts/auth'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'
import { INTERVIEW_TYPES } from '../constants'

const TYPE_LABEL = Object.fromEntries(INTERVIEW_TYPES.map((t) => [t.value, t.label]))
const FIT_TONE = { strong: 'green', good: 'green', fit: 'green', strong_fit: 'green', maybe: 'amber', moderate: 'amber', weak: 'rose', unfit: 'rose', poor: 'rose' }
const RECS = [
  { value: 'strong_yes', label: 'Strong yes', tone: 'bg-emerald-600' },
  { value: 'yes', label: 'Yes', tone: 'bg-emerald-500' },
  { value: 'no', label: 'No', tone: 'bg-rose-500' },
  { value: 'strong_no', label: 'Strong no', tone: 'bg-rose-600' },
]

function fmtWhen(s) {
  if (!s) return 'Not scheduled yet'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Stars({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n === value ? 0 : n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className="rounded p-0.5 transition-transform duration-150 ease-snappy hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">
          <Star className={cx('h-6 w-6', n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
        </button>
      ))}
    </div>
  )
}

function FeedbackForm({ round, onSaved }) {
  const { toast } = useToast()
  const mine = round.my_feedback || {}
  const [rating, setRating] = useState(mine.rating || 0)
  const [rec, setRec] = useState(mine.recommendation || '')
  const [notes, setNotes] = useState(mine.feedback || '')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!rec && !rating && !notes.trim()) { toast('Add a rating, recommendation, or notes', 'error'); return }
    setBusy(true)
    try {
      await api.submitPanelFeedback(round.id, { rating, recommendation: rec, feedback: notes })
      toast('Feedback saved — thank you')
      onSaved()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-slate-800">Your feedback</h4>
      <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Rating</div>
          <Stars value={rating} onChange={setRating} />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Recommendation</div>
          <div className="flex flex-wrap gap-1.5">
            {RECS.map((r) => (
              <button key={r.value} type="button" onClick={() => setRec(r.value === rec ? '' : r.value)}
                className={cx('rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
                  rec === r.value ? `${r.tone} text-white` : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Notes</div>
        <textarea className={`${inputClass} h-28 resize-y`} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Strengths, concerns, evidence from the interview…" />
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        {mine.at && <span className="text-xs text-emerald-600"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Submitted — you can update it</span>}
        <Button onClick={submit} disabled={busy}>{busy ? <Spinner /> : 'Save feedback'}</Button>
      </div>
    </div>
  )
}

function ResumeFileButton({ candidateId }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  async function open() {
    setBusy(true)
    try {
      const blob = await api.fetchResumeFile(candidateId)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { toast(e.message || 'Could not open résumé', 'error') } finally { setBusy(false) }
  }
  return (
    <button type="button" onClick={open} disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-brand-600 transition-colors duration-150 ease-snappy hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-50">
      {busy ? <Spinner /> : <FileText className="h-3.5 w-3.5" />} Open original résumé
    </button>
  )
}

function InterviewCard({ round, onSaved }) {
  const [open, setOpen] = useState(false)
  const c = round.candidate || {}
  const done = !!round.my_feedback
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 ease-snappy hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
          {(c.name || '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{c.name || 'Candidate'}</span>
            <Badge tone="violet">{TYPE_LABEL[round.interview_type] || round.interview_type}</Badge>
            {done ? <Badge tone="green">Feedback given</Badge> : <Badge tone="amber">Awaiting your feedback</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{round.role_position || '—'}</span>
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{fmtWhen(round.scheduled_at)}</span>
            {round.location_or_link && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{round.location_or_link.length > 40 ? 'Link/location' : round.location_or_link}</span>}
          </div>
        </div>
        <ChevronDown className={cx('h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ease-snappy', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50/40 p-4">
          {round.location_or_link && (
            <div className="text-sm">
              {/^https?:\/\//.test(round.location_or_link)
                ? <a href={round.location_or_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"><Video className="h-3.5 w-3.5" /> Join interview</a>
                : <span className="text-slate-600"><MapPin className="mr-1 inline h-4 w-4 text-slate-400" />{round.location_or_link}</span>}
            </div>
          )}

          {/* Candidate prep */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-semibold text-slate-800">Candidate</h4>
            {(c.current_title || c.current_company) && (
              <p className="mt-1 text-sm text-slate-600">{[c.current_title, c.current_company].filter(Boolean).join(' · ')}{c.total_yoe ? ` · ${c.total_yoe} yrs` : ''}{c.location ? ` · ${c.location}` : ''}</p>
            )}
            {c.summary && <p className="mt-2 text-pretty text-sm leading-relaxed text-slate-600">{c.summary}</p>}
            {(c.skills || []).length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {c.skills.slice(0, 24).map((s, i) => <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s}</span>)}
              </div>
            )}
            {(c.education || []).length > 0 && (
              <div className="mt-2.5 space-y-0.5 text-xs text-slate-500">
                {c.education.slice(0, 3).map((e, i) => <div key={i} className="inline-flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" />{[e.degree, e.institution].filter(Boolean).join(', ')}</div>)}
              </div>
            )}
            {(c.links || []).length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {c.links.map((l, i) => {
                  const url = typeof l === 'string' ? l : (l.url || l.href || '')
                  if (!url) return null
                  const label = typeof l === 'object' ? (l.label || l.type || '') : ''
                  return <a key={i} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs text-brand-600 hover:border-brand-300"><LinkIcon className="h-3 w-3" />{label || url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}</a>
                })}
              </div>
            )}
            {c.has_resume_file && <div className="mt-3"><ResumeFileButton candidateId={c.id} /></div>}
            {c.resume_text && (
              <details className="mt-2 group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"><FileText className="h-3.5 w-3.5" /> {c.has_resume_file ? 'Read parsed text' : 'Read résumé'}</summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{c.resume_text}</pre>
              </details>
            )}
          </div>

          {/* AI screening insight */}
          {round.ai && (round.ai.score || round.ai.fit_label || (round.ai.strengths || []).length || (round.ai.gaps || []).length) ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Sparkles className="h-4 w-4 text-brand-500" /> AI screening</h4>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!!round.ai.score && <Badge tone={scoreTone(round.ai.score)}>{round.ai.score}/100 fit</Badge>}
                {round.ai.fit_label && <Badge tone={FIT_TONE[round.ai.fit_label.toLowerCase()] || 'gray'}>{round.ai.fit_label}</Badge>}
                {round.ai.recommendation && <span className="text-xs text-slate-500">AI recommendation: {round.ai.recommendation}</span>}
              </div>
              {(round.ai.strengths || []).length > 0 && (
                <div className="mt-2.5"><div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Strengths</div>
                  <ul className="mt-1 space-y-1 text-sm text-slate-600">{round.ai.strengths.slice(0, 6).map((s, i) => <li key={i} className="flex gap-2"><span className="text-emerald-500">+</span><span>{s}</span></li>)}</ul></div>
              )}
              {(round.ai.gaps || []).length > 0 && (
                <div className="mt-2.5"><div className="text-xs font-semibold uppercase tracking-wide text-rose-700">Gaps to probe</div>
                  <ul className="mt-1 space-y-1 text-sm text-slate-600">{round.ai.gaps.slice(0, 6).map((s, i) => <li key={i} className="flex gap-2"><span className="text-rose-400">!</span><span>{s}</span></li>)}</ul></div>
              )}
              {round.ai.rationale && (
                <details className="mt-2.5"><summary className="cursor-pointer list-none text-xs font-medium text-brand-600 hover:text-brand-700">Why this score</summary>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-500">{round.ai.rationale}</p></details>
              )}
              <p className="mt-2.5 text-[11px] text-slate-400">An AI suggestion — your independent judgement decides.</p>
            </div>
          ) : null}

          {/* One-way video interview */}
          {round.video && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Video className="h-4 w-4 text-brand-500" /> One-way video interview</h4>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge tone={round.video.status === 'completed' ? 'green' : 'amber'}>{round.video.status}</Badge>
                {Object.entries(round.video.scores || {}).filter(([, v]) => typeof v === 'number').map(([k, v]) => (
                  <span key={k} className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">{k.replace(/_/g, ' ')}: {v}</span>
                ))}
                {round.video.has_recording && <a href={api.videoRecordingUrl(round.video.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2 py-0.5 font-medium text-white hover:bg-brand-700"><Video className="h-3 w-3" /> Watch</a>}
              </div>
              {round.video.summary && <p className="mt-2 text-pretty text-sm leading-relaxed text-slate-600">{round.video.summary}</p>}
              {round.video.transcript && (
                <details className="mt-2"><summary className="cursor-pointer list-none text-xs font-medium text-brand-600 hover:text-brand-700">Read transcript</summary>
                  <pre className="mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{round.video.transcript}</pre></details>
              )}
            </div>
          )}

          {/* Rubric */}
          {(round.rubric || []).length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><ClipboardList className="h-4 w-4 text-brand-500" /> What to assess</h4>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                {round.rubric.map((r, i) => {
                  if (typeof r === 'string') return <li key={i} className="flex gap-2"><span className="text-brand-400">•</span><span>{r}</span></li>
                  const area = r.area || r.criterion || r.label || r.name || ''
                  const detail = r.what_to_assess || r.description || r.detail || ''
                  return (
                    <li key={i} className="flex gap-2">
                      <span className="text-brand-400">•</span>
                      <span>{area && <strong className="text-slate-700">{area}</strong>}{area && detail ? ' — ' : ''}{detail}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Suggested questions */}
          {(round.suggested_questions || []).length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><ClipboardList className="h-4 w-4 text-brand-500" /> Suggested questions</h4>
              <ol className="mt-2 space-y-1.5 text-sm text-slate-600">
                {round.suggested_questions.map((q, i) => <li key={i} className="flex gap-2"><span className="font-medium text-slate-400">{i + 1}.</span><span>{typeof q === 'string' ? q : (q.question || q.text || JSON.stringify(q))}</span></li>)}
              </ol>
            </div>
          )}

          {/* About the role */}
          {((round.role_requirements || []).length > 0 || (round.role_responsibilities || []).length > 0) && (
            <details className="rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800">About the role</summary>
              {(round.role_responsibilities || []).length > 0 && (
                <div className="mt-2"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Responsibilities</div>
                  <ul className="mt-1 space-y-1 text-sm text-slate-600">{round.role_responsibilities.slice(0, 10).map((s, i) => <li key={i} className="flex gap-2"><span className="text-brand-400">•</span><span>{s}</span></li>)}</ul></div>
              )}
              {(round.role_requirements || []).length > 0 && (
                <div className="mt-2.5"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Requirements</div>
                  <ul className="mt-1 space-y-1 text-sm text-slate-600">{round.role_requirements.slice(0, 10).map((s, i) => <li key={i} className="flex gap-2"><span className="text-brand-400">•</span><span>{s}</span></li>)}</ul></div>
              )}
            </details>
          )}

          {/* Candidate's application answers */}
          {(round.application_answers || []).length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-800">Application answers</h4>
              <dl className="mt-2 space-y-2">
                {round.application_answers.map((a, i) => (
                  <div key={i}><dt className="text-xs font-medium text-slate-500">{a.label}</dt><dd className="text-sm text-slate-700">{a.answer}</dd></div>
                ))}
              </dl>
            </div>
          )}

          {round.notes && <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><span className="font-medium text-slate-700">Notes from the recruiter:</span> {round.notes}</div>}

          {/* Panel */}
          {(round.co_panelists || []).length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Users className="h-4 w-4 text-brand-500" /> Panel</h4>
              <p className="mt-1 text-sm text-slate-600">Also interviewing: {round.co_panelists.join(', ')}</p>
              {round.others_locked && <p className="mt-1.5 text-xs text-slate-400">Other panelists&apos; feedback is hidden until you submit yours — keeps assessments independent.</p>}
              {(round.others_feedback || []).length > 0 && (
                <div className="mt-2 space-y-2">
                  {round.others_feedback.map((f, i) => (
                    <div key={i} className="rounded-lg bg-slate-50 p-2.5 text-sm">
                      <div className="flex items-center gap-2 text-xs"><span className="font-semibold text-slate-700">{f.panelist}</span>{f.rating ? <span className="text-amber-500">{'★'.repeat(f.rating)}</span> : null}{f.recommendation && <Badge tone="gray">{f.recommendation.replace(/_/g, ' ')}</Badge>}</div>
                      {f.feedback && <p className="mt-1 text-slate-600">{f.feedback}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <FeedbackForm round={round} onSaved={onSaved} />
        </div>
      )}
    </div>
  )
}

export default function PanelHome() {
  usePageTitle('Interview panel')
  const { user, logout } = useAuth()
  const { toast } = useToast()
  const [rounds, setRounds] = useState(null)

  const load = () => api.myInterviews().then(setRounds).catch((e) => { toast(e.message, 'error'); setRounds([]) })
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { pending, done } = useMemo(() => {
    const list = rounds || []
    return {
      pending: list.filter((r) => !r.my_feedback),
      done: list.filter((r) => r.my_feedback),
    }
  }, [rounds])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/60">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-600 text-base font-black text-white">H</div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-slate-900">Interview panel</div>
            <div className="text-[11px] text-slate-400">HR-OS by EZ Works</div>
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm text-slate-500">
            <span className="hidden sm:inline">{user?.name || user?.email}</span>
            <button type="button" onClick={logout} title="Sign out" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors duration-150 ease-snappy hover:bg-slate-100 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"><LogOut className="h-4 w-4" /> Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-xl font-bold text-slate-900">Your interviews</h1>
        <p className="mt-1 text-sm text-slate-500">Rounds you&apos;re on the panel for. Review the candidate, then record your rating and recommendation.</p>

        {rounds === null ? (
          <div className="mt-8 flex items-center gap-2 text-sm text-slate-400"><Spinner /> Loading your interviews…</div>
        ) : rounds.length === 0 ? (
          <div className="mt-8"><EmptyState icon={CalendarClock} title="No interviews assigned yet" description="When a recruiter adds you to an interview panel, the rounds show up here." /></div>
        ) : (
          <div className="mt-6 space-y-6">
            {pending.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Awaiting your feedback ({pending.length})</h2>
                <div className="space-y-3">{pending.map((r) => <InterviewCard key={r.id} round={r} onSaved={load} />)}</div>
              </section>
            )}
            {done.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Feedback submitted ({done.length})</h2>
                <div className="space-y-3">{done.map((r) => <InterviewCard key={r.id} round={r} onSaved={load} />)}</div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
