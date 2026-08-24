import { useMemo, useRef, useState } from 'react'
import { Handshake, Building2, CheckCircle2, Loader2, Check } from 'lucide-react'
import { api } from '../api'
import { cx } from '../ui'
import { PARTNER_CATEGORIES, coreFields, fieldsForKind } from '../partnerFields'

const labelCx = 'block text-xs font-semibold text-slate-600 mb-1'
const inputCx = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100'

function Label({ children, required }) {
  return <label className={labelCx}>{children}{required && <span className="text-rose-500"> *</span>}</label>
}

// Google-Forms-style multi-select: toggleable option chips + an "Other" chip that reveals a
// free-text box. The typed "Other" text is merged into the field's comma-joined value.
const chipCx = (on) => cx('inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
  on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')

function MultiChips({ options, value, onChange, other, otherOn, onOtherToggle, otherValue, onOther }) {
  const toggle = (o) => {
    const set = new Set(value || [])
    if (set.has(o)) set.delete(o); else set.add(o)
    onChange([...set])
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = (value || []).includes(o)
          return (
            <button type="button" key={o} onClick={() => toggle(o)} className={chipCx(on)}>
              {on && <Check className="h-3 w-3" />} {o}
            </button>
          )
        })}
        {other && (
          <button type="button" onClick={() => onOtherToggle(!otherOn)} className={chipCx(otherOn)}>
            {otherOn && <Check className="h-3 w-3" />} Other…
          </button>
        )}
      </div>
      {other && otherOn && (
        <input autoFocus className={cx(inputCx, 'mt-2')} placeholder="Please specify…" value={otherValue || ''} onChange={(e) => onOther(e.target.value)} />
      )}
    </div>
  )
}

const EMPTY_CORE = { organization: '', website: '', country: '', city: '', contact_name: '', designation: '', phone: '', email: '' }

export default function PartnerIntake() {
  const [cat, setCat] = useState(PARTNER_CATEGORIES[0]) // {value,label,kind,blurb}
  const [core, setCore] = useState({ ...EMPTY_CORE })
  const [text, setText] = useState({})   // detail text/textarea/radio values, keyed by details-key
  const [multi, setMulti] = useState({}) // detail multi selections, keyed by details-key -> string[]
  const [other, setOther] = useState({}) // "Other" free text for multi fields
  const [otherOn, setOtherOn] = useState({}) // whether the "Other" chip is selected, per field
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const errRef = useRef(null)

  const setCoreField = (k) => (e) => setCore((s) => ({ ...s, [k]: e.target.value }))
  const setText_ = (k) => (v) => setText((s) => ({ ...s, [k]: v }))
  const catFields = useMemo(() => fieldsForKind(cat.kind), [cat])
  const coreDefs = useMemo(() => coreFields(cat.kind), [cat])

  function pickCat(c) {
    setCat(c)
    setText({}); setMulti({}); setOther({}); setOtherOn({}) // detail fields differ by category
  }

  // A multi field's combined value: selected chips + the "Other" free text (when the Other chip
  // is on), comma-joined.
  const multiValue = (key) => {
    const sel = multi[key] || []
    const o = otherOn[key] ? (other[key] || '').trim() : ''
    return [...sel, ...(o ? [o] : [])].join(', ')
  }
  const hasValue = (f) => (f.type === 'multi'
    ? ((multi[f.key]?.length || 0) > 0 || (otherOn[f.key] && (other[f.key] || '').trim()))
    : (text[f.key] || '').trim())

  function buildDetails() {
    const d = {}
    for (const f of catFields) {
      const v = f.type === 'multi' ? multiValue(f.key) : (text[f.key] || '').trim()
      if (v) d[f.key] = v
    }
    return d
  }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    const missing = []
    for (const f of coreDefs) if (f.required && !core[f.name].trim()) missing.push(f.label)
    for (const f of catFields) if (f.required && !hasValue(f)) missing.push(f.label)
    if (!notes.trim()) missing.push('Additional information')
    if (missing.length) {
      setErr(`Please complete: ${missing.join(', ')}.`)
      errRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setBusy(true)
    try {
      await api.submitPartnerIntake({ category: cat.value, ...core, notes, details: buildDetails() })
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e2) { setErr(e2.message || 'Something went wrong. Please try again.') } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Thank you!</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your details have been received. Our team will review and reach out about collaboration opportunities.
          </p>
          <button
            onClick={() => { setDone(false); setCore({ ...EMPTY_CORE }); setText({}); setMulti({}); setOther({}); setOtherOn({}); setNotes('') }}
            className="mt-6 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Submit another response
          </button>
        </div>
      </div>
    )
  }

  const renderDetail = (f) => {
    if (f.type === 'multi') {
      return <MultiChips options={f.options} value={multi[f.key]} onChange={(arr) => setMulti((s) => ({ ...s, [f.key]: arr }))}
        other={f.other} otherOn={!!otherOn[f.key]} onOtherToggle={(v) => setOtherOn((s) => ({ ...s, [f.key]: v }))}
        otherValue={other[f.key]} onOther={(v) => setOther((s) => ({ ...s, [f.key]: v }))} />
    }
    if (f.type === 'radio') {
      return (
        <div className="flex gap-2">
          {f.options.map((o) => {
            const on = (text[f.key] || '') === o
            return (
              <button type="button" key={o} onClick={() => setText_(f.key)(o)}
                className={cx('rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors',
                  on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}>
                {o}
              </button>
            )
          })}
        </div>
      )
    }
    if (f.type === 'textarea') {
      return <textarea rows={2} className={inputCx} value={text[f.key] || ''} onChange={(e) => setText_(f.key)(e.target.value)} placeholder={f.placeholder} />
    }
    return <input className={inputCx} value={text[f.key] || ''} onChange={(e) => setText_(f.key)(e.target.value)} placeholder={f.placeholder} />
  }

  const fullWidth = (f) => f.type === 'multi' || f.type === 'textarea'

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Brand header */}
      <div className="bg-gradient-to-r from-brand-600 to-fuchsia-600 px-4 py-8 text-white">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-lg font-black ring-1 ring-inset ring-white/25">EZ</div>
            <span className="text-sm font-semibold tracking-wide text-white/90">EZ · Hiring & Placement</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Hiring & Placement Collaboration Form</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/80">
            Partner with EZ. Tell us about your organization and we'll get in touch about hiring & placement collaboration.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        {/* Category picker */}
        <div>
          <Label required>I am a…</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {PARTNER_CATEGORIES.map((c) => {
              const active = c.kind === cat.kind
              const Icon = c.kind === 'vendor' ? Handshake : Building2
              return (
                <button type="button" key={c.kind} onClick={() => pickCat(c)}
                  className={cx('flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                    active ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-slate-200 bg-white hover:border-slate-300')}>
                  <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}><Icon className="h-4 w-4" /></div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{c.label}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{c.blurb}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Core: organization + contact */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-bold text-slate-800">{cat.kind === 'vendor' ? 'Organization' : 'Institute'} & contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {coreDefs.map((f) => (
              <div key={f.name} className={f.full ? 'sm:col-span-2' : ''}>
                <Label required={f.required}>{f.label}</Label>
                <input type={f.type === 'email' ? 'email' : 'text'} className={inputCx} value={core[f.name]} onChange={setCoreField(f.name)} placeholder={f.placeholder} />
              </div>
            ))}
          </div>
        </div>

        {/* Category-specific details */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-bold text-slate-800">{cat.kind === 'vendor' ? 'Recruitment details' : 'Placement details'}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {catFields.map((f) => (
              <div key={f.key} className={fullWidth(f) ? 'sm:col-span-2' : ''}>
                <Label required={f.required}>{f.label}</Label>
                {renderDetail(f)}
              </div>
            ))}
          </div>
        </div>

        {/* Notes (required per the form) */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <Label required>Any additional information or terms you'd like to share</Label>
          <textarea rows={3} className={inputCx} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {err && <div ref={errRef} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">Fields marked <span className="text-rose-500">*</span> are required.</p>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit
          </button>
        </div>
      </form>
    </div>
  )
}
