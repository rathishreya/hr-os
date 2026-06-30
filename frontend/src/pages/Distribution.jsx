import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Megaphone, Globe, ExternalLink, CheckCircle2, AlertTriangle, Briefcase, Plug, Check, Loader, Zap, Settings2, ChevronDown, GraduationCap, Send } from 'lucide-react'
import { api } from '../api'
import { Card, Button, Spinner, EmptyState, PageHeader, Badge, Modal, inputClass } from '../ui'
import { CopyBtn, DistributionDetails, LinkedinIcon } from '../components/distribution/DistributionPanel'
import { useToast } from '../components/Toast'
import { usePageTitle } from '../hooks/usePageTitle'

function StatusChip({ state }) {
  if (!state) return null
  if (state.ok) return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600"><Check className="h-3 w-3" /> done</span>
  if (state.error) return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-500" title={state.error}><AlertTriangle className="h-3 w-3" /> failed</span>
  return null
}

// Popup: pick saved colleges & vendors and email this role to all of them at once.
// Reuses the campus-outreach endpoint (send-to-tpos), which needs the role's hiring_request_id.
function SendToPartnersModal({ role, open, onClose }) {
  const { toast } = useToast()
  const [partners, setPartners] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    setMessage('')
    setPartners(null)
    api.listTpos().then(setPartners).catch(() => setPartners([]))
  }, [open])

  const list = partners || []
  const allIds = list.map((p) => p.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))
  const toggle = (id) => setSelected((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allIds))

  async function send() {
    if (!selected.size) { toast('Select at least one college or vendor', 'error'); return }
    if (!role?.hiring_request_id) { toast('This role is missing its reference — re-publish and try again', 'error'); return }
    setBusy(true)
    try {
      const r = await api.sendToTpos(role.hiring_request_id, { tpo_ids: [...selected], message })
      toast(`Sent to ${r.delivered} of ${r.total} partner${r.total === 1 ? '' : 's'}`)
      onClose()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Email to colleges & vendors${role ? ` — ${role.title}` : ''}`}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={send} disabled={busy || !selected.size}>
            {busy ? <Spinner /> : <><Send className="h-4 w-4" /> Send to {selected.size || 0} selected</>}
          </Button>
        </>
      )}
    >
      {partners === null ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><Spinner /> Loading partners…</div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No colleges or vendors saved yet. Add them in{' '}
          <Link to="/settings" className="font-medium text-brand-600 hover:underline">Settings → Placement cells &amp; hiring vendors</Link>.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Pick who to email this role to — each gets a personalised message with the apply link.</p>
            <button type="button" onClick={toggleAll} className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {list.map((t) => {
              const on = selected.has(t.id)
              const vendor = t.kind === 'vendor'
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition ${on ? 'border-brand-300 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'}`}>{on && <Check className="h-3 w-3" />}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-slate-800">{t.college || t.name || 'Partner'}</span>
                    {t.college && t.name && <span className="text-xs text-slate-400"> · {t.name}</span>}
                    {!t.email && <span className="ml-1 text-xs text-rose-500">(no email)</span>}
                  </span>
                  <Badge tone={vendor ? 'amber' : 'violet'}>{vendor ? 'Vendor' : 'College'}</Badge>
                </button>
              )
            })}
          </div>
          <textarea
            className={`${inputClass} h-20 resize-y`}
            placeholder="Optional note to include in the outreach email…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      )}
    </Modal>
  )
}

function RoleRow({ role, integrations, busyKey, onGoogle, onLinkedin, onPartners }) {
  const meta = [role.location, role.work_mode, role.department].filter(Boolean).join(' · ')
  const g = role.distribution?.google
  const li = role.distribution?.linkedin
  const gBusy = busyKey === `g${role.id}`
  const liBusy = busyKey === `l${role.id}`
  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-800">{role.title}</div>
        {meta && <div className="mt-0.5 truncate text-xs text-slate-400">{meta}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {/* Google for Jobs — Indexing API push */}
        {integrations?.google?.configured && (
          <button
            type="button"
            onClick={() => onGoogle(role.id)}
            disabled={gBusy}
            title="Notify Google to index this role now"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors duration-150 ease-snappy hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97] disabled:opacity-50"
          >
            {gBusy ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />} {g?.ok ? 'Re-index' : 'Index on Google'}
          </button>
        )}
        <StatusChip state={g} />

        {/* LinkedIn — auto-post if connected, else the manual share link */}
        {integrations?.linkedin?.configured ? (
          <button
            type="button"
            onClick={() => onLinkedin(role.id)}
            disabled={liBusy}
            title="Post this role to your LinkedIn company page"
            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 transition-colors duration-150 ease-snappy hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97] disabled:opacity-50"
          >
            {liBusy ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <LinkedinIcon className="h-3.5 w-3.5" />} {li?.urn ? 'Re-post' : 'Post to LinkedIn'}
          </button>
        ) : (
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${role.url}?src=linkedin`)}`}
            target="_blank"
            rel="noreferrer"
            title="Share on LinkedIn — applicants flow back into this role's pipeline, tagged linkedin"
            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 transition-colors duration-150 ease-snappy hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97]"
          >
            <LinkedinIcon className="h-3.5 w-3.5" /> LinkedIn
          </a>
        )}
        <StatusChip state={li} />

        {/* Email this role to saved colleges & vendors (multi-select popup). */}
        <button
          type="button"
          onClick={() => onPartners(role)}
          title="Email this role to your saved colleges & recruitment vendors"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors duration-150 ease-snappy hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97]"
        >
          <GraduationCap className="h-3.5 w-3.5" /> Colleges &amp; vendors
        </button>

        <CopyBtn value={role.url} label="Copy link" />
        <a href={role.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 transition-colors duration-150 ease-snappy hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97]">
          <ExternalLink className="h-3.5 w-3.5" /> View
        </a>
      </div>
    </div>
  )
}

function IntegrationRow({ name, what, configured, hint, showSetup }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${configured ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
        {configured ? <CheckCircle2 className="h-4 w-4" /> : <Plug className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{name}</span>
          <Badge tone={configured ? 'green' : 'gray'}>{configured ? 'Connected' : 'Not connected'}</Badge>
        </div>
        {what && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{what}</p>}
        {/* The exact env-var names are setup-team detail — only show them when the
            recruiter opens "Setup details", and only if the channel isn't connected. */}
        {!configured && showSetup && hint && (
          <p className="mt-1.5 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] leading-relaxed text-slate-500">{hint}</p>
        )}
      </div>
    </div>
  )
}

export default function Distribution() {
  usePageTitle('Distribution')
  const { toast } = useToast()
  const [data, setData] = useState(null)
  const [integrations, setIntegrations] = useState(null)
  const [err, setErr] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [partnersRole, setPartnersRole] = useState(null)  // role whose colleges/vendors popup is open

  const loadChannels = () => api.distributionChannels().then(setData).catch((e) => setErr(e.message))

  useEffect(() => {
    let alive = true
    api.distributionChannels().then((d) => { if (alive) setData(d) }).catch((e) => { if (alive) setErr(e.message) })
    api.distributionIntegrations().then((d) => { if (alive) setIntegrations(d) }).catch(() => {})
    return () => { alive = false }
  }, [])

  async function pushGoogle(jobId) {
    setBusyKey(`g${jobId}`)
    try {
      const r = await api.googleIndexJob(jobId)
      toast(r.ok ? 'Sent to Google for indexing' : `Google: ${r.error || 'failed'}`, r.ok ? 'success' : 'error')
      await loadChannels()
    } catch (e) { toast(e.message, 'error') } finally { setBusyKey('') }
  }

  async function pushLinkedin(jobId) {
    setBusyKey(`l${jobId}`)
    try {
      const r = await api.linkedinShareJob(jobId)
      toast(r.ok ? 'Posted to LinkedIn' : `LinkedIn: ${r.error || 'failed'}`, r.ok ? 'success' : 'error')
      await loadChannels()
    } catch (e) { toast(e.message, 'error') } finally { setBusyKey('') }
  }

  const anyAuto = integrations && (integrations.google.configured || integrations.linkedin.configured)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Distribution"
        subtitle="Get your published roles seen — for free. Channels are grouped by how much effort each needs: nothing, one click, or a one-time setup."
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
          {/* Short intro: one feed, three tiers of reach. The three labelled sections below
              (a Automatic & free, b One-click direct post, c Manual / partner) carry the detail. */}
          <Card className="p-4">
            <p className="text-sm leading-relaxed text-slate-600">
              Every published role lives on your <strong className="text-slate-800">careers page</strong> and in one job feed.
              The three sections below are ordered by effort — <strong className="text-emerald-700">(a)</strong> happens on its own,
              <strong className="text-brand-700"> (b)</strong> is one click once connected, and
              <strong className="text-slate-700"> (c)</strong> is a one-time setup.
            </p>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400"><Briefcase className="h-4 w-4 text-brand-500" /> Published roles</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{data.published_count}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400"><Globe className="h-4 w-4 text-brand-500" /> Free boards reached</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{data.channels.length}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">Visible to job boards</div>
              {data.is_public
                ? <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Yes — live</div>
                : <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-amber-600"><AlertTriangle className="h-4 w-4" /> Not yet (local)</div>}
            </Card>
          </div>

          {/* ───────────── (a) Automatic & free — sitemap / feed / Google index ───────────── */}
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">a</span>
              <h3 className="text-sm font-semibold text-slate-800">Automatic &amp; free</h3>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              <strong className="text-slate-700">What it does:</strong> your sitemap, RSS/XML feed and Google for Jobs pull in new roles by themselves.
              <strong className="text-slate-700"> What you do:</strong> nothing — just keep the careers page public.
            </p>
            <DistributionDetails data={data} tier="auto" />
          </Card>

          {/* ───────────── (b) One-click direct post — LinkedIn / Google ───────────── */}
          {integrations && (
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">b</span>
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Zap className="h-4 w-4 text-brand-500" /> One-click direct post</h3>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    <strong className="text-slate-700">What it does:</strong> pushes a role straight to Google for Jobs or your LinkedIn company page (also fires automatically on publish).
                    <strong className="text-slate-700"> What you do:</strong> connect each once, then hit the button on any role below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSetup((s) => !s)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-500 transition-colors duration-150 ease-snappy hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                  aria-expanded={showSetup}
                >
                  <Settings2 className="h-3.5 w-3.5" /> Setup details
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ease-snappy ${showSetup ? 'rotate-180' : ''}`} />
                </button>
              </div>
              {!integrations.public_url_ok && showSetup && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Set <code className="rounded bg-amber-100 px-1">PUBLIC_BASE_URL</code> to your deployed site — Google can&apos;t index <code>localhost</code>, and LinkedIn links need a public URL.</span>
                </div>
              )}
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <IntegrationRow
                  name="Google for Jobs"
                  what="Tells Google to index a role so it can show in Google's jobs results."
                  configured={integrations.google.configured}
                  showSetup={showSetup}
                  hint="Add a Google service-account key (GOOGLE_INDEXING_SA_JSON) and verify your careers domain in Search Console."
                />
                <IntegrationRow
                  name="LinkedIn company page"
                  what="Posts the role as an update on your LinkedIn company page."
                  configured={integrations.linkedin.configured}
                  showSetup={showSetup}
                  hint="Add LINKEDIN_ACCESS_TOKEN + LINKEDIN_ORG_URN (you must be a page admin)."
                />
              </div>
              {!anyAuto && <p className="mt-3 text-[11px] text-slate-400">Not connected yet — until then, use the automatic boards above and the manual LinkedIn share button on each role.</p>}
            </Card>
          )}

          {/* ───────────── (c) Manual / partner boards — Indeed / Naukri / placement cells & vendors ───────────── */}
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">c</span>
              <h3 className="text-sm font-semibold text-slate-800">Manual / partner boards</h3>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              <strong className="text-slate-700">What it does:</strong> free aggregators (Adzuna, Jooble, Careerjet…) and offline partners — campus placement cells and recruitment vendors.
              <strong className="text-slate-700"> What you do:</strong> a one-time setup — paste your feed link on each board, or share the role link with partners.
            </p>
            <DistributionDetails data={data} tier="manual" />
          </Card>

          {/* The control panel: every published role, with its direct-post + share + copy actions. */}
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Published roles ({data.roles.length})</h3>
              <CopyBtn value={data.feeds.xml} label="Copy XML feed" />
            </div>
            {data.roles.map((r) => (
              <RoleRow key={r.id} role={r} integrations={integrations} busyKey={busyKey} onGoogle={pushGoogle} onLinkedin={pushLinkedin} onPartners={setPartnersRole} />
            ))}
          </Card>
        </>
      )}

      <SendToPartnersModal role={partnersRole} open={!!partnersRole} onClose={() => setPartnersRole(null)} />
    </div>
  )
}
