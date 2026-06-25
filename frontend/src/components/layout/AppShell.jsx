import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Home, Briefcase, Menu, X, Settings, Users, Megaphone, BarChart3, FileText, Rocket, ClipboardList, LogOut } from 'lucide-react'
import { IconButton, Avatar } from '../../ui'
import { useAuth } from '../../contexts/auth'

export const NAV = [
  { to: '/', label: 'Home', end: true, icon: Home },
  { to: '/roles', label: 'Jobs', icon: Briefcase, group: 'Recruiting' },
  { to: '/distribution', label: 'Distribution', icon: Megaphone, group: 'Recruiting' },
  { to: '/candidates', label: 'Talent Pool', icon: Users, group: 'Recruiting' },
  { to: '/assessments', label: 'Assessments', icon: ClipboardList, group: 'Recruiting' },
  { to: '/offer-docs', label: 'Offer & Docs', icon: FileText, group: 'Hiring' },
  { to: '/onboarding', label: 'Onboarding', icon: Rocket, group: 'Hiring' },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, group: 'Insights' },
]

// Workflow phases for the sidebar — turns a flat 8-item list into scannable sections.
const NAV_GROUPS = [...new Set(NAV.filter((n) => n.group).map((n) => n.group))]

function NavRow({ n, onNavigate }) {
  const Icon = n.icon
  return (
    <NavLink
      to={n.to}
      end={n.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
          isActive
            ? 'bg-brand-50 font-semibold text-brand-700 shadow-[inset_0_0_0_1px] shadow-brand-100'
            : 'font-medium text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={`h-4 w-4 shrink-0 transition-opacity duration-150 ${isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-90'}`} />
          {n.label}
        </>
      )}
    </NavLink>
  )
}

function SidebarContent({ onNavigate }) {
  const { user, logout } = useAuth()
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-8 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-600 text-lg font-black text-white shadow-sm shadow-brand-600/30 ring-1 ring-inset ring-white/20">H</div>
        <div>
          <div className="text-sm font-bold tracking-tight text-slate-900">HR-OS</div>
          <div className="text-[10px] font-medium text-slate-500">by EZ Works</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.filter((n) => !n.group).map((n) => <NavRow key={n.to} n={n} onNavigate={onNavigate} />)}
        {NAV_GROUPS.map((g) => (
          <div key={g} className="mt-5 first:mt-2">
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g}</div>
            <div className="flex flex-col gap-0.5">
              {NAV.filter((n) => n.group === g).map((n) => <NavRow key={n.to} n={n} onNavigate={onNavigate} />)}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-3 border-t border-slate-100 pt-4">
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
              isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`
          }
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </NavLink>
        {user && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-2.5 py-2">
            <Avatar name={user.name || user.email} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-xs font-semibold text-slate-700">{user.name || user.email}</div>
              <div className="truncate text-[10px] text-slate-400">{(user.roles || []).join(', ') || 'member'}</div>
            </div>
            <IconButton onClick={logout} title="Sign out" aria-label="Sign out" className="hover:text-rose-600"><LogOut className="h-4 w-4" /></IconButton>
          </div>
        )}
        <p className="px-1 text-[10px] leading-relaxed text-slate-400">
          AI scores are suggestions — always human-reviewable. No candidate is auto-rejected.
        </p>
      </div>
    </div>
  )
}

export default function AppShell({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const isJobDetail = /^\/roles\/\d+/.test(location.pathname)
  const pageLabel = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))?.label
    || (location.pathname.startsWith('/settings') ? 'Settings' : isJobDetail ? 'Job detail' : 'Page')

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white p-5 lg:flex">
        <SidebarContent onNavigate={() => {}} />
      </aside>

      {mobileOpen && (
        <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white p-5 transition-transform duration-200 lg:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-4 flex justify-end lg:hidden">
          <IconButton onClick={() => setMobileOpen(false)} aria-label="Close"><X className="h-5 w-5" /></IconButton>
        </div>
        <SidebarContent onNavigate={() => setMobileOpen(false)} />
      </aside>

      <div className="flex h-screen flex-1 flex-col overflow-hidden lg:ml-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <IconButton onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></IconButton>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-fuchsia-600 text-sm font-black text-white">H</div>
          <span className="text-sm font-semibold text-slate-800">{pageLabel}</span>
        </header>

        <main className={isJobDetail ? 'flex flex-1 flex-col overflow-hidden px-2 py-2 sm:px-3 lg:px-4 lg:py-3' : 'flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8'}>
          <div className={isJobDetail ? 'mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col' : 'mx-auto max-w-6xl'}>{children}</div>
        </main>
      </div>
    </div>
  )
}
