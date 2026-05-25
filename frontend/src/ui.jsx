import { useEffect, useRef } from 'react'

export const cx = (...c) => c.filter(Boolean).join(' ')

export function Card({ className = '', children }) {
  return (
    <div className={cx('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>
      {children}
    </div>
  )
}

export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-600/20',
    ghost: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200',
    subtle: 'bg-transparent hover:bg-slate-100 text-slate-500 hover:text-slate-800',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white',
  }[variant]
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
        styles,
        className,
      )}
      {...props}
    />
  )
}

export function IconButton({ className = '', ...props }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800',
        className,
      )}
      {...props}
    />
  )
}

const TONES = {
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  blue: 'bg-sky-50 text-sky-700 border-sky-200',
  gray: 'bg-slate-100 text-slate-600 border-slate-200',
}

export function Badge({ tone = 'gray', className = '', children }) {
  return (
    <span className={cx('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {children}
    </span>
  )
}

export function Spinner({ className = '' }) {
  return (
    <span className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-violet-600', className)} />
  )
}

export function Skeleton({ className = '' }) {
  return <div className={cx('animate-pulse rounded-xl bg-slate-200/70', className)} />
}

export function scoreTone(score) {
  if (score >= 80) return 'green'
  if (score >= 65) return 'blue'
  if (score >= 50) return 'amber'
  return 'rose'
}

export function ScoreBar({ value, label }) {
  const color = { green: 'bg-emerald-500', blue: 'bg-sky-500', amber: 'bg-amber-500', rose: 'bg-rose-500' }[scoreTone(value)]
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span className="capitalize">{label.replace(/_/g, ' ')}</span>
        <span className="tabular-nums font-medium text-slate-700">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

export const stageTone = {
  applied: 'gray', screening: 'blue', shortlisted: 'violet',
  interview: 'amber', offer: 'green', hired: 'green', rejected: 'rose',
}

export function Avatar({ name, className = '' }) {
  const initials = (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?'
  return (
    <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700', className)}>
      {initials}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <Card className="p-10 text-center">
      {Icon && (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  )
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cx(
            'shrink-0 px-4 py-2.5 text-sm font-medium transition',
            active === t.id
              ? 'border-b-2 border-violet-600 text-slate-900'
              : 'text-slate-400 hover:text-slate-700',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="modal-title" className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        {title && <h2 id="modal-title" className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>}
        {children}
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}
