import { useState } from 'react'
import { LogIn, AlertTriangle } from 'lucide-react'
import { Button, Spinner, Field, inputClass } from '../ui'
import { useAuth } from '../contexts/auth'
import { usePageTitle } from '../hooks/usePageTitle'

export default function Login() {
  usePageTitle('Sign in')
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!email.trim() || !password) { setErr('Enter your email and password.'); return }
    setBusy(true); setErr('')
    try {
      await login(email.trim(), password)
    } catch (e2) {
      setErr(e2.message || 'Sign in failed')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/60 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-600 text-lg font-black text-white">H</div>
          <div className="leading-tight">
            <div className="text-base font-bold tracking-tight text-slate-900">HR-OS</div>
            <div className="text-xs text-slate-400">by EZ Works</div>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Welcome back. Use your team account to continue.</p>

          {err && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {err}
            </div>
          )}

          <div className="mt-4 space-y-3">
            <Field label="Email">
              <input className={inputClass} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
            </Field>
            <Field label="Password">
              <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
          </div>

          <Button type="submit" className="mt-5 w-full justify-center" disabled={busy}>
            {busy ? <Spinner /> : <><LogIn className="h-4 w-4" /> Sign in</>}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">Accounts are managed in Settings → Users by an admin.</p>
      </div>
    </div>
  )
}
