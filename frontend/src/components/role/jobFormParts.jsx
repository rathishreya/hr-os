import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import { Button, Field, Spinner, inputClass, cx } from '../../ui'
import { CURRENCIES, DEPARTMENT_SEEDS, LOCATION_SEEDS, INTERVIEW_TYPES } from '../../constants'
import { api } from '../../api'

// Shared field components for the create + edit job forms (single source of truth).

let _qSeq = 0
export const newQuestionId = () => `q_${Date.now().toString(36)}_${_qSeq++}`

// Distinct option list for Department / Location dropdowns. Sourced from existing roles
// (so the org's own values surface) merged with a small canonical seed set, de-duped
// case-insensitively. Used to back a creatable combobox (free text still allowed).
export function useFieldOptions(kind) {
  const [roles, setRoles] = useState([])
  useEffect(() => { api.listRoles().then(setRoles).catch(() => setRoles([])) }, [])
  return useMemo(() => {
    const seeds = kind === 'department' ? DEPARTMENT_SEEDS : LOCATION_SEEDS
    const fromRoles = roles.map((r) => (kind === 'department' ? r.department : r.location)).filter(Boolean)
    const seen = new Set()
    const out = []
    for (const v of [...fromRoles, ...seeds]) {
      const k = String(v).trim().toLowerCase()
      if (k && !seen.has(k)) { seen.add(k); out.push(String(v).trim()) }
    }
    return out.sort((a, b) => a.localeCompare(b))
  }, [roles, kind])
}

// A creatable combobox: a plain text input backed by a <datalist> of known options. The user
// can pick a known value OR type a brand-new one (free-text add), so departments/locations stay
// editable without a separate Settings master-list table.
export function ComboField({ label, hint, value, onChange, options, placeholder, required, listId }) {
  return (
    <Field label={label} hint={hint}>
      <input
        className={inputClass}
        list={listId}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </Field>
  )
}

// ── Budget / CTC composite: currency prefix + min/max amount (grouped thousands) + unit ──
// Serializes to the single free-text budget_ctc string the backend already parses, e.g.
// "INR 20-28 LPA" or "USD 90,000-1,20,000 per year". Parsing back is best-effort for editing.
const DEFAULT_UNIT = 'LPA'
const BUDGET_UNITS = ['LPA', 'per month', 'per year']

function groupThousands(raw) {
  // Keep only digits, then group in the Indian style the rest of the app uses (en-IN).
  const digits = String(raw).replace(/[^\d]/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-IN')
}

export function parseBudgetCtc(str) {
  const s = String(str || '').trim()
  const cur = CURRENCIES.find((c) => new RegExp(`(^|\\b)(${c.code}|\\${c.symbol})`, 'i').test(s))
  const unit = BUDGET_UNITS.find((u) => s.toLowerCase().includes(u.toLowerCase())) || DEFAULT_UNIT
  const nums = s.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || []
  return {
    currency: cur?.code || 'INR',
    min: nums[0] || '',
    max: nums[1] || '',
    unit,
  }
}

export function composeBudgetCtc({ currency, min, max, unit }) {
  const lo = String(min).replace(/[^\d]/g, '')
  const hi = String(max).replace(/[^\d]/g, '')
  if (!lo && !hi) return ''
  const amount = lo && hi && lo !== hi
    ? `${groupThousands(lo)}-${groupThousands(hi)}`
    : groupThousands(lo || hi)
  return `${currency} ${amount} ${unit}`.replace(/\s+/g, ' ').trim()
}

export function BudgetCtcField({ value, onChange, label = 'Budget / CTC', hint = 'Shown to candidates as the salary range' }) {
  const parsed = useMemo(() => parseBudgetCtc(value), [value])
  const emit = (patch) => onChange(composeBudgetCtc({ ...parsed, ...patch }))
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-stretch gap-1.5">
        <select
          className={`${inputClass} w-20 shrink-0`}
          value={parsed.currency}
          onChange={(e) => emit({ currency: e.target.value })}
          aria-label="Currency"
        >
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
        </select>
        <input
          className={inputClass}
          inputMode="numeric"
          value={parsed.min ? groupThousands(parsed.min) : ''}
          onChange={(e) => emit({ min: e.target.value })}
          placeholder="Min"
          aria-label="Minimum"
        />
        <span className="self-center text-slate-400">–</span>
        <input
          className={inputClass}
          inputMode="numeric"
          value={parsed.max ? groupThousands(parsed.max) : ''}
          onChange={(e) => emit({ max: e.target.value })}
          placeholder="Max"
          aria-label="Maximum"
        />
        <select
          className={`${inputClass} w-28 shrink-0`}
          value={parsed.unit}
          onChange={(e) => emit({ unit: e.target.value })}
          aria-label="Unit"
        >
          {BUDGET_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
    </Field>
  )
}

// Union two skill lists, case-insensitively de-duped, preserving order.
export function mergeSkills(a, b) {
  const seen = new Set()
  const out = []
  for (const s of [...(a || []), ...(b || [])]) {
    const k = String(s).trim().toLowerCase()
    if (k && !seen.has(k)) { seen.add(k); out.push(String(s).trim()) }
  }
  return out
}

// Team dropdown options mapped from Settings → Users & roles (role-filtered, falls back to all).
export function useTeamOptions() {
  const [users, setUsers] = useState([])
  useEffect(() => { api.listUsers().then(setUsers).catch(() => setUsers([])) }, [])
  return useMemo(() => {
    const active = users.filter((u) => u.active !== false)
    const opt = (u) => ({ value: u.name || u.email, label: u.title ? `${u.name || u.email} · ${u.title}` : (u.name || u.email) })
    const pick = (roles) => {
      const want = new Set(roles)
      const matched = active.filter((u) => (u.roles || []).some((r) => want.has(r)))
      return (matched.length ? matched : active).map(opt)
    }
    return { hm: pick(['manager', 'admin']), rec: pick(['recruiter']), panel: pick(['panellist']) }
  }, [users])
}

// Editable checklist of skill chips: suggested + custom, each toggleable, with an add box.
export function SkillChecklist({ label, hint, selected, setSelected, suggestions, loading, accent = 'violet', emptyHint }) {
  const [draft, setDraft] = useState('')
  const norm = (s) => String(s).trim().toLowerCase()
  const has = (s) => selected.some((x) => norm(x) === norm(s))
  const toggle = (s) => setSelected(has(s) ? selected.filter((x) => norm(x) !== norm(s)) : [...selected, s])
  const add = () => {
    const v = draft.trim()
    if (v && !has(v)) setSelected([...selected, v])
    setDraft('')
  }
  const chips = mergeSkills(selected, suggestions)
  const onColor = accent === 'amber'
    ? 'border-amber-300 bg-amber-100 text-amber-800'
    : 'border-brand-300 bg-brand-100 text-brand-800'
  return (
    <Field label={label} hint={hint}>
      <div className="rounded-lg border border-slate-200 bg-white p-2">
        {loading && chips.length === 0 ? (
          <div className="flex items-center gap-2 px-1 py-1.5 text-xs text-slate-400"><Spinner /> Suggesting skills…</div>
        ) : chips.length === 0 ? (
          <p className="px-1 py-1.5 text-xs text-slate-400">{emptyHint || 'Add a skill below.'}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((s) => {
              const on = has(s)
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(s)}
                  aria-pressed={on}
                  className={cx(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition duration-150 ease-snappy active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
                    on ? onColor : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300',
                  )}
                >
                  <span className={cx('flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border', on ? 'border-current' : 'border-slate-300')}>
                    {on && <Check className="h-2.5 w-2.5" />}
                  </span>
                  {s}
                </button>
              )
            })}
          </div>
        )}
        <div className="mt-2 flex gap-1.5">
          <input
            className={`${inputClass} h-8 text-xs`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder="Add a skill…"
          />
          <Button type="button" variant="ghost" className="h-8 shrink-0 px-2.5 text-xs" onClick={add}>Add</Button>
        </div>
      </div>
    </Field>
  )
}

// Builder for the extra questions shown on the public application form.
export function ApplicationQuestionsBuilder({ questions, setQuestions }) {
  const add = () => setQuestions([...questions, { id: newQuestionId(), label: '', type: 'textarea', required: false }])
  const update = (i, patch) => setQuestions(questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  const remove = (i) => setQuestions(questions.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-2">
      {questions.length === 0 && (
        <p className="text-xs text-slate-400">No questions yet. Applicants will see these on the public application form.</p>
      )}
      {questions.map((q, i) => (
        <div key={q.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
          <input
            className={`${inputClass} h-9 min-w-[180px] flex-1`}
            value={q.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="e.g. Describe a system you scaled to 1M users"
          />
          <select className={`${inputClass} h-9 w-32`} value={q.type} onChange={(e) => update(i, { type: e.target.value })}>
            <option value="textarea">Long answer</option>
            <option value="text">Short answer</option>
          </select>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={!!q.required} onChange={(e) => update(i, { required: e.target.checked })} />
            Required
          </label>
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label="Remove question"
            className="rounded-lg p-2 text-slate-400 transition-colors duration-150 ease-snappy hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="ghost" className="text-xs" onClick={add}><Plus className="h-3.5 w-3.5" /> Add question</Button>
    </div>
  )
}

// Toggleable chips to choose the interview rounds this job runs.
export function InterviewTypesPicker({ selected, setSelected }) {
  const toggle = (v) => setSelected(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  return (
    <div className="flex flex-wrap gap-1.5">
      {INTERVIEW_TYPES.map((t) => {
        const on = selected.includes(t.value)
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => toggle(t.value)}
            aria-pressed={on}
            className={cx(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition duration-150 ease-snappy active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
              on ? 'border-brand-300 bg-brand-100 text-brand-800' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300',
            )}
          >
            <span className={cx('flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border', on ? 'border-current' : 'border-slate-300')}>
              {on && <Check className="h-2.5 w-2.5" />}
            </span>
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
