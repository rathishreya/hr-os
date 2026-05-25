import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Megaphone, Globe, ExternalLink, CheckCircle2, AlertTriangle, Briefcase } from 'lucide-react'
import { api } from '../api'
import { Card, Button, Spinner, EmptyState, PageHeader } from '../ui'
import { CopyBtn, DistributionDetails } from '../components/distribution/DistributionPanel'
import { usePageTitle } from '../hooks/usePageTitle'

function RoleRow({ role }) {
  const meta = [role.location, role.work_mode, role.department].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-800">{role.title}</div>
        {meta && <div className="mt-0.5 truncate text-xs text-slate-400">{meta}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <CopyBtn value={role.url} label="Copy link" />
        <a href={role.json_url} target="_blank" rel="noreferrer" className="text-xs text-violet-600 hover:underline">Data</a>
        <a href={role.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-violet-300 hover:text-violet-700">
          <ExternalLink className="h-3.5 w-3.5" /> View
        </a>
      </div>
    </div>
  )
}

export default function Distribution() {
  usePageTitle('Distribution')
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    api.distributionChannels()
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setErr(e.message) })
    return () => { alive = false }
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Distribution"
        subtitle="Publish your open roles to every genuinely free job board — Google for Jobs, Indeed, Adzuna, Jooble and more."
        actions={data && (
          <a href={data.feeds.careers} target="_blank" rel="noreferrer">
            <Button variant="ghost"><Globe className="mr-1 h-4 w-4" /> View careers page</Button>
          </a>
        )}
      />

      {err && <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Couldn&apos;t load distribution info: {err}</Card>}

      {!data && !err && (
        <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Loading distribution channels…</div>
      )}

      {data && data.published_count === 0 && (
        <EmptyState
          icon={Megaphone}
          title="No published roles yet"
          description="Publish a job to put it on your careers page and feed it to free job boards. Generate a JD on a role, then hit Publish."
          action={<Link to="/roles"><Button>Go to Jobs</Button></Link>}
        />
      )}

      {data && data.published_count > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400"><Briefcase className="h-4 w-4 text-violet-500" /> Published roles</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{data.published_count}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400"><Globe className="h-4 w-4 text-violet-500" /> Free channels</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{data.channels.length}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">Reachability</div>
              {data.is_public
                ? <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Public — crawlable</div>
                : <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-amber-600"><AlertTriangle className="h-4 w-4" /> Localhost only</div>}
            </Card>
          </div>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-800">Company feeds &amp; free channels</h3>
            <p className="mt-1 text-xs text-slate-500">One feed covers <strong>all</strong> published roles. Register these URLs once with each aggregator below — new roles you publish appear automatically on their next crawl.</p>
            <DistributionDetails data={data} />
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Published roles in the feed ({data.roles.length})</h3>
              <CopyBtn value={data.feeds.xml} label="Copy XML feed" />
            </div>
            {data.roles.map((r) => <RoleRow key={r.id} role={r} />)}
          </Card>
        </>
      )}
    </div>
  )
}
