// The onboarding form a candidate fills in after accepting an offer. Public: it renders outside
// the app shell and nobody signs in to reach it.
//
//   /onboarding-form/:candidateId?t=…   the signed link sent with an offer letter. It arrives
//                                       knowing who it is for, so the first fields are filled and
//                                       nobody is asked to classify themselves — their paperwork
//                                       already said whether they are staff, freelance or a company.
//   /onboarding-form                    the generic link, for somebody not in the system yet. That
//                                       one has to ask, because there is nothing to read it from.
//
// Layout note: the label, then the control, then the help or the error. Help text between a label
// and its input is what made the first version look uneven — every field with a hint pushed its
// input a line lower than the field beside it, so nothing lined up across the row.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, FileUp, Loader2, Paperclip, X } from 'lucide-react'
import { api } from '../api'
import { DIAL_CODES, splitDial } from '../dialCodes'
import {
  SECTIONS, VARIANTS, fieldsFor, isFile, isRequired, labelFor, validate, MAX_FILE_BYTES,
} from '../onboardingFields'

// One control height and one focus treatment everywhere, so a row of mixed inputs reads as a row.
const CTRL = 'h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 outline-none transition-[border-color,box-shadow] duration-150 ease-snappy placeholder:text-slate-500'
const CTRL_OK = 'border-slate-300 hover:border-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12'
const CTRL_BAD = 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/12'
const ctrl = (bad) => `${CTRL} ${bad ? CTRL_BAD : CTRL_OK}`

const fmtSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)

function Hint({ error, help }) {
  if (error) {
    return (
      <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-rose-700">
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />{error}
      </p>
    )
  }
  return help ? <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{help}</p> : null
}

/** A phone number: the country code is chosen, never typed. */
function PhoneInput({ id, value, bad, onChange }) {
  const { code, number } = splitDial(value)
  const set = (c, n) => onChange(`${c} ${n}`.trim())
  return (
    <div className={`flex items-stretch overflow-hidden rounded-xl border transition-[border-color,box-shadow] duration-150 ease-snappy focus-within:ring-4 ${
      bad ? 'border-rose-400 focus-within:border-rose-500 focus-within:ring-rose-500/12'
        : 'border-slate-300 hover:border-slate-400 focus-within:border-brand-500 focus-within:ring-brand-500/12'}`}>
      {/* A native select is as wide as its widest option, so full country names here swallowed the
          whole row and left no room for the number. "IN +91" is short, still unmistakable, and
          typing the two letters jumps to it. */}
      <select
        aria-label="Country code" value={code} onChange={(e) => set(e.target.value, number)}
        className="h-11 w-[6.5rem] shrink-0 border-0 border-r border-slate-200 bg-slate-50 pl-3 pr-1 text-sm text-slate-700 outline-none"
      >
        {DIAL_CODES.map((d) => (
          <option key={d.iso} value={d.code} title={d.name}>{d.iso} {d.code}</option>
        ))}
      </select>
      <input
        id={id} type="tel" inputMode="tel" value={number} onChange={(e) => set(code, e.target.value)}
        placeholder="98765 43210"
        className="h-11 min-w-0 flex-1 border-0 bg-white px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-500"
      />
    </div>
  )
}

function FileInput({ id, field, file, bad, onFile }) {
  const ref = useRef(null)
  return (
    <div className={`flex h-11 items-center gap-2.5 rounded-xl border border-dashed px-3.5 transition-colors duration-150 ease-snappy ${
      bad ? 'border-rose-400 bg-rose-50/50'
        : file ? 'border-brand-400 bg-brand-50/50' : 'border-slate-300 bg-slate-50/70 hover:border-slate-400'}`}>
      <input ref={ref} id={id} type="file" accept={field.accept} className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] || null)} />
      {file ? (
        <>
          <Paperclip className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{file.name}</span>
          <span className="shrink-0 text-xs tabular-nums text-slate-500">{fmtSize(file.size)}</span>
          <button type="button" aria-label="Remove this file"
            onClick={() => { onFile(null); if (ref.current) ref.current.value = '' }}
            className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors duration-150 hover:bg-slate-200/70 hover:text-slate-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <FileUp className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <button type="button" onClick={() => ref.current?.click()}
            className="rounded text-sm font-medium text-brand-700 hover:underline">Choose a file</button>
          <span className="truncate text-xs text-slate-500">PDF or image, up to 5 MB</span>
        </>
      )}
    </div>
  )
}

function Field({ field, variant, answers, file, error, onChange, onFile }) {
  const label = labelFor(field, variant)
  const req = isRequired(field, answers)
  const id = `f-${field.key}`
  const value = answers[field.key] || ''
  const wide = field.type === 'textarea' || field.type === 'file'

  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-1.5 text-sm font-medium text-slate-800">
        <span>{label}</span>
        {req ? <span aria-hidden className="text-rose-600">*</span>
          : <span className="text-xs font-normal text-slate-500">optional</span>}
      </label>

      {field.type === 'textarea' ? (
        <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)}
          className={`${ctrl(!!error)} h-auto py-2.5 leading-relaxed`} />
      ) : field.type === 'select' ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={ctrl(!!error)}>
          <option value="">Choose…</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === 'radio' ? (
        <div className="flex flex-wrap gap-2">
          {field.options.map((o) => (
            <button key={o} type="button" onClick={() => onChange(o)}
              className={`h-11 rounded-xl border px-4 text-sm transition-colors duration-150 ease-snappy ${
                value === o ? 'border-brand-500 bg-brand-50 font-medium text-brand-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'}`}>
              {o}
            </button>
          ))}
        </div>
      ) : field.type === 'tel' ? (
        <PhoneInput id={id} value={value} bad={!!error} onChange={onChange} />
      ) : field.type === 'file' ? (
        <FileInput id={id} field={field} file={file} bad={!!error} onFile={onFile} />
      ) : (
        <input id={id} type={field.type === 'date' ? 'date' : field.type} value={value}
          onChange={(e) => onChange(e.target.value)} className={ctrl(!!error)} />
      )}

      <Hint error={error} help={field.help} />
    </div>
  )
}

export default function OnboardingForm() {
  const { candidateId } = useParams()
  const [search] = useSearchParams()
  const token = search.get('t') || ''
  const signed = !!(candidateId && token)

  const [variant, setVariant] = useState('individual')
  const [answers, setAnswers] = useState({})
  const [files, setFiles] = useState({})
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [failure, setFailure] = useState('')
  const [already, setAlready] = useState(false)
  const [ready, setReady] = useState(!signed)

  // A signed link already knows who this is, and what kind of engagement they are on.
  useEffect(() => {
    if (!signed) return
    api.onboardingPrefill(candidateId, token)
      .then((p) => {
        setAnswers((a) => ({ legal_name: p.legal_name || '', email: p.email || '', ...a }))
        if (p.variant) setVariant(p.variant)
        setAlready(!!p.already_submitted)
        setReady(true)
      })
      .catch((e) => { setFailure(e.message); setReady(true) })
  }, [signed, candidateId, token])

  const fields = useMemo(() => fieldsFor(variant), [variant])
  const bySection = useMemo(
    () => SECTIONS.map((s) => ({ ...s, fields: fields.filter((f) => f.section === s.id) }))
      .filter((s) => s.fields.length),
    [fields],
  )

  const answered = (f) => !!(isFile(f) ? files[f.key] : answers[f.key])
  const need = fields.filter((f) => isRequired(f, answers))
  const doneCount = need.filter(answered).length
  const pct = need.length ? Math.round((doneCount / need.length) * 100) : 0

  const setAnswer = (key, v) => setAnswers((a) => ({ ...a, [key]: v }))
  const clearErr = (key) => setErrors((e) => { const n = { ...e }; delete n[key]; return n })

  async function submit(e) {
    e.preventDefault()
    const errs = validate(variant, answers, files)
    setErrors(errs)
    if (Object.keys(errs).length) {
      document.getElementById(`f-${Object.keys(errs)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setBusy(true)
    try {
      const payload = {}
      for (const f of fields) if (!isFile(f) && answers[f.key]) payload[f.key] = answers[f.key]
      setDone(await api.submitOnboardingForm({
        candidateId: signed ? candidateId : null, token, variant, answers: payload, files,
      }))
    } catch (err) {
      setFailure(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="px-8 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100">
            <Check className="h-7 w-7 text-emerald-700" aria-hidden />
          </span>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-slate-900">That’s everything, thank you.</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
            Your details are with the People team. Your reference is{' '}
            <span className="font-semibold tabular-nums text-slate-900">{done.reference}</span> —
            quote it if you need to get in touch. We will come back to you if anything is missing.
          </p>
        </div>
      </Shell>
    )
  }

  if (!ready) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 px-8 py-20 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading your form…
        </div>
      </Shell>
    )
  }

  if (failure && signed && !Object.keys(answers).length) {
    return (
      <Shell>
        <div className="px-8 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
            <AlertTriangle className="h-7 w-7 text-amber-700" aria-hidden />
          </span>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-slate-900">This link isn’t working</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">{failure}</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <header className="bg-brand-700 px-6 py-8 text-white sm:px-9">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-200">EZ Lab · People team</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Before your first day</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-100">
          A few details so payroll, your provident fund and your paperwork are ready when you arrive.
          It takes about ten minutes, and everything here stays with the People team.
        </p>
      </header>

      {/* Progress sits below the band and stays visible: a 38-field form needs to show its end. */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur-sm sm:px-9">
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-snappy"
              style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-xs font-medium tabular-nums text-slate-600">
            {doneCount} of {need.length}
          </span>
        </div>
      </div>

      <div className="px-6 py-7 sm:px-9">
        {already && (
          <p className="mb-6 flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            You have already sent this form. If something needs correcting, reply to the People team
            rather than filling it in again.
          </p>
        )}

        <form onSubmit={submit} className="space-y-9">
          {/* Only the generic link has to ask. A signed one reads it off their paperwork. */}
          {!signed && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-800">Which of these are you?</legend>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {VARIANTS.map((v) => (
                  <button key={v.value} type="button"
                    onClick={() => { setVariant(v.value); setErrors({}) }}
                    className={`rounded-xl border p-3.5 text-left transition-colors duration-150 ease-snappy ${
                      variant === v.value ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:border-slate-400'}`}>
                    <span className={`block text-sm font-semibold ${variant === v.value ? 'text-brand-800' : 'text-slate-800'}`}>{v.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-500">{v.blurb}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {bySection.map((s, i) => (
            <section key={s.id}>
              <div className="mb-4 flex items-baseline gap-2.5 border-b border-slate-200 pb-2.5">
                <span className="text-xs font-semibold tabular-nums text-brand-600">{String(i + 1).padStart(2, '0')}</span>
                <h2 className="text-base font-semibold tracking-tight text-slate-900">{s.title}</h2>
              </div>
              <p className="-mt-2 mb-4 text-xs leading-relaxed text-slate-500">{s.blurb}</p>
              <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                {s.fields.map((f) => (
                  <Field
                    key={f.key} field={f} variant={variant} answers={answers}
                    file={files[f.key]} error={errors[f.key]}
                    onChange={(v) => { setAnswer(f.key, v); clearErr(f.key) }}
                    onFile={(file) => {
                      if (file && file.size > MAX_FILE_BYTES) {
                        setErrors((e) => ({ ...e, [f.key]: 'That file is over 5 MB.' }))
                        return
                      }
                      clearErr(f.key)
                      setFiles((m) => { const n = { ...m }; if (file) n[f.key] = file; else delete n[f.key]; return n })
                    }}
                  />
                ))}
              </div>
            </section>
          ))}

          {failure && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm leading-relaxed text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />{failure}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 pt-6">
            <button type="submit" disabled={busy}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition-[background-color,transform] duration-150 ease-snappy hover:bg-brand-700 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {busy ? 'Sending…' : 'Send my details'}
            </button>
            <p className="text-xs text-slate-500">
              Fields marked <span className="text-rose-600">*</span> are needed. Nothing is sent until you press the button.
            </p>
          </div>
        </form>
      </div>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-[#f6f7fb] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-12px_rgba(16,24,40,0.12)]">
        {children}
      </div>
    </div>
  )
}
