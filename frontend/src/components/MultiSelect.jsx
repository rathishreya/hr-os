import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { inputClass } from '../ui'

// A compact multiselect dropdown (closed shows a summary, opens to a checkbox list).
// options: [{ value, label }] · value: array of selected values.
export default function MultiSelect({ options = [], value = [], onChange, placeholder = 'Select…', allLabel, disabled = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  const selected = options.filter((o) => value.includes(o.value))
  const label = selected.length === 0 ? placeholder
    : (allLabel && selected.length === options.length) ? allLabel
    : selected.length <= 2 ? selected.map((o) => o.label).join(', ')
    : `${selected.length} selected`

  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} className={`${inputClass} flex items-center justify-between gap-2 text-left disabled:opacity-60`}>
        <span className={`truncate ${selected.length ? 'text-slate-800' : 'text-slate-400'}`}>{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && !disabled && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {options.length === 0 && <div className="px-3 py-2.5 text-sm text-slate-400">No options</div>}
          {options.map((o) => {
            const on = value.includes(o.value)
            return (
              <button key={o.value} type="button" onClick={() => toggle(o.value)} className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 ${on ? 'bg-violet-50/60' : ''}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300'}`}>{on && <Check className="h-3.5 w-3.5" />}</span>
                <span className="text-slate-700">{o.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
