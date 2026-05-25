import { Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import AppShell from './components/layout/AppShell'
import Dashboard from './pages/Dashboard'
import Roles from './pages/Roles'
import RoleDetail from './pages/RoleDetail'
import Candidates from './pages/Candidates'
import Distribution from './pages/Distribution'
import Audit from './pages/Audit'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <ToastProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/roles" element={<Roles />} />
          <Route path="/roles/:id" element={<RoleDetail />} />
          <Route path="/candidates" element={<Candidates />} />
          <Route path="/distribution" element={<Distribution />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppShell>
    </ToastProvider>
  )
}
