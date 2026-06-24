import { useState } from 'react'
import { Copy, Check, Globe, Rss, Code, Map, Send, AlertTriangle, ChevronDown, CheckCircle2, Plug } from 'lucide-react'

// Shared distribution UI used by both the per-role JobPostTab card and the
// Distribution page. Single source of truth so the two views never drift apart.

// lucide-react v1 dropped all brand icons, so inline the LinkedIn glyph. Sizes via the
// passed className (e.g. h-4 w-4) and inherits text color through fill="currentColor".
export function LinkedinIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zm1.78 13.02H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  )
}

export function CopyBtn({ value, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(value || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button type="button" onClick={copy} className={`inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 transition duration-150 ease-snappy hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97] ${className}`}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : label}
    </button>
  )
}

function FeedChip({ icon: Icon, label, url }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-brand-500" />
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <a href={url} target="_blank" rel="noreferrer" className="max-w-[160px] truncate rounded text-xs text-slate-400 transition-colors duration-150 ease-snappy hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50" title={url}>{url.replace(/^https?:\/\//, '')}</a>
      <CopyBtn value={url} label="" className="ml-auto !px-1.5" />
    </div>
  )
}

// "Automatic" board — picks up jobs on its own, nothing to set up.
function AutoRow({ ch }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-800">{ch.name}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{ch.note}</p>
      </div>
      {ch.submit_url && (
        <a href={ch.submit_url} target="_blank" rel="noreferrer" className="shrink-0 whitespace-nowrap rounded-md text-xs font-medium text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">Open ↗</a>
      )}
    </div>
  )
}

// Static "offline" partner channels — placement cells & recruitment vendors. There's
// no feed/API for these; the recruiter shares the role link out-of-band. Listed so the
// manual tier names every realistic route, not just the feed-based boards.
const OFFLINE_PARTNERS = [
  { key: 'placement_cells', name: 'Campus placement cells', note: 'Email the role link to college TPOs / placement offices.' },
  { key: 'vendors', name: 'Recruitment vendors & agencies', note: 'Forward the role link to your staffing partners.' },
]

function OfflineRow({ ch, shareUrl }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800">{ch.name}</div>
        <p className="truncate text-xs text-slate-400">{ch.note}</p>
      </div>
      <CopyBtn value={shareUrl} label="Copy role link" className="shrink-0" />
    </div>
  )
}

// "Connect once" board — paste the feed link (copied once above), then it syncs.
function ConnectRow({ ch }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800">{ch.name}</div>
        <p className="truncate text-xs text-slate-400">{ch.note}</p>
      </div>
      <a href={ch.submit_url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white transition duration-150 ease-snappy hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97]">
        <Send className="h-3.5 w-3.5" /> Open
      </a>
    </div>
  )
}

// Tier (a): the truly hands-off boards. Pull from the public careers page / sitemap with
// zero setup (Google for Jobs, Indeed's crawler). The Distribution page wraps this in its
// own labelled (a) card, so it passes showHeading={false} to avoid a duplicate heading; the
// per-role Job Post tab renders both tiers stacked and keeps the headings.
function AutoTier({ channels, showHeading = true }) {
  if (!channels.length) return null
  return (
    <div>
      {showHeading && (
        <>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Automatic &amp; free</h4>
          <p className="mb-2 mt-0.5 text-xs text-slate-500">These crawl your public careers page on their own. <strong className="text-emerald-700">You do nothing</strong> — new roles show up within hours.</p>
        </>
      )}
      <div className="space-y-2">{channels.map((ch) => <AutoRow key={ch.key} ch={ch} />)}</div>
    </div>
  )
}

// Tier (c): boards you submit a feed to once (Adzuna, Jooble, …) plus offline partners
// (placement cells, vendors) where you just hand over the role link. showHeading is false
// when the Distribution page already supplies the labelled (c) card around it.
function ManualTier({ feedBoards, feedUrl, shareUrl, showHeading = true }) {
  return (
    <div>
      {showHeading && (
        <>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700"><Plug className="h-3.5 w-3.5" /> Manual / partner boards</h4>
          <p className="mb-2 mt-0.5 text-xs text-slate-500">No free auto-posting. <strong className="text-brand-700">One-time setup:</strong> paste your feed link on each board below, or send the role link to placement cells &amp; vendors.</p>
        </>
      )}
      {feedBoards.length > 0 && (
        <>
          <div className="mb-2.5 rounded-xl border border-brand-200 bg-brand-50/60 p-3">
            <div className="text-xs font-semibold text-brand-900"><span className="mr-1 rounded bg-brand-200 px-1.5 py-0.5 text-[10px]">STEP 1</span> Copy your job feed link</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-xs text-slate-600">{feedUrl}</code>
              <CopyBtn value={feedUrl} label="Copy feed link" />
            </div>
            <div className="mt-2.5 text-xs font-semibold text-brand-900"><span className="mr-1 rounded bg-brand-200 px-1.5 py-0.5 text-[10px]">STEP 2</span> Open each board and paste it where they ask for a feed / XML URL</div>
          </div>
          <div className="space-y-2">{feedBoards.map((ch) => <ConnectRow key={ch.key} ch={ch} />)}</div>
        </>
      )}
      {/* Offline partners: no feed/API — just hand over the role link. */}
      <div className="mt-2 space-y-2">{OFFLINE_PARTNERS.map((ch) => <OfflineRow key={ch.key} ch={ch} shareUrl={shareUrl} />)}</div>
    </div>
  )
}

/** Plain-language distribution help: the Automatic & free tier and the Manual / partner
 *  tier, with one feed link to copy. Pass `tier="auto"` or `tier="manual"` to render just
 *  one section (the Distribution page slots the one-click tier between them); omit `tier`
 *  to render both stacked (used on the per-role Job Post tab). Technical feed/page URLs are
 *  tucked behind an "Advanced" toggle, shown only when the manual tier is present. */
export function DistributionDetails({ data, tier }) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  if (!data) return null
  // Owner's grouping: tier (a) "Automatic & free" = hands-off boards (auto:true from the
  // backend — Google for Jobs, Indeed's crawler). Tier (c) "Manual / partner" = feed boards
  // (auto:false — Adzuna, Jooble, …) plus offline partners (placement cells, vendors).
  const auto = data.channels.filter((c) => c.auto)
  const feedBoards = data.channels.filter((c) => !c.auto)
  const shareUrl = data.feeds.careers
  const showAuto = tier !== 'manual'
  const showManual = tier !== 'auto'

  return (
    <div className="space-y-5">
      {!data.is_public && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>You&apos;re on <strong>localhost</strong>, so job boards — and the LinkedIn share/apply links — can&apos;t be reached yet. Once the app is deployed to a public web address, the links below (and the LinkedIn buttons) go live.</span>
        </div>
      )}

      {/* When the page asks for a single tier it already supplies a labelled (a)/(c) card,
          so drop the inner heading to avoid duplication; stacked mode keeps both headings. */}
      {showAuto && <AutoTier channels={auto} showHeading={!tier} />}

      {showManual && (
        <>
          <ManualTier feedBoards={feedBoards} feedUrl={data.feeds.xml} shareUrl={shareUrl} showHeading={!tier} />

          {/* Advanced links */}
          <div>
            <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="flex items-center gap-1 rounded-md text-xs font-medium text-slate-400 transition-colors duration-150 ease-snappy hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ease-snappy ${showAdvanced ? 'rotate-180' : ''}`} /> Other feed &amp; page links (advanced)
            </button>
            {showAdvanced && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <FeedChip icon={Globe} label="Careers page" url={data.feeds.careers} />
                <FeedChip icon={Code} label="XML job feed" url={data.feeds.xml} />
                <FeedChip icon={Rss} label="RSS feed" url={data.feeds.rss} />
                <FeedChip icon={Map} label="Sitemap (Google)" url={data.feeds.sitemap} />
              </div>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-slate-400">All boards above are free. Naukri and ZipRecruiter have no free auto-posting, so they&apos;re not listed. LinkedIn has no free feed either — post it manually with the <strong className="text-sky-700">LinkedIn</strong> button (applicants still flow back into the pipeline, tagged <code>linkedin</code>).</p>
        </>
      )}
    </div>
  )
}
