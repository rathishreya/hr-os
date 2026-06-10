import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, Link2, UserPlus, ChevronDown, MoreHorizontal,
  Copy, Archive, Trash2, Sparkles, FileText, Pencil, RotateCcw,
} from 'lucide-react'
import { Badge, Button, cx } from '../../ui'
import { useToast } from '../Toast'

export const JOB_VIEWS = [
  { id: 'applications', label: 'Applications', countKey: 'applications' },
  { id: 'shortlisted', label: 'Shortlisted', countKey: 'shortlisted' },
  { id: 'positions', label: 'Positions', countKey: 'positions' },
  { id: 'pool', label: 'Talent pool', countKey: 'talent_pool' },
  { id: 'analytics', label: 'Analytics' },
]

export const JOB_META_VIEWS = [
  { id: 'insights', label: 'AI insights', icon: Sparkles },
  { id: 'jd', label: 'Job post', icon: FileText },
]

export default function JobDetailShell({
  role,
  summary,
  jd,
  activeView,
  onViewChange,
  hasLiveScreen,
  onAddUpload,
  onAddPool,
  onEdit,
  onDuplicate,
  onCloseRole,
  onReopenRole,
  onDelete,
  roleStatus,
}) {
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const menuRef = useRef(null)
  const counts = summary?.counts || {}

  useEffect(() => {
    function close(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // Copies the public careers job-post URL (the page applicants open to apply).
  async function copyLink() {
    if (!jd?.id) {
      toast('Generate the job post first (Job post tab)', 'error')
      return
    }
    const url = `${window.location.origin}/careers/${jd.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast(jd.status === 'published' ? 'Careers link copied' : 'Link copied — publish the job to make it live')
    } catch {
      toast('Could not copy link', 'error')
    }
  }

  const hm = summary?.hiring_manager || role?.interview_panel?.[1] || ''
  const recruiter = summary?.recruiter || role?.interview_panel?.[0] || ''

  return (
    <header className="relative z-40 shrink-0 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 lg:px-5">
        <Link
          to="/roles"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 ease-snappy hover:bg-slate-100 hover:text-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          title="All jobs"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 lg:text-lg">
              {role.position}
            </h1>
            <span className="shrink-0 font-mono text-xs text-slate-400">#{role.id}</span>
            <Badge tone={role.status === 'open' ? 'green' : 'gray'} className="shrink-0 text-[10px]">
              {role.status}
            </Badge>
            {hasLiveScreen && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
                Live screen
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {[role.department, role.location, role.work_mode].filter(Boolean).join(' · ')}
            {(hm || recruiter) && (
              <span className="hidden text-slate-400 sm:inline">
                {' · '}{recruiter && `Rec: ${recruiter}`}{hm && recruiter && ' · '}{hm && `HM: ${hm}`}
              </span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" className="h-8 gap-1 px-2.5 text-xs" onClick={onEdit} title="Edit job details">
            <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button variant="ghost" className="h-8 gap-1 px-2.5 text-xs" onClick={copyLink} title="Copy the public careers link for this job">
            <Link2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Copy link</span>
          </Button>

          <div className="relative">
            <Button className="h-8 gap-1 px-3 text-xs shadow-md shadow-brand-600/20" onClick={() => setAddOpen((o) => !o)}>
              <UserPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add</span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </Button>
            {addOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-48 origin-top-right menu-in overflow-hidden rounded-xl border border-slate-200/80 bg-white py-1 shadow-xl shadow-slate-900/10">
                <button type="button" className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition-colors duration-150 ease-snappy hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/50" onClick={() => { onAddUpload?.(); setAddOpen(false) }}>Upload / paste resume</button>
                <button type="button" className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition-colors duration-150 ease-snappy hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/50" onClick={() => { onAddPool?.(); setAddOpen(false) }}>From talent pool</button>
              </div>
            )}
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors duration-150 ease-snappy hover:bg-slate-50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-44 origin-top-right menu-in rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 transition-colors duration-150 ease-snappy hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/50" onClick={() => { onDuplicate?.(); setMenuOpen(false) }}>
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </button>
                {roleStatus === 'open' ? (
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 transition-colors duration-150 ease-snappy hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/50" onClick={() => { onCloseRole?.(); setMenuOpen(false) }}>
                    <Archive className="h-3.5 w-3.5" /> Close role
                  </button>
                ) : (
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-emerald-700 transition-colors duration-150 ease-snappy hover:bg-emerald-50 focus-visible:outline-none focus-visible:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/50" onClick={() => { onReopenRole?.(); setMenuOpen(false) }}>
                    <RotateCcw className="h-3.5 w-3.5" /> Reopen role
                  </button>
                )}
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 transition-colors duration-150 ease-snappy hover:bg-rose-50 focus-visible:outline-none focus-visible:bg-rose-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500/50" onClick={() => { onDelete?.(); setMenuOpen(false) }}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete job
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Single nav row — light premium segmented control */}
      <nav className="px-4 pb-2.5 lg:px-5">
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100/70 p-1 ring-1 ring-slate-200/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {JOB_VIEWS.map((v) => {
            const count = v.countKey ? counts[v.countKey] : null
            const active = activeView === v.id
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onViewChange(v.id)}
                className={cx(
                  'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition duration-150 ease-snappy active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
                  active
                    ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-500 hover:bg-white/50 hover:text-slate-700',
                )}
              >
                {v.label}
                {count != null && (
                  <span className={cx('ml-1 tabular-nums', active ? 'text-brand-500' : 'text-slate-400')}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
          <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-200/80" />
          {JOB_META_VIEWS.map((v) => {
            const Icon = v.icon
            const active = activeView === v.id
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onViewChange(v.id)}
                className={cx(
                  'inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition duration-150 ease-snappy active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
                  active
                    ? 'bg-white text-brand-800 shadow-sm ring-1 ring-brand-200/80'
                    : 'text-slate-500 hover:bg-white/50 hover:text-brand-700',
                )}
              >
                <Icon className="h-3 w-3" />
                {v.label}
              </button>
            )
          })}
        </div>
      </nav>
    </header>
  )
}
