import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, Link2, UserPlus, ChevronDown, MoreHorizontal,
  Copy, Archive, Trash2, Sparkles, FileText,
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
  activeView,
  onViewChange,
  hasLiveScreen,
  onAddUpload,
  onAddPool,
  onDuplicate,
  onCloseRole,
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

  async function copyLink() {
    const url = `${window.location.origin}/roles/${role.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Job link copied')
    } catch {
      toast('Could not copy link', 'error')
    }
  }

  const hm = summary?.hiring_manager || role?.interview_panel?.[1] || ''
  const recruiter = summary?.recruiter || role?.interview_panel?.[0] || ''

  return (
    <header className="shrink-0 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 lg:px-5">
        <Link
          to="/roles"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
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
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
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
          <Button variant="ghost" className="hidden h-8 gap-1 px-2.5 text-xs sm:inline-flex" onClick={copyLink}>
            <Link2 className="h-3.5 w-3.5" /> Copy link
          </Button>

          <div className="relative">
            <Button className="h-8 gap-1 px-3 text-xs shadow-md shadow-violet-600/20" onClick={() => setAddOpen((o) => !o)}>
              <UserPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add</span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </Button>
            {addOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200/80 bg-white py-1 shadow-xl shadow-slate-900/10">
                <button type="button" className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { onAddUpload?.(); setAddOpen(false) }}>Upload / paste resume</button>
                <button type="button" className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50" onClick={() => { onAddPool?.(); setAddOpen(false) }}>From talent pool</button>
              </div>
            )}
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => { copyLink(); setMenuOpen(false) }}>
                  <Link2 className="h-3.5 w-3.5 sm:hidden" /> Copy link
                </button>
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => { onDuplicate?.(); setMenuOpen(false) }}>
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </button>
                {roleStatus === 'open' && (
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => { onCloseRole?.(); setMenuOpen(false) }}>
                    <Archive className="h-3.5 w-3.5" /> Close role
                  </button>
                )}
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50" onClick={() => { onDelete?.(); setMenuOpen(false) }}>
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
                  'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                  active
                    ? 'bg-white text-violet-800 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-500 hover:bg-white/50 hover:text-slate-700',
                )}
              >
                {v.label}
                {count != null && (
                  <span className={cx('ml-1 tabular-nums', active ? 'text-violet-500' : 'text-slate-400')}>
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
                  'inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                  active
                    ? 'bg-white text-violet-800 shadow-sm ring-1 ring-violet-200/80'
                    : 'text-slate-500 hover:bg-white/50 hover:text-violet-700',
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
