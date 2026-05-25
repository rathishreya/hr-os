import { useState } from 'react'
import { Copy, Check, Globe, Rss, Code, Map, Send, AlertTriangle, Sparkles } from 'lucide-react'

// Shared distribution UI used by both the per-role JobPostTab card and the
// Distribution dashboard page. Single source of truth for the feed chips and the
// free-channel rows so the two views never drift apart.

export function CopyBtn({ value, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(value || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button type="button" onClick={copy} className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-violet-300 hover:text-violet-700 ${className}`}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : label}
    </button>
  )
}

function FeedChip({ icon: Icon, label, url }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-violet-500" />
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <a href={url} target="_blank" rel="noreferrer" className="max-w-[180px] truncate text-xs text-slate-400 hover:text-violet-600" title={url}>{url.replace(/^https?:\/\//, '')}</a>
      <CopyBtn value={url} label="" className="ml-auto !px-1.5" />
    </div>
  )
}

function ChannelRow({ ch }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{ch.name}</span>
          {ch.auto
            ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Automatic</span>
            : <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">Register feed</span>}
          <span className="text-[11px] text-slate-400">· {ch.method}</span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{ch.note}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!ch.auto && <CopyBtn value={ch.submit_value} label="Copy feed URL" />}
        <a href={ch.submit_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700">
          <Send className="h-3.5 w-3.5" /> Open {ch.name.split(' ')[0]}
        </a>
      </div>
    </div>
  )
}

/** The localhost warning + feed chips + free-channel list. Reused everywhere. */
export function DistributionDetails({ data }) {
  if (!data) return null
  return (
    <>
      {!data.is_public && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>These URLs point to <strong>localhost</strong>, which external crawlers can&apos;t reach. Set <code className="rounded bg-amber-100 px-1">PUBLIC_BASE_URL</code> and deploy publicly, then submit the feeds. The feeds themselves are valid right now.</span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <FeedChip icon={Code} label="XML feed" url={data.feeds.xml} />
        <FeedChip icon={Rss} label="RSS" url={data.feeds.rss} />
        <FeedChip icon={Map} label="Sitemap" url={data.feeds.sitemap} />
        <FeedChip icon={Globe} label="Careers" url={data.feeds.careers} />
      </div>

      <div className="mt-4 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Free channels</h4>
      </div>
      <div className="mt-2 space-y-2">
        {data.channels.map((ch) => <ChannelRow key={ch.key} ch={ch} />)}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">All channels above are free. The big paid/partner-only boards (LinkedIn, Naukri, ZipRecruiter) have no free programmatic posting — there&apos;s no honest way to auto-post there without a paid API or a ToS-violating bot.</p>
    </>
  )
}
