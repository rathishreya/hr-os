import { useMemo, useState } from 'react'
import { cx } from '../ui'

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
  defaultSort = { key: null, dir: 'asc' },
}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [sort, setSort] = useState(defaultSort)

  const sorted = useMemo(() => {
    if (!sort.key || !sortable) return rows
    const col = columns.find((c) => c.key === sort.key)
    const getVal = col?.sortValue || ((r) => r[sort.key])
    return [...rows].sort((a, b) => {
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
  }, [rows, sort, columns, sortable])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const pageRows = sorted.slice(start, start + pageSize)

  function toggleSort(key) {
    if (!sortable) return
    setSort((s) => {
      if (s.key !== key) return { key, dir: 'asc' }
      if (s.dir === 'asc') return { key, dir: 'desc' }
      return { key: null, dir: 'asc' }
    })
    setPage(1)
  }

  function changePageSize(n) {
    setPageSize(n)
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
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cx(
                    headPad,
                    'text-xs font-semibold uppercase tracking-wide text-slate-500',
                    col.className,
                    sortable && col.sortable !== false && 'cursor-pointer select-none hover:bg-slate-100',
                  )}
                  onClick={col.sortable !== false && sortable ? () => toggleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sort.key === col.key && (
                      <span className="text-violet-600">{sort.dir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.map((row, i) => (
              <tr
                key={getRowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cx('transition', onRowClick && 'cursor-pointer hover:bg-violet-50/50')}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cx(cellPad, 'align-middle', col.className)}>
                    {col.render ? col.render(row, start + i) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs text-slate-600">
        <span>
          Showing <strong>{start + 1}–{Math.min(start + pageSize, sorted.length)}</strong> of <strong>{sorted.length}</strong>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            Rows
            <select
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              value={pageSize}
              onChange={(e) => changePageSize(Number(e.target.value))}
            >
              {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="px-2 tabular-nums">Page {safePage} / {totalPages}</span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 disabled:opacity-40"
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
  const color = { violet: 'bg-violet-500', green: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500' }[tone]
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {live && <span className={cx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', color)} />}
      <span className={cx('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  )
}
