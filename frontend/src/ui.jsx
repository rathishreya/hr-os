import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

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
    primary: 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-600/20',
    ghost: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200',
    subtle: 'bg-transparent hover:bg-slate-100 text-slate-500 hover:text-slate-800',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white',
  }[variant]
  return (
    <button
      className={cx(
        // Press feedback (scale on :active) + snappy ease-out so buttons feel responsive to touch.
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium',
        'transition duration-150 ease-snappy active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        // Visible keyboard focus (offset so it reads on the solid brand primary too).
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2',
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
        'inline-flex items-center justify-center rounded-lg p-2 text-slate-500 transition duration-150 ease-snappy hover:bg-slate-100 hover:text-slate-800 active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
        className,
      )}
      {...props}
    />
  )
}

const TONES = {
  violet: 'bg-brand-50 text-brand-700 border-brand-200',
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
    <span className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600', className)} />
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
        <div className={cx('h-full rounded-full transition-[width] duration-300 ease-snappy', color)} style={{ width: `${value}%` }} />
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
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100'

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
    <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700', className)}>
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
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
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
            'shrink-0 px-4 py-2.5 text-sm font-medium transition-colors duration-150 ease-snappy',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 rounded-t-lg',
            active === t.id
              ? 'border-b-2 border-brand-600 text-slate-900'
              : 'text-slate-400 hover:text-slate-700',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

const MODAL_SIZES = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  doc: 'max-w-[900px]',  // near-A4 width for document previews
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const dialogRef = useRef(null)
  const titleId = useId()
  // Keep the latest onClose in a ref so the focus effect can depend on `open` ALONE. If it
  // depended on `onClose` (which callers usually pass as a fresh closure each render), every
  // parent re-render — e.g. typing in an input inside the modal — would re-run this effect and
  // yank focus back to the first focusable element after a single character.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement

    const focusable = () =>
      dialog
        ? Array.from(
            dialog.querySelectorAll(
              'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null)
        : []

    // Move focus into the dialog on open so keyboard/screen-reader users land inside it.
    // Respect an explicit [autofocus] field (e.g. a confirm-by-typing input) when present.
    ;(dialog?.querySelector('[autofocus]') || focusable()[0] || dialog)?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') { onCloseRef.current?.(); return }
      if (e.key !== 'Tab') return
      // Trap Tab within the dialog.
      const items = focusable()
      if (!items.length) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }

    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      // Return focus to whatever opened the modal.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onClose read via ref on purpose
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`relative z-10 flex max-h-[92vh] w-full ${MODAL_SIZES[size] || MODAL_SIZES.md} flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xl focus:outline-none`}
      >
        <div className="mb-4 flex shrink-0 items-start gap-4">
          {title && <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>}
          <IconButton onClick={onClose} aria-label="Close dialog" className="-mt-1 -mr-1 ml-auto">
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="mt-5 flex shrink-0 flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}
