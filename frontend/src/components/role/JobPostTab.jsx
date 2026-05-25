import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Check, Globe, ExternalLink, Megaphone, GraduationCap, Video, Trash2, Plus } from 'lucide-react'
import { api } from '../../api'
import { Card, Button, Spinner, Modal, inputClass } from '../../ui'
import { useToast } from '../Toast'
import { CopyBtn, DistributionDetails } from '../distribution/DistributionPanel'
import { POST_PLATFORMS } from '../../constants'

function CheckRow({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition ${on ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300'}`}>{on && <Check className="h-3 w-3" />}</span>
      {children}
    </button>
  )
}

// "Do you want to post it, and where?" — shown when publishing a job.
function PostJobModal({ open, onClose, jd, roleId, onPublished }) {
  const { toast } = useToast()
  const [platforms, setPlatforms] = useState([])
  const [tpos, setTpos] = useState([])
  const [tpoIds, setTpoIds] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPlatforms(POST_PLATFORMS.map((p) => p.id))
    setTpoIds([]); setMessage('')
    api.listTpos().then(setTpos).catch(() => setTpos([]))
  }, [open])

  const togglePlatform = (id) => setPlatforms((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const toggleTpo = (id) => setTpoIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  async function confirm() {
    setBusy(true)
    try {
      const updated = await api.publishJob(jd.id, platforms)
      let extra = ''
      if (tpoIds.length) {
        const r = await api.sendToTpos(roleId, { tpo_ids: tpoIds, message })
        extra = ` · sent to ${r.delivered} of ${r.total} college${r.total !== 1 ? 's' : ''}`
      }
      toast(`Job published${extra}`)
      onPublished(updated)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Post this job"
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={confirm} disabled={busy}>{busy ? <Spinner /> : 'Publish & post'}</Button></>}>
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Post to free job boards</p>
          <p className="mb-2 mt-0.5 text-xs text-slate-400">Publishing makes it live on your careers page + feeds. Pick which free boards to target — they&apos;re highlighted on the Distribution page to register.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {POST_PLATFORMS.map((p) => (
              <CheckRow key={p.id} on={platforms.includes(p.id)} onClick={() => togglePlatform(p.id)}>{p.label}</CheckRow>
            ))}
          </div>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><GraduationCap className="h-3.5 w-3.5" /> Send to college placement officers</p>
          {tpos.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">No TPOs yet — add them in <Link to="/settings" className="text-violet-600 hover:underline">Settings → Placement officers</Link>.</p>
          ) : (
            <>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
                {tpos.map((t) => (
                  <CheckRow key={t.id} on={tpoIds.includes(t.id)} onClick={() => toggleTpo(t.id)}>
                    <span className="min-w-0 truncate"><span className="font-medium">{t.college || t.name}</span>{t.college && t.name ? <span className="text-xs text-slate-400"> · {t.name}</span> : null}</span>
                  </CheckRow>
                ))}
              </div>
              {tpoIds.length > 0 && (
                <textarea className={`${inputClass} mt-2 h-16 resize-y`} placeholder="Optional note to include in the outreach email…" value={message} onChange={(e) => setMessage(e.target.value)} />
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

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

function VideoQuestionsCard({ jd }) {
  const { toast } = useToast()
  const [qs, setQs] = useState(() => (jd.video_questions?.length ? jd.video_questions : ['', '', '']))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const update = (i, v) => setQs(qs.map((q, j) => (j === i ? v : q)))

  async function save() {
    setBusy(true)
    try {
      const clean = qs.map((q) => q.trim()).filter(Boolean)
      await api.setVideoQuestions(jd.id, clean)
      setQs(clean.length ? clean : [''])
      toast('Video interview questions saved')
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2"><Video className="h-4 w-4 text-violet-600" /><h3 className="text-sm font-semibold text-slate-800">Video interview questions</h3></div>
      <p className="mb-3 text-xs text-slate-500">Pre-defined questions every candidate answers on camera (async, transcribed on-device — free). Share the per-candidate link from a candidate&apos;s <strong>Interview</strong> tab.</p>
      <div className="space-y-2">
        {qs.map((q, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-4 text-xs tabular-nums text-slate-400">{i + 1}</span>
            <input className={inputClass} value={q} onChange={(e) => update(i, e.target.value)} placeholder="e.g. Tell us about a project you're proud of" />
            <button type="button" onClick={() => setQs(qs.filter((_, j) => j !== i))} className="shrink-0 text-slate-300 hover:text-rose-500" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="ghost" className="text-xs" onClick={() => setQs([...qs, ''])}><Plus className="h-3.5 w-3.5" /> Add question</Button>
        <Button className="text-xs" onClick={save} disabled={busy}>{busy ? <Spinner /> : saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : 'Save questions'}</Button>
      </div>
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
  const [postOpen, setPostOpen] = useState(false)
  const [company, setCompany] = useState(null)
  useEffect(() => { api.company().then(setCompany).catch(() => {}) }, [])

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
        {jd.status !== 'published' ? (
          <Button onClick={() => setPostOpen(true)}><Megaphone className="h-4 w-4" /> Publish &amp; post</Button>
        ) : (
          <>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Published</span>
            <Button variant="ghost" onClick={() => setPostOpen(true)}><Megaphone className="h-4 w-4" /> Post options</Button>
          </>
        )}
      </div>
      <PostJobModal open={postOpen} roleId={roleId} jd={jd} onClose={() => setPostOpen(false)} onPublished={(u) => { onGenerated(u); setPostOpen(false) }} />
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
        {(company?.about || jd.company_description) && (
          <Section title={`About ${company?.name || 'the company'}`}>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{company?.about || jd.company_description}</p>
            {company?.website && (
              <a href={company.website} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs font-medium text-violet-600 hover:underline">{company.website.replace(/^https?:\/\//, '')}</a>
            )}
          </Section>
        )}
        {jd.culture && (
          <Section title="Culture">
            <p className="text-sm text-slate-700">{jd.culture}</p>
          </Section>
        )}
      </Card>
      <VideoQuestionsCard jd={jd} />
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
    </div>
  )
}
