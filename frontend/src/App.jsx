import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import AppShell from './components/layout/AppShell'
import { Spinner } from './ui'
import Dashboard from './pages/Dashboard'
import Roles from './pages/Roles'
import RoleDetail from './pages/RoleDetail'
import Candidates from './pages/Candidates'
import Distribution from './pages/Distribution'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

// Heavy / standalone pages — loaded on demand.
const Analytics = lazy(() => import('./pages/Analytics'))           // recharts
const VideoInterview = lazy(() => import('./pages/VideoInterview')) // candidate-facing, standalone (no sidebar)

const Loading = () => <div className="flex items-center gap-2 p-8 text-sm text-slate-400"><Spinner /> Loading…</div>

function AppRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/roles" element={<Roles />} />
        <Route path="/roles/:id" element={<RoleDetail />} />
        <Route path="/candidates" element={<Candidates />} />
        <Route path="/distribution" element={<Distribution />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/analytics" element={<Suspense fallback={<Loading />}><Analytics /></Suspense>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        {/* Public candidate interview — no recruiter shell */}
        <Route path="/interview/:appId" element={<Suspense fallback={<Loading />}><VideoInterview /></Suspense>} />
        <Route path="/*" element={<AppRoutes />} />
      </Routes>
    </ToastProvider>
  )
}
