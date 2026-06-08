import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Filter } from 'lucide-react'
import { cx } from '../ui'

// Excel-style faceted per-column filtering for tables. State per column is the array of EXCLUDED
// values (absent/empty = everything shown). A row passes when its value isn't excluded. This model
// is robust to rows changing: brand-new values aren't excluded, so they show by default.

// Distinct, sorted string values for a column — populates a column's filter dropdown.
export function distinctValues(rows, accessor) {
  const set = new Set()
  for (const r of rows || []) {
    const v = accessor(r)
    set.add(v == null ? '' : String(v))
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

export function useColumnFilters() {
  const [filters, setFilters] = useState({})

  const setFilter = (key, excludedArr) =>
    setFilters((f) => {
      const next = { ...f }
      if (!excludedArr || excludedArr.length === 0) delete next[key]
      else next[key] = excludedArr
      return next
    })

  const clear = () => setFilters({})
  const active = Object.keys(filters).length

  function apply(rows, accessors) {
    const sets = Object.entries(filters)
      .map(([k, arr]) => [accessors[k], new Set(arr)])
      .filter(([acc]) => acc)
    if (!sets.length) return rows
    return rows.filter((r) => sets.every(([acc, ex]) => !ex.has(String(acc(r) ?? ''))))
  }

  return { filters, setFilter, clear, active, apply }
}

// A funnel icon that opens a searchable check/uncheck dropdown of a column's values.
// Rendered in a portal with fixed positioning so it never gets clipped by a table's overflow.
export function ColumnFilter({ label, values, excluded, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const [pos, setPos] = useState(null)
  const excludedSet = useMemo(() => new Set(excluded || []), [excluded])
  const active = (excluded?.length || 0) > 0

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const W = 240
    const left = Math.min(Math.max(8, r.left), window.innerWidth - W - 8)
    const top = Math.min(r.bottom + 6, window.innerHeight - 300)
    setPos({ top, left, width: W })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true) // capture: catches inner table scrollers
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
    if (!n) return values
    return values.filter((v) => (v === '' ? '(blank)' : v).toLowerCase().includes(n))
  }, [values, q])

  const toggle = (v) => {
    const next = new Set(excludedSet)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onChange([...next])
  }
  // Bulk actions respect the current search: act on the visible subset only (Excel behaviour).
  const checkVisible = () => {
    const next = new Set(excludedSet)
    shown.forEach((v) => next.delete(v))
    onChange([...next])
  }
  const uncheckVisible = () => {
    const next = new Set(excludedSet)
    shown.forEach((v) => next.add(v))
    onChange([...next])
  }
  const checkedCount = values.length - excludedSet.size

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`Filter ${label || ''}`}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setQ(''); setOpen((o) => !o) }}
        className={cx(
          'relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
          active ? 'text-brand-600' : 'text-slate-300 hover:text-slate-500',
        )}
      >
        <Filter className="h-3.5 w-3.5" />
        {active && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-brand-500" />}
      </button>
      {open && pos && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="z-[120] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl menu-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-slate-100 p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search values…"
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-1.5 text-xs">
            <button type="button" onClick={checkVisible} className="font-medium text-brand-600 hover:underline">Select all</button>
            <button type="button" onClick={uncheckVisible} className="font-medium text-slate-500 hover:underline">Clear</button>
            <span className="ml-auto tabular-nums text-slate-400">{checkedCount}/{values.length}</span>
          </div>
          <ul className="max-h-56 overflow-auto p-1">
            {shown.length === 0 && <li className="px-2 py-2 text-xs text-slate-400">No matches</li>}
            {shown.map((v) => (
              <li key={v}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={!excludedSet.has(v)}
                    onChange={() => toggle(v)}
                    className="cursor-pointer accent-brand-600"
                  />
                  <span className="truncate" title={v === '' ? '(blank)' : v}>{v === '' ? '(blank)' : v}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </>
  )
}
