import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  X, Mail, Phone, Globe, MapPin, Briefcase, GraduationCap, Banknote, Clock, FileText, ExternalLink,
} from 'lucide-react'
import { api } from '../api'
import { Badge, Button, Spinner, Avatar, inputClass, stageTone, scoreTone, cx } from '../ui'
import { useToast } from './Toast'
import { useResumeFile } from '../hooks/useResumeFile'
import { fmtComp } from './talent/TalentPoolTable'

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
        <div className="text-sm text-slate-700">{children || '—'}</div>
      </div>
    </div>
  )
}

export default function CandidateProfileDrawer({ candidateId, open, onClose, roles = [], onApplied }) {
  const { toast } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [applyRole, setApplyRole] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !candidateId) return
    setLoading(true); setData(null); setApplyRole('')
    api.getCandidateProfile(candidateId).then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [open, candidateId])

  // Hook must run unconditionally (above the early return). Auth-gated file → blob URL.
  const _cand = data?.candidate
  const _hasFile = !!(_cand?.resume_filename || _cand?.resume_mime)
  const { url: fileUrl, state: fileState } = useResumeFile(candidateId, open && _hasFile)

  if (!open) return null

  const c = data?.candidate || {}
  const p = c.parsed || {}
  const apps = data?.applications || []
  const company = p.current_company || p.companies?.[0]?.name || ''
  const title = p.current_title || p.companies?.[0]?.title || ''
  const isPdf = (c.resume_mime || '').includes('pdf') || (c.resume_filename || '').toLowerCase().endsWith('.pdf')

  async function apply() {
    if (!applyRole) return
    setBusy(true)
    try {
      await api.applyCandidate(candidateId, Number(applyRole))
      toast('Applied to job')
      setApplyRole('')
      const fresh = await api.getCandidateProfile(candidateId)
      setData(fresh)
      onApplied?.()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/20" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-slate-500"><Spinner /> Loading profile…</div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-brand-50 to-fuchsia-50 px-6 py-5">
              <div className="flex items-start gap-4">
                <Avatar name={c.name} className="h-14 w-14 text-lg ring-2 ring-white" />
                <div>
                  <h2 className="text-xl font-bold text-slate-900 text-balance">{c.name || 'Unnamed'}</h2>
                  <p className="text-sm text-slate-600">{[title, company].filter(Boolean).join(' · ') || 'Candidate'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {p.total_yoe != null && <Badge tone="blue">{p.total_yoe} yrs exp</Badge>}
                    <Badge tone="gray">{c.source}</Badge>
                    {p.location && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{p.location}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <ContactIcon href={c.email && `mailto:${c.email}`} title={c.email} icon={Mail} />
                <ContactIcon href={c.phone && `tel:${c.phone}`} title={c.phone} icon={Phone} />
                <ContactIcon href={p.linkedin} title="LinkedIn" icon={Globe} external />
                <button type="button" onClick={onClose} aria-label="Close" className="ml-1 rounded-lg p-2 text-slate-500 transition-[background-color,transform] duration-150 ease-snappy hover:bg-white/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {/* Snapshot grid */}
              <div className="grid grid-cols-2 gap-4">
                <Row icon={Briefcase} label="Current role">{[title, company].filter(Boolean).join(' · ')}</Row>
                <Row icon={GraduationCap} label="Education">
                  {p.education?.[0] ? `${p.education[0].degree || ''}${p.education[0].institution ? ` · ${p.education[0].institution}` : ''}` : ''}
                </Row>
                <Row icon={Banknote} label="Compensation">
                  {(p.current_ctc || p.salary_expectation)
                    ? <>{p.current_ctc && <span>Current: {fmtComp(p.current_ctc)}</span>}{p.current_ctc && p.salary_expectation && <br />}{p.salary_expectation && <span>Expected: {fmtComp(p.salary_expectation)}</span>}</>
                    : ''}
                </Row>
                <Row icon={Clock} label="Notice period">{p.notice_period}</Row>
              </div>

              {p.skills?.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Skills</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {p.skills.map((s) => <span key={s} className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{s}</span>)}
                  </div>
                </div>
              )}

              {p.companies?.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Experience</h4>
                  <ul className="space-y-2">
                    {p.companies.map((co, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-medium text-slate-800">{co.title || 'Role'}</span>
                        {co.name && <span className="text-slate-500"> · {co.name}</span>}
                        {co.duration && <span className="ml-1 text-xs text-slate-400">({co.duration})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Applications */}
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Applications ({apps.length})</h4>
                {apps.length === 0 ? (
                  <p className="text-sm text-slate-400">Not applied to any job yet.</p>
                ) : (
                  <div className="space-y-2">
                    {apps.map((a) => (
                      <Link key={a.application_id} to={`/roles/${a.hiring_request_id}`} onClick={onClose}
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm transition-[color,background-color,border-color,transform] duration-150 ease-snappy hover:border-brand-300 hover:bg-brand-50/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">
                        <span className="font-medium text-slate-800">{a.position || 'Role'}</span>
                        <span className="flex items-center gap-2">
                          {a.score_overall ? <Badge tone={scoreTone(a.score_overall)}>{Math.round(a.score_overall)}</Badge> : null}
                          <Badge tone={stageTone[a.stage] || 'gray'}>{a.stage}</Badge>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Resume */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Resume</h4>
                  {_hasFile && fileState === 'ready' && (
                    <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded text-xs font-medium text-brand-600 transition-colors duration-150 ease-snappy hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">
                      <ExternalLink className="h-3.5 w-3.5" /> Open
                    </a>
                  )}
                </div>
                {isPdf && fileState === 'loading' ? (
                  <div className="flex h-[60vh] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-500"><Spinner /> Loading résumé…</div>
                ) : isPdf && fileState === 'ready' ? (
                  <iframe title="Resume" src={fileUrl} className="h-[60vh] w-full rounded-xl border border-slate-200" />
                ) : c.resume_text ? (
                  <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">{c.resume_text}</pre>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                    <FileText className="mx-auto mb-2 h-5 w-5 text-slate-300" /> No resume on file.
                  </p>
                )}
              </div>
            </div>

            {/* Apply footer */}
            <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3">
              <select className={`${inputClass} flex-1`} value={applyRole} onChange={(e) => setApplyRole(e.target.value)}>
                <option value="">Apply to a job…</option>
                {roles.filter((r) => r.status === 'open').map((r) => <option key={r.id} value={r.id}>{r.position}</option>)}
              </select>
              <Button disabled={!applyRole || busy} onClick={apply}>{busy ? <Spinner /> : 'Apply'}</Button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

function ContactIcon({ href, title, icon: Icon, external }) {
  const cls = 'rounded-lg p-2 transition-[color,background-color,transform] duration-150 ease-snappy'
  if (!href) return <span className={cx(cls, 'cursor-default text-slate-300')} title="Not available"><Icon className="h-4 w-4" /></span>
  return (
    <a href={href} title={title} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}
      onClick={(e) => e.stopPropagation()} className={cx(cls, 'text-slate-500 hover:bg-white/70 hover:text-brand-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50')}>
      <Icon className="h-4 w-4" />
    </a>
  )
}
