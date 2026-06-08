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

/** Plain-language distribution help: Automatic boards vs Connect-once boards, with one
 *  feed link to copy. Technical feed/page URLs are tucked behind an "Advanced" toggle. */
export function DistributionDetails({ data }) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  if (!data) return null
  const auto = data.channels.filter((c) => c.auto)
  const manual = data.channels.filter((c) => !c.auto)

  return (
    <>
      {!data.is_public && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>You&apos;re on <strong>localhost</strong>, so job boards — and the LinkedIn share/apply links — can&apos;t be reached yet. Once the app is deployed to a public web address, the links below (and the LinkedIn buttons) go live.</span>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        When you publish a job it lists on the free boards below. <strong className="text-emerald-700">Automatic</strong> ones
        pick it up on their own. <strong className="text-brand-700">Connect-once</strong> ones need a one-time setup — copy
        your feed link and paste it on each board; after that, every job you publish syncs by itself.
      </p>

      {/* Automatic */}
      {auto.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Automatic — nothing to do</h4>
          <div className="space-y-2">{auto.map((ch) => <AutoRow key={ch.key} ch={ch} />)}</div>
        </div>
      )}

      {/* Connect once */}
      {manual.length > 0 && (
        <div className="mt-5">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700"><Plug className="h-3.5 w-3.5" /> Connect once (free)</h4>
          <div className="mb-2.5 rounded-xl border border-brand-200 bg-brand-50/60 p-3">
            <div className="text-xs font-semibold text-brand-900"><span className="mr-1 rounded bg-brand-200 px-1.5 py-0.5 text-[10px]">STEP 1</span> Copy your job feed link</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-xs text-slate-600">{data.feeds.xml}</code>
              <CopyBtn value={data.feeds.xml} label="Copy feed link" />
            </div>
            <div className="mt-2.5 text-xs font-semibold text-brand-900"><span className="mr-1 rounded bg-brand-200 px-1.5 py-0.5 text-[10px]">STEP 2</span> Open each board and paste it where they ask for a feed / XML URL</div>
          </div>
          <div className="space-y-2">{manual.map((ch) => <ConnectRow key={ch.key} ch={ch} />)}</div>
        </div>
      )}

      {/* Advanced links */}
      <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="mt-4 flex items-center gap-1 rounded-md text-xs font-medium text-slate-400 transition-colors duration-150 ease-snappy hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">
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

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">All boards above are free. Naukri and ZipRecruiter have no free auto-posting, so they&apos;re not listed. LinkedIn has no free feed either — post it manually with the <strong className="text-sky-700">LinkedIn</strong> button (applicants still flow back into the pipeline, tagged <code>linkedin</code>).</p>
    </>
  )
}
