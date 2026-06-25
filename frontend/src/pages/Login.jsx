import { useEffect, useState } from 'react'
import { LogIn, UserPlus, AlertTriangle, KeyRound, MailCheck, ArrowLeft } from 'lucide-react'
import { api } from '../api'
import { Button, Spinner, Field, inputClass } from '../ui'
import { useAuth } from '../contexts/auth'
import { usePageTitle } from '../hooks/usePageTitle'

export default function Login() {
  usePageTitle('Sign in')
  const { login, signup } = useAuth()
  const [mode, setMode] = useState('login')           // 'login' | 'signup' | 'forgot'
  const [canSignup, setCanSignup] = useState(null)    // { open, first_user, domain }
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)             // forgot-password success

  useEffect(() => {
    api.canSignup()
      .then((s) => {
        setCanSignup(s)
        if (s.first_user) setMode('signup') // brand-new workspace → default to creating the owner account
      })
      .catch(() => setCanSignup({ open: false, first_user: false, domain: '' }))
  }, [])

  function switchMode(m) { setMode(m); setErr(''); setSent(false) }

  async function submit(e) {
    e.preventDefault()
    if (mode === 'forgot') {
      if (!email.trim()) { setErr('Enter your email.'); return }
      setBusy(true); setErr('')
      try {
        await api.forgotPassword(email.trim())
        setSent(true)
      } catch (e2) { setErr(e2.message || 'Could not send reset link') } finally { setBusy(false) }
      return
    }
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
  const isForgot = mode === 'forgot'
  const firstUser = canSignup?.first_user
  const showSignupToggle = canSignup?.open

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(60%_120%_at_50%_-10%,var(--color-brand-100)_0%,transparent_62%)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-600 text-lg font-black text-white shadow-sm shadow-brand-600/30 ring-1 ring-inset ring-white/20">H</div>
          <div className="leading-tight">
            <div className="text-base font-bold tracking-tight text-slate-900">HR-OS</div>
            <div className="text-xs text-slate-400">by EZ Works</div>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-pop">
          <h1 className="text-lg font-bold text-slate-900">
            {isForgot ? 'Reset your password' : isSignup ? (firstUser ? 'Create your workspace' : 'Create your account') : 'Sign in'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isForgot ? 'Enter your account email and we’ll send you a reset link.'
              : isSignup ? (firstUser ? 'This first account is the workspace admin.' : 'Set up your account to get started.')
                : 'Welcome back. Use your team account to continue.'}
          </p>

          {err && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {err}
            </div>
          )}

          {isForgot && sent ? (
            <>
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>If an account exists for <b>{email.trim()}</b>, a reset link is on its way. It expires in 1 hour. Check your inbox (and spam).</span>
              </div>
              <button type="button" onClick={() => switchMode('login')} className="mt-4 inline-flex w-full items-center justify-center gap-1 text-sm text-brand-600 hover:text-brand-700">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </button>
            </>
          ) : (
            <>
              <div className="mt-4 space-y-3">
                {isSignup && (
                  <Field label="Name">
                    <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" autoFocus />
                  </Field>
                )}
                <Field label="Email">
                  <input className={inputClass} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={canSignup?.domain ? `you@${canSignup.domain}` : 'you@company.com'} autoFocus={!isSignup} />
                </Field>
                {!isForgot && (
                  <Field label="Password">
                    <input className={inputClass} type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isSignup ? 'At least 8 characters' : '••••••••'} />
                  </Field>
                )}
                {mode === 'login' && (
                  <div className="text-right">
                    <button type="button" onClick={() => switchMode('forgot')} className="text-xs font-medium text-brand-600 hover:text-brand-700">Forgot password?</button>
                  </div>
                )}
              </div>

              <Button type="submit" className="mt-5 w-full justify-center" disabled={busy}>
                {busy ? <Spinner />
                  : isForgot ? <><KeyRound className="h-4 w-4" /> Send reset link</>
                    : isSignup ? <><UserPlus className="h-4 w-4" /> Create account</>
                      : <><LogIn className="h-4 w-4" /> Sign in</>}
              </Button>

              {isForgot ? (
                <button type="button" onClick={() => switchMode('login')} className="mt-3 inline-flex w-full items-center justify-center gap-1 text-sm text-brand-600 hover:text-brand-700">
                  <ArrowLeft className="h-4 w-4" /> Back to sign in
                </button>
              ) : showSignupToggle && (
                <button type="button" onClick={() => switchMode(isSignup ? 'login' : 'signup')}
                  className="mt-3 w-full text-center text-sm text-brand-600 transition-colors duration-150 ease-snappy hover:text-brand-700 focus-visible:outline-none">
                  {isSignup ? 'Already have an account? Sign in' : 'New here? Create an account'}
                </button>
              )}
            </>
          )}
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          {showSignupToggle ? 'Accounts can also be managed in Settings → Users.' : 'Accounts are managed in Settings → Users by an admin.'}
        </p>
      </div>
    </div>
  )
}
