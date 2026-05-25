import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Home, Briefcase, Menu, X, Settings, Users, Megaphone, BarChart3 } from 'lucide-react'
import { IconButton } from '../../ui'

export const NAV = [
  { to: '/', label: 'Home', end: true, icon: Home },
  { to: '/roles', label: 'Jobs', icon: Briefcase },
  { to: '/distribution', label: 'Distribution', icon: Megaphone },
  { to: '/candidates', label: 'Talent Pool', icon: Users },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
]

function SidebarContent({ onNavigate }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-8 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-lg font-black text-white">H</div>
        <div>
          <div className="text-sm font-bold tracking-tight text-slate-900">HR-OS</div>
          <div className="text-[10px] text-slate-400">AI Hiring Operating System</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((n) => {
          const Icon = n.icon
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-violet-50 text-violet-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0 opacity-70" />
              {n.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-auto space-y-3">
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition ${
              isActive ? 'bg-violet-50 text-violet-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`
          }
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </NavLink>
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-sm font-black text-white">H</div>
          <span className="text-sm font-semibold text-slate-800">{pageLabel}</span>
        </header>

        <main className={isJobDetail ? 'flex flex-1 flex-col overflow-hidden px-2 py-2 sm:px-3 lg:px-4 lg:py-3' : 'flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8'}>
          <div className={isJobDetail ? 'mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col' : 'mx-auto max-w-6xl'}>{children}</div>
        </main>
      </div>
    </div>
  )
}
