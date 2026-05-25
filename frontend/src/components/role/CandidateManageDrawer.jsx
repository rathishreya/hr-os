import { useEffect, useState } from 'react'
import { X, Download, FileText, SlidersHorizontal } from 'lucide-react'
import { Badge, IconButton, Tabs, ScoreBar, Button, Spinner, Field, inputClass, scoreTone, stageTone } from '../../ui'
import { api } from '../../api'
import { useToast } from '../Toast'
import InterviewPlanningPanel from './InterviewPlanningPanel'
import EmailPanel from './EmailPanel'
import OfferPanel from './OfferPanel'
import OnboardingPanel from './OnboardingPanel'
import FormattedResume from './FormattedResume'
import DrawerCustomizeModal from './DrawerCustomizeModal'
import {
  useDrawerPreferences,
  WIDTH_CLASSES,
  OVERLAY_CLASSES,
} from '../../hooks/useDrawerPreferences'

const STAGES = ['applied', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected']

export default function CandidateManageDrawer({ app, open, onClose, onRefresh }) {
  const { toast } = useToast()
  const { prefs, updatePrefs, resetPrefs, visibleTabs } = useDrawerPreferences()
  const [tab, setTab] = useState('overview')
  const [notesDraft, setNotesDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)

  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : (visibleTabs[0]?.id || 'overview')

  useEffect(() => {
    if (open && app) {
      const defaultId = visibleTabs.some((t) => t.id === prefs.defaultTab)
        ? prefs.defaultTab
        : visibleTabs[0]?.id || 'overview'
      setTab(defaultId)
      setNotesDraft(app.notes || '')
    }
  }, [open, app?.id, prefs.defaultTab, visibleTabs])

  if (!open || !app) return null

  const c = app.candidate || {}
  const meta = app.meta || {}
  const ov = prefs.overview

  async function saveNotes() {
    setBusy(true)
    try {
      await api.updateNotes(app.id, notesDraft)
      await onRefresh()
      toast('Notes saved')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function moveStage(stage) {
    setBusy(true)
    try {
      await api.moveStage(app.id, stage)
      await onRefresh()
      toast(`Moved to ${stage}`)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button
        type="button"
        aria-label="Close"
        className={`absolute inset-0 ${OVERLAY_CLASSES[prefs.overlay] || OVERLAY_CLASSES.light}`}
        onClick={onClose}
      />
      <aside className={`relative z-10 flex h-full w-full ${WIDTH_CLASSES[prefs.width] || WIDTH_CLASSES.medium} flex-col border-l border-slate-200 bg-white shadow-2xl`}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1 pr-2">
            <h2 className="text-lg font-semibold text-slate-900">{c.name || 'Unnamed'}</h2>
            <p className="text-sm text-slate-500">{c.email || 'no email'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={stageTone[app.stage] || 'gray'}>{app.stage}</Badge>
              <Badge tone={scoreTone(app.score_overall)}>{Math.round(app.score_overall)}/100</Badge>
              {meta.is_live && <Badge tone="violet">Live — AI interview</Badge>}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <IconButton onClick={() => setCustomizeOpen(true)} aria-label="Customize panel" title="Customize panel">
              <SlidersHorizontal className="h-5 w-5" />
            </IconButton>
            <IconButton onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></IconButton>
          </div>
        </div>

        {visibleTabs.length > 0 && (
          <div className="border-b border-slate-100 px-5">
            <Tabs tabs={visibleTabs} active={activeTab} onChange={setTab} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'overview' && (
            <div className="space-y-4 text-sm">
              {ov.stage && (
                <div className="flex gap-2">
                  <select className={inputClass} value={app.stage} disabled={busy} onChange={(e) => moveStage(e.target.value)}>
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              {ov.liveStatus && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Live status</div>
                  <p className="font-medium text-slate-800">{meta.activity || '—'}</p>
                </div>
              )}
              {ov.aiSummary && c.ai_summary && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">AI summary</h4>
                  <p className="text-slate-600">{c.ai_summary}</p>
                </div>
              )}
              {ov.screeningEmails && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-100 p-3">
                    <div className="text-xs text-slate-400">Screening</div>
                    <div className="font-medium capitalize text-slate-800">{meta.screening_status || 'none'}</div>
                    {meta.screening_score != null && <div className="text-xs text-slate-500">Score {meta.screening_score}</div>}
                  </div>
                  <div className="rounded-lg border border-slate-100 p-3">
                    <div className="text-xs text-slate-400">Emails</div>
                    <div className="font-medium text-slate-800">{meta.email_count || 0} sent</div>
                    {meta.last_email_template && <div className="text-xs text-slate-500">{meta.last_email_template}</div>}
                  </div>
                </div>
              )}
              {ov.interviewReport && meta.screening_summary && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">Interview report</h4>
                  <p className="rounded-lg bg-violet-50 p-3 text-slate-700">{meta.screening_summary}</p>
                </div>
              )}
              {ov.comments && app.notes && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">Comments</h4>
                  <p className="whitespace-pre-wrap text-slate-600">{app.notes}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'resume' && (
            <ResumePreview candidate={c} defaultView={prefs.resumeDefaultView} />
          )}

          {activeTab === 'score' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(app.score_dimensions || {}).map(([k, v]) => <ScoreBar key={k} label={k} value={v} />)}
              </div>
              {app.score_rationale && <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-600">{app.score_rationale}</p>}
              <Button variant="ghost" className="text-xs" disabled={busy} onClick={async () => { setBusy(true); try { await api.rescore(app.id); await onRefresh(); toast('Re-scored') } finally { setBusy(false) } }}>
                {busy ? <Spinner /> : 'Re-run AI score'}
              </Button>
            </div>
          )}

          {activeTab === 'screen' && <InterviewPlanningPanel app={app} onChange={onRefresh} />}
          {activeTab === 'email' && <EmailPanel app={app} />}
          {activeTab === 'offer' && <OfferPanel app={app} />}
          {activeTab === 'onboard' && <OnboardingPanel app={app} />}
          {activeTab === 'notes' && (
            <div className="space-y-3">
              <Field label="Recruiter comments">
                <textarea className={`${inputClass} h-40 resize-y`} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Internal notes, feedback from panels, next steps…" />
              </Field>
              <Button onClick={saveNotes} disabled={busy}>{busy ? <Spinner /> : 'Save comments'}</Button>
            </div>
          )}
        </div>
      </aside>

      <DrawerCustomizeModal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        prefs={prefs}
        onChange={updatePrefs}
        onReset={resetPrefs}
      />
    </div>
  )
}

function ResumePreview({ candidate, defaultView = 'formatted' }) {
  const text = (candidate.resume_text || '').trim()
  const fname = candidate.resume_filename || ''
  const mime = candidate.resume_mime || ''
  const hasFile = !!(fname || candidate.resume_mime)
  const fileUrl = `/api/candidates/${candidate.id}/resume-file`
  const isPdf = mime.includes('pdf') || fname.toLowerCase().endsWith('.pdf')
  const isImg = mime.startsWith('image/')
  const initialView = hasFile && isPdf && defaultView === 'document' ? 'document' : 'formatted'
  const [view, setView] = useState(initialView)

  useEffect(() => {
    setView(hasFile && isPdf && defaultView === 'document' ? 'document' : 'formatted')
  }, [candidate.id, defaultView, hasFile, isPdf])

  if (!text && !hasFile) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
        No resume on file for this candidate.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {hasFile && text && (
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setView('formatted')}
              className={`rounded-md px-3 py-1 font-medium ${view === 'formatted' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}
            >
              Formatted
            </button>
            {isPdf && (
              <button
                type="button"
                onClick={() => setView('document')}
                className={`rounded-md px-3 py-1 font-medium ${view === 'document' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}
              >
                Original PDF
              </button>
            )}
          </div>
          <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700">
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        </div>
      )}

      {view === 'document' && hasFile && isPdf ? (
        <iframe title="Resume preview" src={fileUrl} className="h-[72vh] w-full rounded-xl border border-slate-200 bg-white" />
      ) : view === 'document' && hasFile && isImg ? (
        <img src={fileUrl} alt="Resume" className="w-full rounded-xl border border-slate-200" />
      ) : view === 'document' && hasFile ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <p className="text-sm text-slate-600">Preview not available for this file type.</p>
          <a href={fileUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
            <Download className="h-4 w-4" /> Download {fname || 'resume'}
          </a>
        </div>
      ) : (
        <div className="max-h-[calc(100vh-220px)] overflow-y-auto rounded-lg bg-slate-100/80 p-3 sm:p-4">
          <FormattedResume text={text} />
        </div>
      )}
    </div>
  )
}

