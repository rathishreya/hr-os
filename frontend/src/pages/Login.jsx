import { useEffect, useState } from 'react'
import { LogIn, UserPlus, AlertTriangle } from 'lucide-react'
import { api } from '../api'
import { Button, Spinner, Field, inputClass } from '../ui'
import { useAuth } from '../contexts/auth'
import { usePageTitle } from '../hooks/usePageTitle'

export default function Login() {
  usePageTitle('Sign in')
  const { login, signup } = useAuth()
  const [mode, setMode] = useState('login')           // 'login' | 'signup'
  const [canSignup, setCanSignup] = useState(null)    // { open, first_user, domain }
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.canSignup()
      .then((s) => {
        setCanSignup(s)
        if (s.first_user) setMode('signup') // brand-new workspace → default to creating the owner account
      })
      .catch(() => setCanSignup({ open: false, first_user: false, domain: '' }))
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!email.trim() || !password) { setErr('Enter your email and password.'); return }
    if (mode === 'signup' && !name.trim()) { setErr('Enter your name.'); return }
    setBusy(true); setErr('')
    try {
      if (mode === 'signup') await signup(name.trim(), email.trim(), password)
      else await login(email.trim(), password)
    } catch (e2) {
      setErr(e2.message || (mode === 'signup' ? 'Sign up failed' : 'Sign in failed'))
      setBusy(false)
    }
  }

  const isSignup = mode === 'signup'
  const firstUser = canSignup?.first_user
  const showSignupToggle = canSignup?.open

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
          <h1 className="text-lg font-bold text-slate-900">{isSignup ? (firstUser ? 'Create your workspace' : 'Create your account') : 'Sign in'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isSignup
              ? (firstUser ? 'This first account is the workspace admin.' : 'Set up your account to get started.')
              : 'Welcome back. Use your team account to continue.'}
          </p>

          {err && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {err}
            </div>
          )}

          <div className="mt-4 space-y-3">
            {isSignup && (
              <Field label="Name">
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" autoFocus />
              </Field>
            )}
            <Field label="Email">
              <input className={inputClass} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={canSignup?.domain ? `you@${canSignup.domain}` : 'you@company.com'} autoFocus={!isSignup} />
            </Field>
            <Field label="Password">
              <input className={inputClass} type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isSignup ? 'At least 8 characters' : '••••••••'} />
            </Field>
          </div>

          <Button type="submit" className="mt-5 w-full justify-center" disabled={busy}>
            {busy ? <Spinner /> : isSignup ? <><UserPlus className="h-4 w-4" /> Create account</> : <><LogIn className="h-4 w-4" /> Sign in</>}
          </Button>

          {showSignupToggle && (
            <button type="button" onClick={() => { setMode(isSignup ? 'login' : 'signup'); setErr('') }}
              className="mt-3 w-full text-center text-sm text-brand-600 transition-colors duration-150 ease-snappy hover:text-brand-700 focus-visible:outline-none">
              {isSignup ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </button>
          )}
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          {showSignupToggle ? 'Accounts can also be managed in Settings → Users.' : 'Accounts are managed in Settings → Users by an admin.'}
        </p>
      </div>
    </div>
  )
}
