import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Sparkles, UserPlus, Star, Mail, Briefcase, Users, TrendingUp, Percent } from 'lucide-react'
import { api } from '../api'
import { Card, Badge, Button, Skeleton } from '../ui'
import FunnelChart from '../components/FunnelChart'
import { formatAuditSummary, formatRelativeTime } from '../components/AuditDetail'
import { usePageTitle } from '../hooks/usePageTitle'

const STEPS = [
  { icon: FileText, title: 'Post a job', desc: 'Fill a short form. AI checks it and estimates difficulty.' },
  { icon: Sparkles, title: 'AI writes the description', desc: 'One click for a full JD + LinkedIn/Naukri posts.' },
  { icon: UserPlus, title: 'Add candidates', desc: 'Paste a resume or upload a PDF/DOCX — AI parses it.' },
  { icon: Star, title: 'AI screens & ranks', desc: 'Scores every candidate and runs a chat interview.' },
  { icon: Mail, title: 'Decide & email', desc: 'You pick. Send the candidate an email in one click.' },
]

function Stat({ label, value, icon: Icon }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-violet-500" />}
        <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
    </Card>
  )
}

export default function Dashboard() {
  usePageTitle('Home')
  const [data, setData] = useState(null)
  const [roles, setRoles] = useState([])
  const [audit, setAudit] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      api.analytics().then(setData).catch(() => {}),
      api.listRoles().then(setRoles).catch(() => {}),
      api.audit(5).then(setAudit).catch(() => []),
    ]).finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-8">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 p-7 text-white">
          <h1 className="text-2xl font-bold tracking-tight">Welcome to HR-OS</h1>
          <p className="mt-1 max-w-xl text-sm text-violet-50">
            Your AI hiring assistant. Post a job and AI writes the description, screens candidates,
            ranks them, and drafts emails. You stay in control of every decision.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button className="bg-white text-violet-700 hover:bg-violet-50" onClick={() => navigate('/roles')}>
              Post a job
            </Button>
            {roles.length > 0 && (
              <Button variant="ghost" className="border-white/40 bg-white/10 text-white hover:bg-white/20" onClick={() => navigate('/roles')}>
                View {roles.length} job{roles.length > 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">How it works</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{i + 1}</span>
                  <Icon className="h-4 w-4 text-violet-600" />
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-800">{s.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-500">{s.desc}</div>
              </Card>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : data && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat label="Open Jobs" value={data.total_roles} icon={Briefcase} />
          <Stat label="Candidates" value={data.total_candidates} icon={Users} />
          <Stat label="Applications" value={data.total_applications} icon={TrendingUp} />
          <Stat label="Avg AI Score" value={data.avg_score} icon={Star} />
          <Stat label="Conversion" value={`${data.conversion_rate}%`} icon={Percent} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Hiring funnel</h2>
          {loading ? <Skeleton className="h-32" /> : <FunnelChart funnel={data?.funnel} />}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent activity</h2>
            <Link to="/audit" className="text-xs font-medium text-violet-600 hover:text-violet-700">View all</Link>
          </div>
          {audit.length === 0 ? (
            <p className="text-sm text-slate-400">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {audit.map((r) => (
                <li key={r.id} className="flex gap-3 text-sm">
                  <span className="shrink-0 text-xs text-slate-400" title={new Date(r.created_at).toLocaleString()}>
                    {formatRelativeTime(r.created_at)}
                  </span>
                  <span className="text-slate-600">{formatAuditSummary(r)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your jobs</h2>
          <Link to="/roles" className="text-xs font-medium text-violet-600 hover:text-violet-700">See all</Link>
        </div>
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-28" /><Skeleton className="h-28" />
          </div>
        ) : roles.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-slate-500">No jobs yet.</p>
            <Button className="mt-4" onClick={() => navigate('/roles')}>Post your first job</Button>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {roles.slice(0, 4).map((r) => (
              <Link key={r.id} to={`/roles/${r.id}`}>
                <Card className="p-4 transition hover:border-violet-300 hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{r.position}</div>
                      <div className="text-xs text-slate-400">{r.department} · {r.location} · {r.work_mode}</div>
                    </div>
                    <Badge tone={{ 'very hard': 'rose', hard: 'amber', moderate: 'blue', easy: 'green' }[r.difficulty_label] || 'gray'}>
                      {r.difficulty_label || 'n/a'}
                    </Badge>
                  </div>
                  <div className="mt-3 flex gap-4 text-xs text-slate-500">
                    <span>~{r.est_time_to_hire_days}d to hire</span>
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
