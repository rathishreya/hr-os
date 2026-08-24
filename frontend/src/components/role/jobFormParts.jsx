import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, Check, ChevronDown, Search } from 'lucide-react'
import { Button, Field, Spinner, inputClass, cx } from '../../ui'
import { CURRENCIES, DEPARTMENT_SEEDS, LOCATION_SEEDS, TEAM_SEEDS, INTERVIEW_TYPES } from '../../constants'
import { DESIGNATION_TITLES, DESIGNATION_BY_TITLE } from '../../designations'
import { api } from '../../api'

// Shared field components for the create + edit job forms (single source of truth).

let _qSeq = 0
export const newQuestionId = () => `q_${Date.now().toString(36)}_${_qSeq++}`

// Distinct option list for the Department / Location / Team dropdowns. Sourced from existing
// roles (so the org's own values surface) merged with a small canonical seed set, de-duped
// case-insensitively. Used to back a creatable combobox (free text still allowed).
const FIELD_SEEDS = { department: DEPARTMENT_SEEDS, location: LOCATION_SEEDS, team: TEAM_SEEDS }
export function useFieldOptions(kind) {
  const [roles, setRoles] = useState([])
  useEffect(() => { api.listRoles().then(setRoles).catch(() => setRoles([])) }, [])
  return useMemo(() => {
    const seeds = FIELD_SEEDS[kind] || []
    const fromRoles = roles.map((r) => r[kind]).filter(Boolean)
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

// Shared searchable dropdown used for ALL the "pick a value from a list" fields (Role, Department,
// Team, Location) so they look identical. Not a native <select> (which renders a long list that
// overflows the page): a button opens a contained, scrollable popover in a portal with a search
// box. When allowCustom is set, typing a value not on the list and choosing "Use …" (or Enter)
// sets it as a free-text value.
export function SearchSelect({ value, onChange, options, placeholder = 'Select…', searchPlaceholder = 'Search…', allowCustom = true, disabled = false }) {
  // Options may be plain strings or {value, label}. Normalize to objects so one component serves
  // every dropdown (roles, departments, teams, and small labeled enums like Priority/Work mode).
  const opts = useMemo(() => (options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o)), [options])
  const showSearch = opts.length > 7 // no search box for short lists — a search on 3 options is odd
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    // Clamp so the ~340px popover always fits in the viewport instead of spilling past the bottom.
    setPos({ top: Math.min(r.bottom + 4, window.innerHeight - 348), left: r.left, width: r.width })
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!popRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    // Close when the PAGE scrolls (the fixed popover would detach from its anchor), but NOT when the
    // user scrolls inside the popover's own list.
    const onScroll = (e) => { if (!popRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? opts.filter((o) => o.label.toLowerCase().includes(n)) : opts
  }, [q, opts])
  const exact = opts.some((o) => o.label.toLowerCase() === q.trim().toLowerCase())
  const current = opts.find((o) => o.value === value)
  const display = current ? current.label : value // a custom (free-text) value shows as-is

  const close = () => { setOpen(false); setQ('') }
  const pick = (o) => { onChange(o.value); close() }
  const pickCustom = () => { const v = q.trim(); if (v) onChange(v); close() }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (disabled) return; setQ(''); setOpen((o) => !o) }}
        className={cx(inputClass, 'flex items-center justify-between gap-2 text-left', disabled && 'cursor-not-allowed opacity-60')}
      >
        <span className={cx('truncate', display ? 'text-slate-800' : 'text-slate-400')}>{display || placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && pos && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="z-[120] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl menu-in"
        >
          {showSearch && (
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); if (shown.length) pick(shown[0]); else if (allowCustom) pickCustom() }
                    else if (e.key === 'Escape') { e.stopPropagation(); close() } // don't let a parent Modal also close
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-md border border-slate-200 bg-white py-1 pl-8 pr-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>
          )}
          <ul className="max-h-60 overflow-auto p-1">
            {shown.length === 0 && !q.trim() && <li className="px-2 py-2 text-xs text-slate-400">No options</li>}
            {shown.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => pick(o)}
                  className={cx('flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50',
                    o.value === value ? 'font-medium text-brand-700' : 'text-slate-700')}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                </button>
              </li>
            ))}
          </ul>
          {allowCustom && q.trim() && !exact && (
            <div className="border-t border-slate-100 p-1">
              <button type="button" onClick={pickCustom} className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm text-brand-700 hover:bg-brand-50">
                <Plus className="h-3.5 w-3.5" /> Use “{q.trim()}”
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

// Role/Designation picker: SearchSelect over the fixed EZ designation list. onChange(title, record)
// — record ({dept, team, autofill}) lets the parent auto-fill Department/Team when the title maps
// to exactly one of each.
export function DesignationSelect({ value, onChange, placeholder = 'Select a role…', allowCustom = true }) {
  return (
    <SearchSelect
      value={value}
      onChange={(t) => onChange(t, DESIGNATION_BY_TITLE[t])}
      options={DESIGNATION_TITLES}
      placeholder={placeholder}
      searchPlaceholder="Search roles…"
      allowCustom={allowCustom}
    />
  )
}

// ── Budget / CTC composite: currency prefix + min/max amount (grouped thousands) + unit ──
// Serializes to the single free-text budget_ctc string the backend already parses, e.g.
// "INR 20-28 LPA" or "USD 90,000-1,20,000 per year". Parsing back is best-effort for editing.
// Units are currency-aware: "LPA" (lakhs per annum) only makes sense for INR. Other currencies
// get plain per-year / per-month / "K / year" units so a USD/SGD range never reads "90 LPA".
// Per the product decision, only two units are OFFERED: per annum / per month.
const UNITS = ['per annum', 'per month']
const DEFAULT_UNIT = 'per annum'
// Legacy units ("… LPA", "… per year", "K / year") are still PARSED so editing an older job reads
// its amounts correctly; on save we always normalize to one of UNITS above.
const ALL_UNITS = [...new Set(['LPA', 'per year', 'K / year', ...UNITS])]
const unitsFor = () => UNITS

function groupThousands(raw) {
  // Keep only digits, then group in the Indian style the rest of the app uses (en-IN).
  const digits = String(raw).replace(/[^\d]/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('en-IN')
}

export function parseBudgetCtc(str) {
  const s = String(str || '').trim()
  const cur = CURRENCIES.find((c) => new RegExp(`(^|\\b)(${c.code}|\\${c.symbol})`, 'i').test(s))
  const currency = cur?.code || 'INR'
  // Detect any (incl. legacy) unit in the saved text, then normalize to an offered unit: anything
  // annual (LPA / per year / K per year / per annum) → "per annum"; monthly → "per month".
  const found = ALL_UNITS.find((u) => s.toLowerCase().includes(u.toLowerCase()))
  const unit = /per month/i.test(found || '') ? 'per month' : DEFAULT_UNIT
  const nums = s.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || []
  return {
    currency,
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
  const units = unitsFor(parsed.currency)
  const emit = (patch) => {
    const next = { ...parsed, ...patch }
    // Changing currency can invalidate the unit (e.g. "LPA" on a USD range) — snap it to the
    // currency's first valid unit so we never serialize "USD 90,000 LPA".
    if (patch.currency && !unitsFor(next.currency).includes(next.unit)) {
      next.unit = unitsFor(next.currency)[0]
    }
    onChange(composeBudgetCtc(next))
  }
  return (
    <Field label={label} hint={hint}>
      {/* min-w-0 on every flex child + flex-wrap keeps the row inside the form column instead of
          forcing a horizontal scrollbar; the amount inputs flex-grow, the selects stay compact. */}
      <div className="flex w-full min-w-0 flex-wrap items-stretch gap-1.5">
        <select
          className={`${inputClass} w-[5.5rem] shrink-0 px-2`}
          value={parsed.currency}
          onChange={(e) => emit({ currency: e.target.value })}
          aria-label="Currency"
        >
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
        </select>
        <input
          className={`${inputClass} min-w-0 flex-1 basis-16`}
          inputMode="numeric"
          value={parsed.min ? groupThousands(parsed.min) : ''}
          onChange={(e) => emit({ min: e.target.value })}
          placeholder="Min"
          aria-label="Minimum"
        />
        <span className="self-center text-slate-400">–</span>
        <input
          className={`${inputClass} min-w-0 flex-1 basis-16`}
          inputMode="numeric"
          value={parsed.max ? groupThousands(parsed.max) : ''}
          onChange={(e) => emit({ max: e.target.value })}
          placeholder="Max"
          aria-label="Maximum"
        />
        <select
          className={`${inputClass} w-[7rem] shrink-0 px-2`}
          value={parsed.unit}
          onChange={(e) => emit({ unit: e.target.value })}
          aria-label="Unit"
        >
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
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
