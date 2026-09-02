import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { AuthProvider, useAuth } from './contexts/auth'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell from './components/layout/AppShell'
import Login from './pages/Login'
import PanelHome from './pages/PanelHome'
import { Spinner } from './ui'
import Dashboard from './pages/Dashboard'
import Roles from './pages/Roles'
import RoleDetail from './pages/RoleDetail'
import Candidates from './pages/Candidates'
import Partners from './pages/Partners'
import Distribution from './pages/Distribution'
import Settings from './pages/Settings'
import Assessments from './pages/Assessments'
import OfferDocs from './pages/OfferDocs'
import Onboarding from './pages/Onboarding'
import ResetPassword from './pages/ResetPassword'
import PartnerIntake from './pages/PartnerIntake'
import OnboardingForm from './pages/OnboardingForm'
import NotFound from './pages/NotFound'

const Analytics = lazy(() => import('./pages/Analytics'))           // recharts
const VideoInterview = lazy(() => import('./pages/VideoInterview')) // candidate-facing, standalone (no sidebar)

const Loading = () => <div className="flex items-center gap-2 p-8 text-sm text-slate-400"><Spinner /> Loading…</div>

function RequireAuth({ children }) {
  const { user, ready } = useAuth()
  if (!ready) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400"><Spinner /> Loading…</div>
  if (!user) return <Login />
  // Panelist-only users get the focused interview-panel view, not the recruiter app.
  const roles = (user.roles || []).map((r) => r.toLowerCase())
  const isStaff = roles.some((r) => r === 'admin' || r === 'manager' || r === 'recruiter')
  if (!isStaff && roles.includes('panellist')) return <PanelHome />
  return children
}

function AppRoutes() {
  return (
    <AppShell>
      {/* A crash in any page/modal shows a recoverable error here instead of blanking the whole
          app — the sidebar/nav stay usable. */}
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/roles" element={<Roles />} />
          <Route path="/roles/:id" element={<RoleDetail />} />
          <Route path="/candidates" element={<Candidates />} />
          <Route path="/partners" element={<Partners />} />
          <Route path="/distribution" element={<Distribution />} />
          <Route path="/assessments" element={<Assessments />} />
          <Route path="/offer-docs" element={<OfferDocs />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/analytics" element={<Suspense fallback={<Loading />}><Analytics /></Suspense>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </AppShell>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          {/* Public candidate interview — no recruiter shell, no login */}
          <Route path="/interview/:appId" element={<Suspense fallback={<Loading />}><VideoInterview /></Suspense>} />
          {/* Public password-reset link target (no login) */}
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* Public partner (vendor / college) self-registration form (no login) */}
          <Route path="/partner-intake" element={<PartnerIntake />} />
          {/* The onboarding form: a signed per-candidate link, and a generic one. */}
          <Route path="/onboarding-form" element={<OnboardingForm />} />
          <Route path="/onboarding-form/:candidateId" element={<OnboardingForm />} />
          <Route path="/*" element={<RequireAuth><AppRoutes /></RequireAuth>} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  )
}

