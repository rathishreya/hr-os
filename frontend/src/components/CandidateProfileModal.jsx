import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  X, Mail, Phone, Globe, MapPin, Download, ExternalLink, Send, FileText, Bot,
} from 'lucide-react'
import { api } from '../api'
import {
  Badge, Button, Spinner, Avatar, Tabs, inputClass, stageTone, scoreTone, cx,
} from '../ui'
import { useToast } from './Toast'
import FormattedResume from './role/FormattedResume'

const ROUND_TONE = { draft: 'gray', scheduled: 'blue', completed: 'green', cancelled: 'rose', no_show: 'amber' }
const EMAIL_TONE = { sent: 'green', logged: 'blue', failed: 'rose' }

function fmtDate(v) {
  if (!v) return ''
  const d = new Date(v)
  return isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const PROFILE_TABS = [
  { id: 'resume', label: 'Resume' },
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'Candidate History' },
  { id: 'offers', label: 'Offers' },
  { id: 'comments', label: 'Comments' },
]

function ContactBox({ href, label, icon: Icon, external }) {
  const inner = (
    <>
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
    </>
  )
  const cls = 'flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors duration-150 ease-snappy'
  if (!href) {
    return <span className={cx(cls, 'cursor-default opacity-40')} title="Not available">{inner}</span>
  }
  return (
    <a
      href={href}
      title={label}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      onClick={(e) => e.stopPropagation()}
      className={cx(cls, 'hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50')}
    >
      {inner}
    </a>
  )
}

function SectionTitle({ children }) {
  return (
    <h3 className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-800">
      {children}
    </h3>
  )
}

function DataTable({ columns, rows, empty }) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        {empty}
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="whitespace-nowrap px-4 py-3">{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className="hover:bg-slate-50/80">
              {columns.map((col) => (
                <td key={col.key} className="whitespace-nowrap px-4 py-3 text-slate-700">
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CandidateProfileModal({ candidateId, open, onClose, roles = [], onApplied }) {
  const { toast } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('resume')
  const [applyRole, setApplyRole] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadErr, setLoadErr] = useState(false)
  const [hist, setHist] = useState({ rounds: [], convos: [], loading: false })

  function loadProfile() {
    setLoading(true)
    setLoadErr(false)
    api.getCandidateProfile(candidateId)
      .then(setData)
      .catch(() => setLoadErr(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open || !candidateId) return
    setTab('resume')
    setData(null)
    setApplyRole('')
    setHist({ rounds: [], convos: [], loading: false })
    loadProfile()
  }, [open, candidateId])

  // Real interview rounds + conversation (emails + AI screenings) across the candidate's applications.
  useEffect(() => {
    const applications = data?.applications || []
    if (!open || applications.length === 0) return
    let cancelled = false
    setHist((h) => ({ ...h, loading: true }))
    Promise.all(applications.map((a) => Promise.all([
      api.listInterviewRounds(a.application_id).catch(() => []),
      api.listEmails(a.application_id).catch(() => []),
      api.listScreening(a.application_id).catch(() => []),
    ]).then(([rounds, emails, screens]) => ({
      rounds: (rounds || []).map((r) => ({ ...r, _position: a.position })),
      convos: [
        ...(emails || []).map((e) => ({
          id: `e${e.id}`, kind: 'email', title: e.subject, body: e.body,
          status: e.status, at: e.created_at, position: a.position, ai: e.ai_generated,
        })),
        ...(screens || []).filter((s) => s.status === 'completed').map((s) => ({
          id: `s${s.id}`, kind: 'screen', title: `AI screening — ${s.recommendation || 'completed'}`,
          body: s.summary, at: s.completed_at || s.created_at, position: a.position, ai: true,
        })),
      ],
    })))).then((results) => {
      if (cancelled) return
      const rounds = results.flatMap((r) => r.rounds)
      const convos = results.flatMap((r) => r.convos).sort((x, y) => new Date(y.at) - new Date(x.at))
      setHist({ rounds, convos, loading: false })
    }).catch(() => { if (!cancelled) setHist({ rounds: [], convos: [], loading: false }) })
    return () => { cancelled = true }
  }, [open, candidateId, data])

  if (!open) return null

  const c = data?.candidate || {}
  const p = c.parsed || {}
  const apps = data?.applications || []
  const company = p.current_company || p.companies?.[0]?.name || ''
  const title = p.current_title || p.companies?.[0]?.title || ''
  const roleTitle = [title, company].filter(Boolean).join(' at ') || 'Candidate'
  const fileUrl = `/api/candidates/${candidateId}/resume-file`
  const hasFile = !!(c.resume_filename || c.resume_mime)
  const isPdf = (c.resume_mime || '').includes('pdf') || (c.resume_filename || '').toLowerCase().endsWith('.pdf')
  const linkedin = p.linkedin
    ? (p.linkedin.startsWith('http') ? p.linkedin : `https://${p.linkedin}`)
    : ''

  const roleById = Object.fromEntries((roles || []).map((r) => [r.id, r]))
  const offerApps = apps.filter((a) => ['offer', 'hired'].includes(a.stage))

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
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const historyColumns = [
    {
      key: 'job_id',
      label: 'Job ID',
      render: (row) => (
        <Link to={`/roles/${row.hiring_request_id}`} onClick={onClose} className="font-medium text-brand-600 hover:underline">
          {row.hiring_request_id}
        </Link>
      ),
    },
    { key: 'position', label: 'Job Title', render: (row) => row.position || '—' },
    {
      key: 'department',
      label: 'Department',
      render: (row) => row.department || roleById[row.hiring_request_id]?.department || '—',
    },
    { key: 'source', label: 'Source', render: () => <span className="capitalize">{c.source || '—'}</span> },
    {
      key: 'stage',
      label: 'Status',
      render: (row) => (
        <span className="flex items-center gap-2">
          {row.score_overall > 0 && <Badge tone={scoreTone(row.score_overall)}>{Math.round(row.score_overall)}</Badge>}
          <Badge tone={stageTone[row.stage] || 'gray'}>{row.stage}</Badge>
        </span>
      ),
    },
  ]

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/40" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        className="relative flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-slate-500">
            <Spinner /> Loading candidate…
          </div>
        ) : loadErr ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
            <p className="text-sm">Couldn't load this candidate.</p>
            <Button variant="ghost" onClick={loadProfile}>Retry</Button>
          </div>
        ) : (
          <>
            {/* Header — reference-style */}
            <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <Avatar name={c.name} className="h-16 w-16 shrink-0 rounded-full text-xl ring-4 ring-slate-100" />
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 text-balance">{c.name || 'Unnamed'}</h2>
                    <p className="mt-0.5 text-sm font-medium text-slate-600">{roleTitle}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Source Details: <span className="capitalize">{c.source || 'direct'}</span>
                      {p.sub_source && p.sub_source !== c.source && (
                        <> — <span className="capitalize">{p.sub_source}</span></>
                      )}
                    </p>
                    {p.location && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="h-3 w-3" />{p.location}
                      </p>
                    )}
                    <div className="mt-4 flex gap-2">
                      <ContactBox href={linkedin} label="LinkedIn" icon={Globe} external />
                      <ContactBox href={c.phone ? `tel:${c.phone}` : ''} label="Phone" icon={Phone} />
                      <ContactBox href={c.email ? `mailto:${c.email}` : ''} label="Email" icon={Mail} />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-lg p-2 text-slate-400 transition-[color,background-color,transform] duration-150 ease-snappy hover:bg-slate-100 hover:text-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="shrink-0 border-b border-slate-200 px-6">
              <Tabs tabs={PROFILE_TABS} active={tab} onChange={setTab} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 p-6">
              {tab === 'resume' && (
                <div className="flex h-full min-h-[480px] flex-col">
                  <div className="mb-3 flex items-center justify-end gap-2">
                    {hasFile && (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-[color,border-color,transform] duration-150 ease-snappy hover:border-brand-300 hover:text-brand-700 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                      >
                        <Send className="h-4 w-4" /> Share Resume
                      </a>
                    )}
                    {(hasFile || c.resume_text) && (
                      <a
                        href={fileUrl}
                        download={c.resume_filename || 'resume'}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition-[background-color,transform] duration-150 ease-snappy hover:bg-slate-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                  {isPdf && hasFile ? (
                    <iframe
                      title="Resume preview"
                      src={fileUrl}
                      className="min-h-[520px] flex-1 w-full rounded-xl border border-slate-300 bg-white shadow-inner"
                    />
                  ) : c.resume_text ? (
                    <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <FormattedResume text={c.resume_text} />
                    </div>
                  ) : hasFile ? (
                    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16">
                      <FileText className="mb-3 h-10 w-10 text-slate-300" />
                      <p className="text-sm text-slate-600">Preview not available for this file type.</p>
                      <a href={fileUrl} target="_blank" rel="noreferrer" className="mt-4 text-sm font-medium text-brand-600 hover:underline">
                        <ExternalLink className="mr-1 inline h-4 w-4" /> Download {c.resume_filename}
                      </a>
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                      No resume on file.
                    </div>
                  )}
                </div>
              )}

              {tab === 'overview' && (
                <div className="mx-auto max-w-3xl space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  {c.ai_summary && (
                    <div>
                      <SectionTitle>Professional Summary</SectionTitle>
                      <p className="text-sm leading-relaxed text-slate-700">{c.ai_summary}</p>
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-400">Experience</div>
                      <div className="mt-1 text-sm text-slate-800">{p.total_yoe != null ? `${p.total_yoe} years` : '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-400">Compensation</div>
                      <div className="mt-1 text-sm text-slate-800">
                        {p.current_ctc && <div>Current: {p.current_ctc}</div>}
                        {p.salary_expectation && <div>Expected: {p.salary_expectation}</div>}
                        {!p.current_ctc && !p.salary_expectation && '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-400">Education</div>
                      <div className="mt-1 text-sm text-slate-800">
                        {p.education?.[0]
                          ? `${p.education[0].degree || ''}${p.education[0].institution ? ` · ${p.education[0].institution}` : ''}`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-400">Notice period</div>
                      <div className="mt-1 text-sm text-slate-800">{p.notice_period || '—'}</div>
                    </div>
                  </div>
                  {p.skills?.length > 0 && (
                    <div>
                      <SectionTitle>Core Competencies</SectionTitle>
                      <div className="flex flex-wrap gap-1.5">
                        {p.skills.map((s) => (
                          <span key={s} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {p.companies?.length > 0 && (
                    <div>
                      <SectionTitle>Professional Experience</SectionTitle>
                      <ul className="space-y-3">
                        {p.companies.map((co, i) => (
                          <li key={i} className="text-sm">
                            <span className="font-semibold text-slate-900">{co.title || 'Role'}</span>
                            {co.name && <span className="text-slate-600"> — {co.name}</span>}
                            {co.duration && <span className="text-slate-400"> ({co.duration})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {tab === 'history' && (
                <div className="space-y-8">
                  <div>
                    <SectionTitle>Interview History</SectionTitle>
                    <DataTable
                      columns={[
                        { key: 'job', label: 'Job Title', render: (r) => r._position || `#${r.application_id}` },
                        { key: 'round', label: 'Round', render: (r) => `${r.round_number}. ${(r.interview_type || 'other').replace(/_/g, ' ')}` },
                        { key: 'when', label: 'When', render: (r) => r.scheduled_at || '—' },
                        { key: 'panel', label: 'Panel', render: (r) => (r.panelists || []).join(', ') || '—' },
                        { key: 'status', label: 'Status', render: (r) => <Badge tone={ROUND_TONE[r.status] || 'gray'}>{r.status}</Badge> },
                      ]}
                      rows={hist.rounds}
                      empty={hist.loading ? 'Loading…' : 'No interview rounds scheduled yet.'}
                    />
                  </div>
                  <div>
                    <SectionTitle>Candidate History</SectionTitle>
                    <DataTable columns={historyColumns} rows={apps} empty="No applications yet." />
                  </div>
                  <div>
                    <SectionTitle>Conversation History</SectionTitle>
                    {hist.loading ? (
                      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500"><Spinner /> Loading…</div>
                    ) : hist.convos.length === 0 ? (
                      <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
                        No emails or AI screenings yet.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {hist.convos.map((m) => (
                          <li key={m.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
                            <div className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', m.kind === 'email' ? 'bg-sky-50 text-sky-600' : 'bg-brand-50 text-brand-600')}>
                              {m.kind === 'email' ? <Mail className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-slate-800">{m.title}</span>
                                {m.ai && <Badge tone="violet">AI</Badge>}
                                {m.status && <Badge tone={EMAIL_TONE[m.status] || 'gray'}>{m.status}</Badge>}
                                <span className="ml-auto text-xs text-slate-400">{fmtDate(m.at)}</span>
                              </div>
                              {m.position && <div className="text-xs text-slate-400">{m.position}</div>}
                              {m.body && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{m.body}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {tab === 'offers' && (
                <div>
                  <SectionTitle>Offers</SectionTitle>
                  {offerApps.length === 0 ? (
                    <p className="text-sm text-slate-500">No offers for this candidate yet.</p>
                  ) : (
                    <DataTable
                      columns={historyColumns}
                      rows={offerApps}
                      empty="No offers."
                    />
                  )}
                </div>
              )}

              {tab === 'comments' && (
                <div className="mx-auto max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <SectionTitle>Recruiter notes</SectionTitle>
                  <p className="text-xs text-slate-500">Notes are saved per job application when you manage a candidate on a role.</p>
                  {apps.filter((a) => a.notes).length === 0 ? (
                    <p className="text-sm text-slate-400">No comments yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {apps.filter((a) => a.notes).map((a) => (
                        <li key={a.application_id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <div className="mb-1 text-xs font-semibold text-brand-700">{a.position}</div>
                          <p className="whitespace-pre-wrap text-sm text-slate-700">{a.notes}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-6 py-3">
              <select className={`${inputClass} max-w-md flex-1`} value={applyRole} onChange={(e) => setApplyRole(e.target.value)}>
                <option value="">Apply to a job…</option>
                {roles.filter((r) => r.status === 'open').map((r) => (
                  <option key={r.id} value={r.id}>{r.position}</option>
                ))}
              </select>
              <Button disabled={!applyRole || busy} onClick={apply}>{busy ? <Spinner /> : 'Apply to job'}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
