import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, AlertTriangle, Briefcase, LayoutGrid, List, Sparkles } from 'lucide-react'
import { api } from '../api'
import { Card, Badge, Button, Field, Spinner, Skeleton, PageHeader, EmptyState, inputClass, cx } from '../ui'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'
import JobsListTable from '../components/jobs/JobsListTable'
import MultiSelect from '../components/MultiSelect'
import { SkillChecklist, ApplicationQuestionsBuilder, InterviewTypesPicker, mergeSkills, useTeamOptions } from '../components/role/jobFormParts'

const VIEW_KEY = 'hr-os-jobs-view'

const EMPTY = {
  position: '', department: '', budget_ctc: '', yoe_min: 0, yoe_max: 0,
  mandatory_skills: [], preferred_skills: [], priority: 'medium',
  hiring_deadline: '', location: '', work_mode: 'hybrid', num_openings: 1,
  start_hiring_date: '', application_questions: [], interview_types: [],
  hiring_manager: '', recruiter: '', panelists: [],
}

// Priority as a leading dot, not a colored side-stripe (side-stripes read as templated).
const PRIORITY_DOT = { urgent: 'bg-rose-500', high: 'bg-amber-500', medium: 'bg-sky-500', low: 'bg-slate-300' }

function NewRoleForm({ onCreated, onCancel }) {
  const { toast } = useToast()
  const [f, setF] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  // Team dropdowns are mapped from people in Settings → Users & roles.
  const teamOpts = useTeamOptions()

  // Skill suggestions — auto-filled from position/department/experience; the user edits the checklist.
  const [mandSug, setMandSug] = useState([])
  const [prefSug, setPrefSug] = useState([])
  const [suggesting, setSuggesting] = useState(false)
  const lastKey = useRef('')
  const touched = useRef(false)  // true once the user edits a skill list — then auto-fill backs off

  // Skill setters that also mark the lists as user-touched.
  const setMand = (next) => { touched.current = true; setF((p) => ({ ...p, mandatory_skills: next })) }
  const setPref = (next) => { touched.current = true; setF((p) => ({ ...p, preferred_skills: next })) }

  const fetchSuggestions = useCallback(async (merge = false) => {
    const position = f.position.trim()
    if (!position) return
    const key = `${position}|${f.department}|${f.yoe_min}|${f.yoe_max}`
    if (!merge && key === lastKey.current) return  // auto: skip if nothing relevant changed
    lastKey.current = key
    setSuggesting(true)
    try {
      const res = await api.suggestSkills({
        position, department: f.department,
        yoe_min: Number(f.yoe_min) || 0, yoe_max: Number(f.yoe_max) || 0,
      })
      const m = res.mandatory_skills || []
      const p = res.preferred_skills || []
      // Manual "Suggest" unions into the pool; an auto re-suggest for a new role REPLACES it,
      // so stale chips from a previous position don't linger.
      setMandSug((cur) => (merge ? mergeSkills(cur, m) : m))
      setPrefSug((cur) => (merge ? mergeSkills(cur, p) : p))
      setF((prev) => {
        if (merge) return { ...prev, mandatory_skills: mergeSkills(prev.mandatory_skills, m), preferred_skills: mergeSkills(prev.preferred_skills, p) }
        if (!touched.current) return { ...prev, mandatory_skills: m, preferred_skills: p }  // auto-fill only until the user edits
        return prev  // respect deliberate edits (incl. a deliberate clear)
      })
      // The manual button gives explicit feedback; the auto path stays silent.
      if (merge) {
        toast(m.length || p.length
          ? `Suggested ${m.length} mandatory + ${p.length} preferred skills`
          : 'No skills suggested for this role')
      }
    } catch (e) {
      // Auto-suggest is best-effort and stays silent; a manual click surfaces the error.
      if (merge) toast(e.message || 'Could not fetch skill suggestions', 'error')
    } finally {
      setSuggesting(false)
    }
  }, [f.position, f.department, f.yoe_min, f.yoe_max, toast])

  // Debounced auto-suggest once the role basics are entered (fetchSuggestions no-ops if the
  // position is blank, and is re-created whenever position/department/yoe change).
  useEffect(() => {
    const t = setTimeout(() => fetchSuggestions(false), 700)
    return () => clearTimeout(t)
  }, [fetchSuggestions])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const role = await api.createRole({
        ...f,
        yoe_min: Number(f.yoe_min), yoe_max: Number(f.yoe_max), num_openings: Number(f.num_openings),
        mandatory_skills: f.mandatory_skills, preferred_skills: f.preferred_skills,
        interview_panel: f.panelists,
      })
      // Draft the JD right away so the HR can review & approve it — but DON'T publish.
      // Publishing/posting/TPO outreach is the explicit approval step on the Job post tab.
      let jdReady = false
      try {
        await api.generateJD(role.id)
        jdReady = true
      } catch {
        // JD generation is best-effort at create time; the HR can generate it on the Job post tab.
      }
      onCreated(role, { jdReady })
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Position *"><input required className={inputClass} value={f.position} onChange={set('position')} placeholder="Senior Backend Engineer" /></Field>
          <Field label="Department"><input className={inputClass} value={f.department} onChange={set('department')} placeholder="Engineering" /></Field>
          <Field label="Budget / CTC"><input className={inputClass} value={f.budget_ctc} onChange={set('budget_ctc')} placeholder="20-28 LPA" /></Field>
          <Field label="Location"><input className={inputClass} value={f.location} onChange={set('location')} placeholder="Bengaluru" /></Field>
          <Field label="Min YOE"><input type="number" min="0" step="0.5" className={inputClass} value={f.yoe_min} onChange={set('yoe_min')} /></Field>
          <Field label="Max YOE"><input type="number" min="0" step="0.5" className={inputClass} value={f.yoe_max} onChange={set('yoe_max')} /></Field>
          <Field label="Priority">
            <select className={inputClass} value={f.priority} onChange={set('priority')}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field label="Work mode">
            <select className={inputClass} value={f.work_mode} onChange={set('work_mode')}>
              <option value="onsite">Onsite</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option>
            </select>
          </Field>
          <Field label="Hiring deadline"><input type="date" className={inputClass} value={f.hiring_deadline} onChange={set('hiring_deadline')} /></Field>
          <Field label="Start hiring date" hint="When the team begins actively hiring"><input type="date" className={inputClass} value={f.start_hiring_date} onChange={set('start_hiring_date')} /></Field>
          <Field label="Openings"><input type="number" min="1" className={inputClass} value={f.num_openings} onChange={set('num_openings')} /></Field>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Team</h3>
          <p className="text-xs text-slate-400">Mapped from people in Settings → Users &amp; roles.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Hiring manager">
              <select className={inputClass} value={f.hiring_manager} onChange={set('hiring_manager')}>
                <option value="">Select…</option>
                {teamOpts.hm.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Recruiter">
              <select className={inputClass} value={f.recruiter} onChange={set('recruiter')}>
                <option value="">Select…</option>
                {teamOpts.rec.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Panelists">
              <MultiSelect
                options={teamOpts.panel}
                value={f.panelists}
                onChange={(next) => setF((p) => ({ ...p, panelists: next }))}
                placeholder="Select panelists…"
              />
            </Field>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Sparkles className="h-3.5 w-3.5 text-brand-500" /> Skills
            </h3>
            <Button type="button" variant="ghost" className="text-xs" disabled={!f.position.trim() || suggesting} onClick={() => fetchSuggestions(true)}>
              {suggesting ? <Spinner /> : <><Sparkles className="h-3.5 w-3.5" /> Suggest from role</>}
            </Button>
          </div>
          <p className="text-xs text-slate-400">Auto-suggested from the position, department &amp; experience — tick the ones that apply, untick the rest, or add your own.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SkillChecklist
              label="Mandatory skills"
              selected={f.mandatory_skills}
              setSelected={setMand}
              suggestions={mandSug}
              loading={suggesting}
              accent="violet"
              emptyHint="Enter a position above for suggestions, or add your own."
            />
            <SkillChecklist
              label="Preferred skills"
              selected={f.preferred_skills}
              setSelected={setPref}
              suggestions={prefSug}
              loading={suggesting}
              accent="amber"
              emptyHint="Enter a position above for suggestions, or add your own."
            />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application form questions</h3>
          <p className="text-xs text-slate-400">Technical / screening questions shown on the public application form — applicants answer them when they apply.</p>
          <ApplicationQuestionsBuilder
            questions={f.application_questions}
            setQuestions={(next) => setF((p) => ({ ...p, application_questions: next }))}
          />
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Interview rounds</h3>
          <p className="text-xs text-slate-400">Pick the rounds this job runs. You can bulk-apply them to candidates from the pipeline later.</p>
          <InterviewTypesPicker
            selected={f.interview_types}
            setSelected={(next) => setF((p) => ({ ...p, interview_types: next }))}
          />
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50/60 p-4 text-sm text-slate-700">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <span>AI drafts the <strong>job description</strong> as soon as you create this job. You&apos;ll land on the <strong>Job post</strong> tab to review it — then <strong>Publish &amp; post</strong> (to free boards / LinkedIn / colleges) when it&apos;s ready. Nothing goes live until you approve.</span>
        </div>

        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>{busy ? <><Spinner /> Creating &amp; drafting JD…</> : 'Create Job & draft JD'}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  )
}

function RoleCard({ r }) {
  const [flagsOpen, setFlagsOpen] = useState(false)
  const flags = [...(r.ai_validation?.issues || []), ...(r.ai_validation?.inconsistencies || [])]
  const total = r.funnel?.total

  return (
    <Link to={`/roles/${r.id}`}>
      <Card className="p-5 transition duration-200 ease-snappy hover:border-brand-300 hover:shadow-md active:scale-[0.99]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[r.priority] || 'bg-slate-300'}`} title={`${r.priority} priority`} />
              <span className="text-lg font-semibold text-slate-900">{r.position}</span>
            </div>
            <div className="text-xs text-slate-400">#{r.id} · {r.department} · {r.location} · {r.work_mode}</div>
          </div>
          <Badge tone={{ urgent: 'rose', high: 'amber', medium: 'blue', low: 'gray' }[r.priority]}>{r.priority}</Badge>
        </div>
        {r.ai_summary && <p className="mt-3 line-clamp-2 text-sm text-slate-500">{r.ai_summary}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone={r.status === 'open' ? 'green' : 'gray'}>{r.status}</Badge>
          {total != null && <Badge tone="violet">{total} candidates</Badge>}
          <Badge tone={{ 'very hard': 'rose', hard: 'amber', moderate: 'blue', easy: 'green' }[r.difficulty_label] || 'gray'}>
            {r.difficulty_label || 'n/a'} · {r.difficulty_score}/100
          </Badge>
        </div>
        {flags.length > 0 && (
          <div className="mt-3">
            <button type="button" onClick={(e) => { e.preventDefault(); setFlagsOpen(!flagsOpen) }} className="flex items-center gap-1 rounded text-xs text-amber-600 transition-colors duration-150 ease-snappy hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97]">
              <AlertTriangle className="h-3.5 w-3.5" /> {flags.length} AI flag(s) to review
            </button>
            {flagsOpen && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-700">{flags.map((x, i) => <li key={i}>{x}</li>)}</ul>
            )}
          </div>
        )}
      </Card>
    </Link>
  )
}

export default function Roles() {
  usePageTitle('Jobs')
  const { toast } = useToast()
  const navigate = useNavigate()
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'cards')
  const [roles, setRoles] = useState([])
  const [tableRows, setTableRows] = useState([])
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cardSort, setCardSort] = useState('newest')
  const searchRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (view === 'list') {
        const rows = await api.listRolesTable(search)
        setTableRows(rows)
        setRoles(rows)
      } else {
        // Use the enriched (table) endpoint even for cards so each card has its funnel counts
        // (the "N candidates" badge). Cards filter client-side, so fetch the full set (no query).
        const rows = await api.listRolesTable()
        setRoles(rows)
      }
    } catch {
      setRoles([])
      setTableRows([])
    } finally {
      setLoading(false)
    }
  }, [view, search])

  useEffect(() => {
    const t = setTimeout(load, view === 'list' ? 280 : 0)
    return () => clearTimeout(t)
  }, [load, view])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function setViewMode(mode) {
    setView(mode)
    localStorage.setItem(VIEW_KEY, mode)
  }

  const cardFiltered = useMemo(() => {
    let list = [...roles]
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        [r.position, r.department, r.location, ...(r.mandatory_skills || [])].join(' ').toLowerCase().includes(q),
      )
    }
    if (cardSort === 'priority') {
      const order = { urgent: 0, high: 1, medium: 2, low: 3 }
      list.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9))
    } else if (cardSort === 'difficulty') {
      list.sort((a, b) => (b.difficulty_score || 0) - (a.difficulty_score || 0))
    }
    return list
  }, [roles, search, cardSort])

  const listFiltered = useMemo(() => {
    if (view !== 'list') return tableRows
    return tableRows
  }, [view, tableRows])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        subtitle="List or card view — click any job to open the candidate pipeline table."
        actions={!creating && (
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create Job</Button>
        )}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              className={`${inputClass} pl-9`}
              placeholder="Search jobs… (press /)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97]',
                view === 'cards' ? 'bg-brand-50 text-brand-800' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <LayoutGrid className="h-4 w-4" /> Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97]',
                view === 'list' ? 'bg-brand-50 text-brand-800' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <List className="h-4 w-4" /> List
            </button>
          </div>
          {view === 'cards' && (
            <select className={`${inputClass} w-40`} value={cardSort} onChange={(e) => setCardSort(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="priority">Priority</option>
              <option value="difficulty">Difficulty</option>
            </select>
          )}
        </div>
      </div>

      {creating && (
        <NewRoleForm
          onCancel={() => setCreating(false)}
          onCreated={(r, meta) => {
            setCreating(false)
            toast(meta?.jdReady ? 'Job created — review & approve the JD' : 'Job created — generate the JD to review it')
            // Land on the Job post tab so the HR reviews the drafted JD and publishes when ready.
            navigate(`/roles/${r.id}?view=jd`)
          }}
        />
      )}

      {loading ? (
        view === 'list' ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8"><Spinner /> Loading jobs…</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
        )
      ) : (view === 'list' ? listFiltered : cardFiltered).length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={search ? 'No matching jobs' : 'No jobs yet'}
          description={search ? 'Try a different search or filter.' : 'Create your first job to start hiring.'}
          action={!search && !creating && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create Job</Button>}
        />
      ) : view === 'list' ? (
        <JobsListTable rows={listFiltered} onStatusChange={load} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cardFiltered.map((r) => <RoleCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  )
}
