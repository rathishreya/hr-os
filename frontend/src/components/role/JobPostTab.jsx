import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Check, Globe, ExternalLink, Megaphone } from 'lucide-react'
import { api } from '../../api'
import { Card, Button, Spinner } from '../../ui'
import { useToast } from '../Toast'
import { CopyBtn, DistributionDetails } from '../distribution/DistributionPanel'

function DistributeCard({ jd }) {
  const published = jd.status === 'published'
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!published) return
    let alive = true
    api.distributionChannels()
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setErr(e.message) })
    return () => { alive = false }
  }, [published, jd.id])

  if (!published) {
    return (
      <Card className="border-violet-200 bg-violet-50/50 p-4">
        <div className="flex items-start gap-2 text-sm text-slate-700">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
          <span><strong>Publish</strong> to put this on your public careers page and distribute it to <strong>free</strong> job boards — Google for Jobs, Indeed, Adzuna, Jooble &amp; more.</span>
        </div>
      </Card>
    )
  }

  const pageUrl = `${data?.base_url || window.location.origin}/careers/${jd.id}`

  return (
    <Card className="border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Globe className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-slate-800">Distribute for free</h3>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{data ? `${data.channels.length} free channels` : 'Loading…'}</span>
        <Link to="/distribution" className="ml-auto text-xs font-medium text-violet-600 hover:underline">All roles &amp; feeds →</Link>
      </div>
      <p className="mt-1 text-xs text-slate-500">This role is live with schema.org JobPosting data. Below are the standard feeds every free aggregator ingests — register them once and roles sync automatically.</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-violet-300 hover:text-violet-700">
          <ExternalLink className="h-3.5 w-3.5" /> View this role
        </a>
        <CopyBtn value={pageUrl} label="Copy role link" />
        <a href={`${data?.base_url || window.location.origin}/careers/${jd.id}.json`} target="_blank" rel="noreferrer" className="text-xs text-violet-600 hover:underline">Structured data</a>
      </div>

      {err && <p className="mt-3 text-xs text-rose-600">Couldn&apos;t load distribution info: {err}</p>}

      <DistributionDetails data={data} />
    </Card>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </div>
  )
}

function CopyBlock({ title, text }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(text || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
        <button type="button" onClick={copy} className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-slate-600">{text}</p>
    </Card>
  )
}

export default function JobPostTab({ roleId, jd, onGenerated }) {
  const { toast } = useToast()
  const [genBusy, setGenBusy] = useState(false)
  const [pubBusy, setPubBusy] = useState(false)

  async function generate() {
    setGenBusy(true)
    try {
      const next = await api.generateJD(roleId)
      onGenerated(next)
      toast('Job description generated')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setGenBusy(false)
    }
  }

  async function publish() {
    if (!jd?.id) return
    setPubBusy(true)
    try {
      const updated = await api.publishJob(jd.id)
      onGenerated(updated)
      toast('Job published')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setPubBusy(false)
    }
  }

  if (!jd) {
    return (
      <Card className="p-8 text-center">
        <p className="mb-4 text-sm text-slate-500">No job description yet. Generate one with AI from this role&apos;s details.</p>
        <Button onClick={generate} disabled={genBusy}>{genBusy ? <><Spinner /> Generating…</> : 'Generate JD with AI'}</Button>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={generate} disabled={genBusy}>{genBusy ? <Spinner /> : 'Regenerate'}</Button>
        {jd.status !== 'published' && (
          <Button onClick={publish} disabled={pubBusy}>{pubBusy ? <Spinner /> : 'Publish job'}</Button>
        )}
        {jd.status === 'published' && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Published</span>}
      </div>
      <DistributeCard jd={jd} />
      <Card className="space-y-5 p-6">
        <div>
          <div className="text-xl font-bold text-slate-900">{jd.title}</div>
          <div className="text-xs text-slate-400">{jd.seo_title}</div>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{jd.description}</p>
        {jd.responsibilities?.length > 0 && (
          <Section title="Responsibilities">
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{jd.responsibilities.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </Section>
        )}
        {jd.requirements?.length > 0 && (
          <Section title="Requirements">
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{jd.requirements.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </Section>
        )}
        {jd.benefits?.length > 0 && (
          <Section title="Benefits">
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{jd.benefits.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </Section>
        )}
        {jd.company_description && (
          <Section title="About the company">
            <p className="text-sm text-slate-700">{jd.company_description}</p>
          </Section>
        )}
        {jd.culture && (
          <Section title="Culture">
            <p className="text-sm text-slate-700">{jd.culture}</p>
          </Section>
        )}
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <CopyBlock title="LinkedIn" text={jd.linkedin_copy} />
        <CopyBlock title="Naukri / Indeed" text={jd.naukri_copy} />
        <CopyBlock title="Social hook" text={jd.social_copy} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {jd.screening_questions?.length > 0 && (
          <Card className="p-4">
            <Section title="Screening questions">
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{jd.screening_questions.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </Section>
          </Card>
        )}
        {jd.knockout_questions?.length > 0 && (
          <Card className="p-4">
            <Section title="Knockout questions">
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{jd.knockout_questions.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </Section>
          </Card>
        )}
      </div>
      {jd.interview_rubric?.length > 0 && (
        <Card className="p-4">
          <Section title="Interview scorecard">
            <ul className="space-y-2">
              {jd.interview_rubric.map((item, i) => (
                <li key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {typeof item === 'string' ? item : item.criterion || item.question || JSON.stringify(item)}
                </li>
              ))}
            </ul>
          </Section>
        </Card>
      )}
    </div>
  )
}
