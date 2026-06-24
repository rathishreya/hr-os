import { useState } from 'react'
import { FileText, RefreshCw, StickyNote } from 'lucide-react'
import { api } from '../../api'
import {
  Card, Badge, Button, Spinner, ScoreBar, scoreTone, Modal, Avatar, stageTone, cx, inputClass,
} from '../../ui'
import { useToast } from '../Toast'
import InterviewPlanningPanel from './InterviewPlanningPanel'
import EmailPanel from './EmailPanel'
import OfferPanel from './OfferPanel'
import OnboardingPanel from './OnboardingPanel'

const STAGES = ['applied', 'shortlisted', 'interview', 'offer', 'hired', 'rejected']
const REC_TONE = { strong_yes: 'green', yes: 'green', maybe: 'amber', no: 'rose' }
const SCORE_RING = {
  green: 'ring-emerald-200 bg-emerald-50 text-emerald-700',
  blue: 'ring-sky-200 bg-sky-50 text-sky-700',
  amber: 'ring-amber-200 bg-amber-50 text-amber-700',
  rose: 'ring-rose-200 bg-rose-50 text-rose-700',
}

const PANELS = [
  { id: 'score', label: 'Score' },
  { id: 'notes', label: 'Notes' },
  { id: 'screen', label: 'Screen' },
  { id: 'email', label: 'Email' },
  { id: 'offer', label: 'Offer' },
  { id: 'onboard', label: 'Onboard' },
]

export default function CandidateCard({ app, onChange, compact = false }) {
  const { toast } = useToast()
  const [panel, setPanel] = useState(null)
  const [busy, setBusy] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideNote, setOverrideNote] = useState('')
  const [stageModal, setStageModal] = useState(null)
  const [stageNote, setStageNote] = useState('')
  const [notesDraft, setNotesDraft] = useState(app.notes || '')
  const [resumeOpen, setResumeOpen] = useState(false)
  const c = app.candidate
  const dims = app.score_dimensions || {}
  const tone = scoreTone(app.score_overall)

  async function move(stage, note = '') {
    setBusy(true)
    try {
      await api.moveStage(app.id, stage, note)
      await onChange()
      toast(`Moved to ${stage}`)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  function onStageSelect(stage) {
    if (stage === app.stage) return
    setStageModal(stage)
    setStageNote('')
  }

  async function confirmStage() {
    if (!stageModal) return
    await move(stageModal, stageNote)
    setStageModal(null)
  }

  async function saveNotes() {
    setBusy(true)
    try {
      await api.updateNotes(app.id, notesDraft)
      await onChange()
      toast('Notes saved')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function rescore() {
    setBusy(true)
    try {
      await api.rescore(app.id)
      await onChange()
      toast('Re-scored with AI')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function saveOverride() {
    setBusy(true)
    try {
      await api.override(app.id, { recommendation: 'human_reviewed', note: overrideNote })
      setOverrideOpen(false)
      setOverrideNote('')
      await onChange()
      toast('Human override saved')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (compact) {
    return (
      <Card className="p-3">
        <div className="flex items-center gap-2">
          <Avatar name={c.name} className="h-8 w-8 text-xs" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-900">{c.name || 'Unnamed'}</div>
            <Badge tone={stageTone[app.stage] || 'gray'} className="mt-0.5">{app.stage}</Badge>
          </div>
          <span className={cx('flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ring-2', SCORE_RING[tone])}>
            {Math.round(app.score_overall)}
          </span>
        </div>
        <select className={`${inputClass} mt-2 py-1 text-xs`} value={app.stage} disabled={busy} onChange={(e) => onStageSelect(e.target.value)}>
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Card>
    )
  }

  return (
    <>
      <Card className="p-4">
        <div className="flex items-start gap-4">
          <Avatar name={c.name} className={cx('ring-2', SCORE_RING[tone])} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">{c.name || 'Unnamed'}</span>
              <Badge tone={REC_TONE[app.recommendation] || 'gray'}>{(app.recommendation || '').replace('_', ' ') || 'unscored'}</Badge>
              <Badge tone={stageTone[app.stage] || 'gray'}>{app.stage}</Badge>
              {app.fit_label && <Badge tone="blue">{app.fit_label}</Badge>}
              <Badge tone="gray">{c.source}</Badge>
              {app.human_override?.note && <Badge tone="violet">human-reviewed</Badge>}
            </div>
            <div className="text-xs text-slate-400">{c.email || 'no email'} · {c.parsed?.total_yoe ?? '?'} yrs · {(c.parsed?.skills || []).slice(0, 6).join(', ')}</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-slate-800">{Math.round(app.score_overall)}<span className="text-xs font-normal text-slate-400"> /100</span></div>
            {c.ai_summary && <p className="mt-1 text-xs text-slate-500">{c.ai_summary}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select className={inputClass} value={app.stage} disabled={busy} onChange={(e) => onStageSelect(e.target.value)}>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {PANELS.map((p) => (
                  <button key={p.id} type="button" onClick={() => setPanel(panel === p.id ? null : p.id)} className={cx('rounded-md px-2.5 py-1 text-xs font-medium transition duration-150 ease-snappy active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50', panel === p.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
                    {p.label}
                  </button>
                ))}
              </div>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={rescore} disabled={busy}><RefreshCw className="h-3 w-3" /> Re-score</Button>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setResumeOpen(true)} disabled={!c.resume_text}><FileText className="h-3 w-3" /> Resume</Button>
              <Button variant="subtle" className="px-2 py-1 text-xs" onClick={() => setOverrideOpen(true)} disabled={busy}>Override</Button>
              {busy && <Spinner />}
            </div>
          </div>
        </div>

        {panel === 'score' && (
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Object.entries(dims).map(([k, v]) => <ScoreBar key={k} label={k} value={v} />)}
            </div>
            {app.score_rationale && <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-600">{app.score_rationale}</div>}
            {app.scored_at && <p className="text-xs text-slate-400">Scored {new Date(app.scored_at).toLocaleString()}</p>}
            {app.human_override?.note && (
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs text-brand-700">
                <strong>Human note:</strong> {app.human_override.note}
              </div>
            )}
          </div>
        )}
        {panel === 'notes' && (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <textarea className={`${inputClass} h-24 resize-y`} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Recruiter notes on this candidate…" />
            <Button className="text-xs" onClick={saveNotes} disabled={busy}><StickyNote className="h-3 w-3" /> Save notes</Button>
          </div>
        )}
        {panel === 'screen' && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <InterviewPlanningPanel app={app} onChange={onChange} />
          </div>
        )}
        {panel === 'email' && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <EmailPanel app={app} />
          </div>
        )}
        {panel === 'offer' && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <OfferPanel app={app} />
          </div>
        )}
        {panel === 'onboard' && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <OnboardingPanel app={app} />
          </div>
        )}
      </Card>

      <Modal open={!!stageModal} onClose={() => setStageModal(null)} title={`Move to ${stageModal}`}
        footer={<><Button variant="ghost" onClick={() => setStageModal(null)}>Cancel</Button><Button onClick={confirmStage} disabled={busy}>{busy ? <Spinner /> : 'Confirm'}</Button></>}>
        <p className="mb-2 text-sm text-slate-600">Optional note for the audit trail:</p>
        <textarea className={`${inputClass} h-20 resize-none`} value={stageNote} onChange={(e) => setStageNote(e.target.value)} placeholder="Reason for stage change…" />
      </Modal>

      <Modal open={overrideOpen} onClose={() => setOverrideOpen(false)} title="Human override"
        footer={<><Button variant="ghost" onClick={() => setOverrideOpen(false)}>Cancel</Button><Button onClick={saveOverride} disabled={busy || !overrideNote.trim()}>{busy ? <Spinner /> : 'Save'}</Button></>}>
        <p className="mb-3 text-sm text-slate-600">Add a note that overrides the AI suggestion.</p>
        <textarea className={`${inputClass} h-24 resize-none`} value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} placeholder="Your decision and reasoning…" />
      </Modal>

      <Modal open={resumeOpen} onClose={() => setResumeOpen(false)} title="Resume">
        <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap text-xs text-slate-600">{c.resume_text || 'No resume text.'}</pre>
      </Modal>
    </>
  )
}

