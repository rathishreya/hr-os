import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { KeyRound, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { api, setAuthToken } from '../api'
import { Button, Spinner, Field, inputClass } from '../ui'
import { usePageTitle } from '../hooks/usePageTitle'

export default function ResetPassword() {
  usePageTitle('Reset password')
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (password.length < 8) { setErr('Use at least 8 characters.'); return }
    if (password !== confirm) { setErr('Passwords don’t match.'); return }
    setBusy(true); setErr('')
    try {
      const r = await api.resetPassword(token, password)
      if (r.token) setAuthToken(r.token)   // sign in with the freshly-reset account
      setDone(true)
      // Full navigation so the auth context re-reads the new session, then lands in the app.
      setTimeout(() => { window.location.assign('/') }, 1200)
    } catch (e2) {
      setErr(e2.message || 'Could not reset your password.')
      setBusy(false)
    }
  }

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
          <h1 className="text-lg font-bold text-slate-900">Set a new password</h1>
          <p className="mt-1 text-sm text-slate-500">Choose a new password for your account.</p>

          {!token ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> This link is missing its reset token. Request a new one from the sign-in page.
            </div>
          ) : done ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Password updated — signing you in…
            </div>
          ) : (
            <>
              {err && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {err}
                </div>
              )}
              <div className="mt-4 space-y-3">
                <Field label="New password">
                  <input className={inputClass} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoFocus />
                </Field>
                <Field label="Confirm new password">
                  <input className={inputClass} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter the password" />
                </Field>
              </div>
              <Button type="submit" className="mt-5 w-full justify-center" disabled={busy}>
                {busy ? <Spinner /> : <><KeyRound className="h-4 w-4" /> Reset password</>}
              </Button>
            </>
          )}
          <a href="/" className="mt-3 block text-center text-sm text-brand-600 hover:text-brand-700">Back to sign in</a>
        </form>
      </div>
    </div>
  )
}
