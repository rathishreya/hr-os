import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, Users, TrendingUp, Star, Percent, BarChart3, CheckCircle2 } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, FunnelChart, Funnel, LabelList,
} from 'recharts'
import { api } from '../api'
import { Card, Skeleton, PageHeader, Button } from '../ui'
import { usePageTitle } from '../hooks/usePageTitle'

// ── brand palette ───────────────────────────────────────────────────────────
const PIE_COLORS = ['#7c3aed', '#d946ef', '#a855f7', '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e']
const STAGE_ORDER = ['applied', 'shortlisted', 'interview', 'offer', 'hired', 'rejected']
const STAGE_LABEL = { applied: 'Applied', screening: 'Screening', shortlisted: 'Shortlisted', interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Rejected' }
const STAGE_COLOR = { applied: '#c4b5fd', screening: '#a78bfa', shortlisted: '#8b5cf6', interview: '#7c3aed', offer: '#6d28d9', hired: '#10b981', rejected: '#f43f5e' }
const DIFF_COLOR = { 'very hard': '#f43f5e', hard: '#f59e0b', moderate: '#0ea5e9', easy: '#10b981', unrated: '#94a3b8' }
const recColor = (r) => {
  const k = (r || '').toLowerCase()
  if (k.includes('strong')) return '#059669'
  if (k.includes('yes') || k.includes('advance') || k.includes('hire')) return '#10b981'
  if (k.includes('reject') || k.startsWith('no')) return '#f43f5e'
  if (k.includes('hold') || k.includes('maybe')) return '#f59e0b'
  return '#7c3aed'
}

const toArr = (obj) => Object.entries(obj || {}).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0)

function CardTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      {label != null && <div className="mb-1 font-semibold capitalize text-slate-700">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          <span className="capitalize">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-slate-800">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function Kpi({ label, value, icon: Icon, from, to }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}>
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <div className="mt-2.5 text-3xl font-bold tabular-nums tracking-tight text-slate-900">{value}</div>
    </div>
  )
}

function Panel({ title, hint, children, className = '' }) {
  return (
    <Card className={`p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
      {children}
    </Card>
  )
}

function Empty({ text }) {
  return <div className="flex h-[200px] items-center justify-center text-sm text-slate-400">{text}</div>
}

// Donut with a centered total and a custom legend.
function Donut({ data, colors, emptyText }) {
  if (!data.length) return <Empty text={emptyText} />
  const total = data.reduce((s, d) => s + d.value, 0)
  const colorAt = (i, name) => (typeof colors === 'function' ? colors(name) : colors[i % colors.length])
  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={210}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none">
              {data.map((d, i) => <Cell key={i} fill={colorAt(i, d.name)} />)}
            </Pie>
            <Tooltip content={<CardTip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums text-slate-900">{total}</span>
          <span className="text-[11px] uppercase tracking-wide text-slate-400">total</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorAt(i, d.name) }} />
            <span className="capitalize text-slate-600">{d.name}</span>
            <span className="font-semibold tabular-nums text-slate-400">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Analytics() {
  usePageTitle('Analytics')
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => { api.analytics().then(setData).catch((e) => setErr(e.message)) }, [])

  const empty = data && data.total_roles === 0 && data.total_candidates === 0

  const funnelData = data ? STAGE_ORDER.filter((s) => (data.funnel?.[s] || 0) > 0)
    .map((s) => ({ name: STAGE_LABEL[s], value: data.funnel[s], fill: STAGE_COLOR[s] })) : []
  const scoreData = data ? Object.entries(data.score_distribution || {}).map(([name, value]) => ({ name, value })) : []
  const hasScores = scoreData.some((d) => d.value > 0)
  const sources = data ? toArr(data.sources) : []
  const recs = data ? toArr(data.recommendations) : []
  const difficulty = data ? toArr(data.roles_by_difficulty) : []
  const topRoles = data?.top_roles || []

  // Pipeline conversion by stage: how many applications reached at least each stage. Shown both as
  // a bar (volume) and as a pass-through % vs the prior stage in the tooltip-friendly label.
  const REACH_ORDER = ['applied', 'shortlisted', 'interview', 'offer', 'hired']
  const REACH_LABEL = { applied: 'Applied', screening: 'Screened', shortlisted: 'Shortlisted', interview: 'Interview', offer: 'Offer', hired: 'Hired' }
  const reachData = data ? REACH_ORDER
    .map((s, i, arr) => {
      const value = data.stage_reached?.[s] || 0
      const prev = i === 0 ? value : (data.stage_reached?.[arr[i - 1]] || 0)
      const pct = prev > 0 ? Math.round((value / prev) * 100) : 0
      return { name: REACH_LABEL[s], value, pct }
    })
    .filter((d, i) => i === 0 || d.value > 0 || (data.stage_reached?.[REACH_ORDER[0]] || 0) > 0) : []
  const hasReach = reachData.some((d) => d.value > 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" subtitle="Hiring performance across every role, candidate and AI decision." />

      {err && <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Couldn&apos;t load analytics: {err}</Card>}

      {!data && !err && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
          <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
        </>
      )}

      {empty && (
        <Card className="p-12 text-center">
          <BarChart3 className="mx-auto mb-3 h-9 w-9 text-slate-300" />
          <p className="text-sm text-slate-500">No data yet. Post a job and add candidates — analytics populate automatically.</p>
          <Link to="/roles"><Button className="mt-4">Post a job</Button></Link>
        </Card>
      )}

      {data && !empty && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Open Roles" value={data.open_roles ?? data.published_roles ?? 0} icon={Briefcase} from="#7c3aed" to="#d946ef" />
            <Kpi label="Active Candidates" value={data.active_candidates ?? data.total_candidates} icon={Users} from="#0ea5e9" to="#6366f1" />
            <Kpi label="Applications" value={data.total_applications} icon={TrendingUp} from="#a855f7" to="#7c3aed" />
            <Kpi label="Avg AI Score" value={data.avg_score} icon={Star} from="#f59e0b" to="#f97316" />
            <Kpi label="Offer Accept" value={`${data.offer_accept_rate ?? 0}%`} icon={CheckCircle2} from="#10b981" to="#14b8a6" />
            <Kpi label="Hire Rate" value={`${data.conversion_rate}%`} icon={Percent} from="#6366f1" to="#8b5cf6" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Hiring funnel" hint="Applications by current pipeline stage">
              {funnelData.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <FunnelChart>
                    <Tooltip content={<CardTip />} />
                    <Funnel dataKey="value" data={funnelData} isAnimationActive>
                      <LabelList position="right" dataKey="name" stroke="none" fill="#475569" fontSize={12} />
                      <LabelList position="center" dataKey="value" stroke="none" fill="#fff" fontSize={13} fontWeight={700} />
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              ) : <Empty text="No applications in the pipeline yet." />}
            </Panel>

            <Panel title="Pipeline conversion by stage" hint={`Applications reaching each stage · Interview→Offer ${data.interview_to_offer_rate ?? 0}% · Offer→Hire ${data.offer_accept_rate ?? 0}%`}>
              {hasReach ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={reachData} margin={{ top: 18, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="barTeal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip cursor={{ fill: 'rgba(16,185,129,.06)' }} content={<CardTip />} />
                    <Bar dataKey="value" name="Reached" fill="url(#barTeal)" radius={[6, 6, 0, 0]} maxBarSize={48}>
                      <LabelList dataKey="pct" position="top" formatter={(v) => `${v}%`} fontSize={11} fill="#475569" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty text="No applications in the pipeline yet." />}
            </Panel>

            <Panel title="AI score distribution" hint="How candidates score against role fit">
              {hasScores ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={scoreData} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="barViolet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#7c3aed" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip cursor={{ fill: 'rgba(124,58,237,.06)' }} content={<CardTip />} />
                    <Bar dataKey="value" name="Candidates" fill="url(#barViolet)" radius={[6, 6, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty text="No scored candidates yet." />}
            </Panel>

            <Panel title="Candidate sources" hint="Where your applicants come from">
              <Donut data={sources} colors={PIE_COLORS} emptyText="No candidates yet." />
            </Panel>

            <Panel title="AI recommendations" hint="Suggested actions across applications — always human-overridable">
              <Donut data={recs} colors={(name) => recColor(name)} emptyText="No AI recommendations yet." />
            </Panel>

            <Panel title="Roles by difficulty" hint="AI-estimated hiring difficulty">
              {difficulty.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={difficulty} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={84} tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(124,58,237,.06)' }} content={<CardTip />} />
                    <Bar dataKey="value" name="Roles" radius={[0, 6, 6, 0]} maxBarSize={34}>
                      {difficulty.map((d, i) => <Cell key={i} fill={DIFF_COLOR[d.name] || '#94a3b8'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty text="No roles yet." />}
            </Panel>

            <Panel title="Top roles by applicants" hint={`Average time-to-hire estimate: ${data.avg_time_to_hire || 0} days`}>
              {topRoles.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={topRoles} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="barFuchsia" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="100%" stopColor="#d946ef" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="position" width={130} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(124,58,237,.06)' }} content={<CardTip />} />
                    <Bar dataKey="applicants" name="Applicants" fill="url(#barFuchsia)" radius={[0, 6, 6, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty text="No applications yet." />}
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
