// The onboarding form a candidate fills in after accepting an offer. Public: it renders outside
// the app shell and nobody signs in to reach it.
//
// Two ways in, both landing here:
//   /onboarding-form/:candidateId?t=…   the signed link sent with an offer letter. Arrives knowing
//                                       who it is for, so the first fields are already filled.
//   /onboarding-form                    the generic link, for somebody not in the system yet.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, FileUp, Loader2, Paperclip, X } from 'lucide-react'
import { api } from '../api'
import {
  SECTIONS, VARIANTS, fieldsFor, isFile, isRequired, labelFor, validate, MAX_FILE_BYTES,
} from '../onboardingFields'

const inputCx = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100'
const badCx = 'border-rose-400 focus:border-rose-400 focus:ring-rose-100'
const labelCx = 'block text-sm font-medium text-slate-800'

const fmtSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)

/** One field, drawn from its definition. */
function Field({ field, variant, value, file, error, onChange, onFile }) {
  const label = labelFor(field, variant)
  const req = isRequired(field, value?.__all || {})
  const id = `f-${field.key}`
  const cx = (extra) => `${inputCx} ${error ? badCx : ''} ${extra || ''}`

  return (
    <div className={field.type === 'textarea' || field.type === 'file' ? 'sm:col-span-2' : ''}>
      <label htmlFor={id} className={labelCx}>
        {label} {req ? <span className="text-rose-600" aria-label="required">*</span>
          : <span className="font-normal text-slate-400">(optional)</span>}
      </label>
      {field.help && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{field.help}</p>}

      <div className="mt-1.5">
        {field.type === 'textarea' ? (
          <textarea id={id} rows={3} className={cx()} value={value?.v || ''} onChange={(e) => onChange(e.target.value)} />
        ) : field.type === 'select' ? (
          <select id={id} className={cx()} value={value?.v || ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">Choose…</option>
            {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : field.type === 'radio' ? (
          <div className="flex flex-wrap gap-2">
            {field.options.map((o) => (
              <button
                key={o} type="button" onClick={() => onChange(o)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors duration-150 ${
                  value?.v === o ? 'border-brand-500 bg-brand-50 font-medium text-brand-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
              >
                {o}
              </button>
            ))}
          </div>
        ) : field.type === 'file' ? (
          <FileInput id={id} field={field} file={file} onFile={onFile} bad={!!error} />
        ) : (
          <input
            id={id} type={field.type === 'date' ? 'date' : field.type === 'number' ? 'text' : field.type}
            className={cx()} value={value?.v || ''} onChange={(e) => onChange(e.target.value)}
            inputMode={field.type === 'tel' ? 'tel' : undefined}
          />
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 flex items-center gap-1 text-xs text-rose-700">
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />{error}
        </p>
      )}
    </div>
  )
}

function FileInput({ id, field, file, onFile, bad }) {
  const ref = useRef(null)
  return (
    <div className={`flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 ${
      bad ? 'border-rose-400 bg-rose-50/40' : file ? 'border-brand-300 bg-brand-50/40' : 'border-slate-300 bg-slate-50/60'}`}>
      <input
        ref={ref} id={id} type="file" accept={field.accept} className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] || null)}
      />
      {file ? (
        <>
          <Paperclip className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{file.name}</span>
          <span className="shrink-0 text-xs tabular-nums text-slate-500">{fmtSize(file.size)}</span>
          <button type="button" onClick={() => { onFile(null); if (ref.current) ref.current.value = '' }}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700" aria-label="Remove this file">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <FileUp className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <button type="button" onClick={() => ref.current?.click()}
            className="text-sm font-medium text-brand-700 hover:underline">Choose a file</button>
          <span className="text-xs text-slate-500">PDF or image, up to 5 MB</span>
        </>
      )}
    </div>
  )
}

export default function OnboardingForm() {
  const { candidateId } = useParams()
  const [search] = useSearchParams()
  const token = search.get('t') || ''

  const [variant, setVariant] = useState('individual')
  const [answers, setAnswers] = useState({})
  const [files, setFiles] = useState({})
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [linkErr, setLinkErr] = useState('')
  const [already, setAlready] = useState(false)

  // A signed link already knows who this is; fill in what we hold so they are not retyping it.
  useEffect(() => {
    if (!candidateId || !token) return
    api.onboardingPrefill(candidateId, token)
      .then((p) => {
        setAnswers((a) => ({ legal_name: p.legal_name || '', email: p.email || '', ...a }))
        setAlready(!!p.already_submitted)
      })
      .catch((e) => setLinkErr(e.message))
  }, [candidateId, token])

  const fields = useMemo(() => fieldsFor(variant), [variant])
  const bySection = useMemo(
    () => SECTIONS.map((s) => ({ ...s, fields: fields.filter((f) => f.section === s.id) }))
      .filter((s) => s.fields.length),
    [fields],
  )

  const setAnswer = (key, v) => setAnswers((a) => ({ ...a, [key]: v }))
  const setFile = (key, f) => setFiles((m) => {
    const next = { ...m }
    if (f) next[key] = f; else delete next[key]
    return next
  })

  async function submit(e) {
    e.preventDefault()
    const errs = validate(variant, answers, files)
    setErrors(errs)
    if (Object.keys(errs).length) {
      const first = document.getElementById(`f-${Object.keys(errs)[0]}`)
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setBusy(true)
    try {
      // Only the fields this respondent was actually shown, so a variant switch cannot smuggle
      // an answer to a question they were never asked.
      const payload = {}
      for (const f of fields) if (!isFile(f) && answers[f.key]) payload[f.key] = answers[f.key]
      const res = await api.submitOnboardingForm({ candidateId, token, variant, answers: payload, files })
      setDone(res)
    } catch (err) {
      setLinkErr(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-6 w-6 text-emerald-700" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">That’s everything, thank you.</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Your details are with the People team. Your reference is{' '}
            <span className="font-semibold tabular-nums text-slate-900">{done.reference}</span> — quote it
            if you need to get in touch. We will come back to you if anything is missing.
          </p>
        </div>
      </Shell>
    )
  }

  if (linkErr && !Object.keys(answers).length) {
    return (
      <Shell>
        <div className="text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">This link isn’t working</h1>
          <p className="mt-2 text-sm text-slate-600">{linkErr}</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell wide>
      <header className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome to EZ Lab</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          A few details before your first day, so payroll, your provident fund and your paperwork are
          ready when you arrive. It takes about ten minutes. Everything here is private to the People team.
        </p>
        {already && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            You have already sent this form once. Filling it in again will send a second copy.
          </p>
        )}
      </header>

      <form onSubmit={submit} className="mt-6 space-y-8">
        <fieldset>
          <legend className={labelCx}>Which of these are you?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {VARIANTS.map((v) => (
              <button
                key={v.value} type="button" onClick={() => { setVariant(v.value); setErrors({}) }}
                className={`rounded-xl border p-3 text-left transition-colors duration-150 ${
                  variant === v.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <span className={`block text-sm font-semibold ${variant === v.value ? 'text-brand-800' : 'text-slate-800'}`}>{v.label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{v.blurb}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {bySection.map((s) => (
          <section key={s.id}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-800">{s.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{s.blurb}</p>
            <div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
              {s.fields.map((f) => (
                <Field
                  key={f.key} field={f} variant={variant}
                  value={{ v: answers[f.key], __all: answers }}
                  file={files[f.key]} error={errors[f.key]}
                  onChange={(v) => setAnswer(f.key, v)}
                  onFile={(file) => {
                    if (file && file.size > MAX_FILE_BYTES) {
                      setErrors((e) => ({ ...e, [f.key]: 'That file is over 5 MB.' }))
                      return
                    }
                    setErrors((e) => { const n = { ...e }; delete n[f.key]; return n })
                    setFile(f.key, file)
                  }}
                />
              ))}
            </div>
          </section>
        ))}

        {linkErr && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{linkErr}
          </p>
        )}

        <div className="flex items-center gap-3 border-t border-slate-200 pt-5">
          <button
            type="submit" disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {busy ? 'Sending…' : 'Send my details'}
          </button>
          <p className="text-xs text-slate-500">Fields marked <span className="text-rose-600">*</span> are needed.</p>
        </div>
      </form>
    </Shell>
  )
}

function Shell({ children, wide }) {
  return (
    <div className="min-h-screen bg-[#f6f7fb] px-4 py-10">
      <div className={`mx-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        {children}
      </div>
    </div>
  )
}
