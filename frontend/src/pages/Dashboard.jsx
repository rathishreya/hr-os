import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Sparkles, UserPlus, Star, Mail, Briefcase, Users, TrendingUp, Percent, Plus, ArrowRight } from 'lucide-react'
import { api } from '../api'
import { Card, Badge, Button, Skeleton } from '../ui'
import FunnelChart from '../components/FunnelChart'
import BarList from '../components/BarList'
import { usePageTitle } from '../hooks/usePageTitle'

const STEPS = [
  { icon: FileText, title: 'Post a role', desc: 'Fill a short form — AI validates it, estimates difficulty and writes the full JD with LinkedIn/Naukri posts.' },
  { icon: UserPlus, title: 'Bring in candidates', desc: 'Paste a résumé or upload a PDF/DOCX in bulk — AI parses and de-dupes every profile into your talent pool.' },
  { icon: Star, title: 'AI screens & ranks', desc: 'Every applicant is scored against the role and interviewed, so the strongest fits rise to the top.' },
  { icon: Mail, title: 'You decide & act', desc: 'Review the shortlist, override the AI when you disagree, and email candidates or send offers in one click.' },
]

const DIFF_TONE = { 'very hard': 'rose', hard: 'amber', moderate: 'blue', easy: 'green' }

function Stat({ label, value, icon: Icon, from, to }) {
  return (
    <Card className="p-4 transition hover:shadow-md">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}>
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      </div>
      <div className="mt-2.5 text-3xl font-bold tabular-nums tracking-tight text-slate-900">{value}</div>
    </Card>
  )
}

export default function Dashboard() {
  usePageTitle('Home')
  const [data, setData] = useState(null)
  const [roles, setRoles] = useState([])
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)
  const [funnelRole, setFunnelRole] = useState('all') // 'all' = global funnel, else a role id
  const navigate = useNavigate()

  useEffect(() => {
    api.company().then(setCompany).catch(() => {})
    Promise.all([
      api.analytics().then(setData).catch(() => {}),
      api.listRoles().then(setRoles).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const hour = new Date().getHours()
  const greeting = `Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}`
  const companyName = company?.name || 'EZ Works'

  // Per-role funnel: 'all' shows the global funnel; otherwise pull the selected role's stage counts.
  const funnelByRole = data?.funnel_by_role || []
  const activeFunnel = funnelRole === 'all'
    ? data?.funnel
    : funnelByRole.find((r) => String(r.role_id) === String(funnelRole))?.funnel

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-fuchsia-600 p-8 text-white shadow-xl shadow-brand-600/25">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-28 h-60 w-60 rounded-full bg-fuchsia-300/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/20 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> {companyName} · AI Hiring OS
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-[2rem]">{greeting} 👋</h1>
          <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-brand-50/90">
            Post a role and AI writes the description, screens &amp; ranks candidates, runs interviews, and drafts emails —
            you stay in control of every decision.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button className="!bg-white !text-brand-700 shadow-lg shadow-brand-900/20 hover:!bg-brand-50" onClick={() => navigate('/roles?new=1')}>
              <Plus className="h-4 w-4" /> Post a job
            </Button>
            {roles.length > 0 && (
              <Button variant="ghost" className="!border-white/30 !bg-white/10 !text-white hover:!bg-white/20" onClick={() => navigate('/roles')}>
                View {roles.length} job{roles.length > 1 ? 's' : ''} <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* How it works — the core loop, surfaced right under the hero so new users see the flow first */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-800">How it works</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-xs font-bold text-white">{i + 1}</span>
                  <Icon className="h-4 w-4 text-brand-500" />
                </div>
                <div className="mt-2.5 text-sm font-semibold text-slate-800">{s.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-500">{s.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : data && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat label="Open Jobs" value={data.total_roles} icon={Briefcase} from="#7c3aed" to="#d946ef" />
          <Stat label="Candidates" value={data.total_candidates} icon={Users} from="#0ea5e9" to="#6366f1" />
          <Stat label="Applications" value={data.total_applications} icon={TrendingUp} from="#a855f7" to="#7c3aed" />
          <Stat label="Avg AI Score" value={data.avg_score} icon={Star} from="#f59e0b" to="#f97316" />
          <Stat label="Conversion" value={`${data.conversion_rate}%`} icon={Percent} from="#10b981" to="#14b8a6" />
        </div>
      )}

      {/* Charts */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Overview</h2>
          <Link to="/analytics" className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700">Full analytics <ArrowRight className="h-3 w-3" /></Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-800">Hiring funnel</h2>
              <select
                value={funnelRole}
                onChange={(e) => setFunnelRole(e.target.value)}
                aria-label="Filter funnel by role"
                className="max-w-[55%] truncate rounded-lg border border-slate-200 bg-white py-1 pl-2.5 pr-7 text-xs font-medium text-slate-600 outline-none transition-colors hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
              >
                <option value="all">All roles</option>
                {funnelByRole.map((r) => (
                  <option key={r.role_id} value={r.role_id}>{r.position}</option>
                ))}
              </select>
            </div>
            {loading ? <Skeleton className="h-32" /> : <FunnelChart funnel={activeFunnel} />}
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-800">Candidate sources</h2>
            {loading ? <Skeleton className="h-32" /> : <BarList data={data?.sources} colorFor={() => 'blue'} emptyText="No candidates yet." />}
          </Card>
        </div>
      </div>

      {/* Your jobs */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Your jobs</h2>
          <Link to="/roles" className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700">See all <ArrowRight className="h-3 w-3" /></Link>
        </div>
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        ) : roles.length === 0 ? (
          <Card className="p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Briefcase className="h-6 w-6" /></div>
            <p className="text-sm text-slate-500">No jobs yet — post your first role to get started.</p>
            <Button className="mt-4" onClick={() => navigate('/roles?new=1')}><Plus className="h-4 w-4" /> Post your first job</Button>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {roles.slice(0, 4).map((r) => (
              <Link key={r.id} to={`/roles/${r.id}`} className="group">
                <Card className="h-full p-4 transition duration-200 ease-snappy hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-600/5 active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900 group-hover:text-brand-700">{r.position}</div>
                      <div className="mt-0.5 truncate text-xs text-slate-400">{[r.department, r.location, r.work_mode].filter(Boolean).join(' · ')}</div>
                    </div>
                    <Badge tone={DIFF_TONE[r.difficulty_label] || 'gray'} className="shrink-0 capitalize">{r.difficulty_label || 'n/a'}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-slate-300" /> {r.difficulty_score || 0}/100 difficulty</span>
                    <span>~{r.est_time_to_hire_days || 0}d to hire</span>
                    <span>{r.num_openings} opening{r.num_openings > 1 ? 's' : ''}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
