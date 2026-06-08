import { useMemo, useState } from 'react'
import { cx } from '../ui'
import { ColumnFilter, distinctValues } from './tableFilters'

// Per-column faceted filtering: pass `filterable` to turn it on. Every column then gets a funnel
// icon in its header that opens a searchable check/uncheck dropdown of that column's values.
// Opt a column out with `filter: false`. The value used is `filterValue(row)` → `sortValue(row)`
// → `row[key]`, so custom-rendered cells still filter on real data.
const filterAccessor = (col) => col.filterValue || col.sortValue || ((r) => r[col.key])

export function DataTable({
  columns,
  rows,
  onRowClick,
  emptyMessage = 'No rows',
  getRowKey = (r) => r.id,
  pageSize: defaultPageSize = 25,
  pageSizes = [25, 50, 100],
  stickyHeader = true,
  maxHeight = 'calc(100vh - 320px)',
  compact = false,
  sortable = true,
  filterable = false,
  defaultSort = { key: null, dir: 'asc' },
}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [sort, setSort] = useState(defaultSort)
  const [filters, setFilters] = useState({}) // { [key]: excluded values[] }

  const filterEnabled = (col) => filterable && col.filter !== false && (col.key || col.filterValue || col.sortValue)

  // Distinct value lists per filterable column, derived from all rows so options stay stable.
  const distinctByCol = useMemo(() => {
    const map = {}
    for (const col of columns) {
      if (filterEnabled(col)) map[col.key] = distinctValues(rows, filterAccessor(col))
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, filterable])

  const filtered = useMemo(() => {
    const sets = Object.entries(filters)
      .map(([key, arr]) => {
        const col = columns.find((c) => c.key === key)
        return col ? [filterAccessor(col), new Set(arr)] : null
      })
      .filter(Boolean)
    if (!sets.length) return rows
    return rows.filter((r) => sets.every(([acc, ex]) => !ex.has(String(acc(r) ?? ''))))
  }, [rows, filters, columns])

  const sorted = useMemo(() => {
    if (!sort.key || !sortable) return filtered
    const col = columns.find((c) => c.key === sort.key)
    const getVal = col?.sortValue || ((r) => r[sort.key])
    return [...filtered].sort((a, b) => {
      const av = getVal(a)
      const bv = getVal(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return sort.dir === 'asc' ? av - bv : bv - av
      return sort.dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [filtered, sort, columns, sortable])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const pageRows = sorted.slice(start, start + pageSize)
  const activeFilterCount = Object.keys(filters).length

  function toggleSort(key) {
    if (!sortable) return
    setSort((s) => {
      if (s.key !== key) return { key, dir: 'asc' }
      if (s.dir === 'asc') return { key, dir: 'desc' }
      return { key: null, dir: 'asc' }
    })
    setPage(1)
  }

  function setFilter(key, arr) {
    setFilters((f) => {
      const next = { ...f }
      if (!arr || arr.length === 0) delete next[key]
      else next[key] = arr
      return next
    })
    setPage(1)
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">
        {emptyMessage}
      </div>
    )
  }

  const cellPad = compact ? 'px-3 py-2' : 'px-4 py-3'
  const headPad = compact ? 'px-3 py-2' : 'px-4 py-3'

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div
        className={cx('overflow-auto', stickyHeader && 'relative')}
        style={stickyHeader ? { maxHeight } : undefined}
      >
        <table className="w-full min-w-[960px] border-collapse text-left text-sm">
          <thead className={cx(stickyHeader && 'sticky top-0 z-10 bg-slate-50 shadow-sm')}>
            <tr className="border-b border-slate-200">
              {columns.map((col) => {
                const isSortable = sortable && col.sortable !== false
                const sortDir = sort.key === col.key ? sort.dir : null
                const canFilter = filterEnabled(col)
                return (
                  <th
                    key={col.key}
                    aria-sort={isSortable ? (sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none') : undefined}
                    className={cx(
                      headPad,
                      'text-xs font-semibold uppercase tracking-wide text-slate-500',
                      col.className,
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {isSortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 select-none transition-colors duration-150 ease-snappy hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                        >
                          {col.label}
                          <span aria-hidden="true" className={cx('text-brand-600 transition-opacity duration-150', sortDir ? 'opacity-100' : 'opacity-0')}>
                            {sortDir === 'desc' ? '↓' : '↑'}
                          </span>
                        </button>
                      ) : (
                        <span>{col.label}</span>
                      )}
                      {canFilter && (
                        <ColumnFilter
                          label={typeof col.label === 'string' ? col.label : col.key}
                          values={distinctByCol[col.key] || []}
                          excluded={filters[col.key] || []}
                          onChange={(arr) => setFilter(col.key, arr)}
                        />
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.map((row, i) => (
              <tr
                key={getRowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cx('transition-colors duration-150 ease-snappy', onRowClick && 'cursor-pointer hover:bg-brand-50/50')}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cx(cellPad, 'align-middle', col.className)}>
                    {col.render ? col.render(row, start + i) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
            {!sorted.length && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-400">
                  No rows match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs text-slate-600">
        <span className="flex items-center gap-2">
          <span>
            Showing <strong>{sorted.length ? start + 1 : 0}–{Math.min(start + pageSize, sorted.length)}</strong> of <strong>{sorted.length}</strong>
            {activeFilterCount > 0 && <span className="text-slate-400"> (filtered from {rows.length})</span>}
          </span>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => { setFilters({}); setPage(1) }}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-600 transition-colors duration-150 ease-snappy hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              Clear filters
            </button>
          )}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            Rows
            <select
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
            >
              {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 transition-[background-color,transform] duration-150 ease-snappy hover:bg-slate-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-40 disabled:active:scale-100"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="px-2 tabular-nums">Page {safePage} / {totalPages}</span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 transition-[background-color,transform] duration-150 ease-snappy hover:bg-slate-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-40 disabled:active:scale-100"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function LiveDot({ live = false, tone = 'violet' }) {
  const color = { violet: 'bg-brand-500', green: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500' }[tone]
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {live && <span className={cx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', color)} />}
      <span className={cx('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  )
}
