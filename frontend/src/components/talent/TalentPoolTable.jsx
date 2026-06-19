import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Pencil, Globe, Phone, Mail, MapPin, Download, Columns3, LayoutList, LayoutGrid, Sparkles,
} from 'lucide-react'
import { Badge, Button, Avatar, scoreTone, stageTone, cx } from '../../ui'
import { useTalentPoolColumns } from '../../hooks/useTalentPoolColumns'
import { useColumnFilters, ColumnFilter, distinctValues } from '../tableFilters'
import TalentPoolColumnSettings from './TalentPoolColumnSettings'
import { exportTalentPoolCsv } from '../../utils/exportCsv'

function ContactIcon({ href, title, icon: Icon, external }) {
  if (!href) {
    return (
      <span title="Not available" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-300">
        <Icon className="h-3.5 w-3.5" />
      </span>
    )
  }
  return (
    <a
      href={href}
      title={title}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition duration-150 ease-snappy hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-95"
    >
      <Icon className="h-3.5 w-3.5" />
    </a>
  )
}

// Talent-pool compensation values come from two paths: résumé-parsed figures already carry
// '₹…LPA' (backend _norm_money), but applicant-typed values pre-fix were stored raw ("12",
// "18 LPA"). Stamp a ₹/LPA label on any value that still lacks a currency token so the column
// is consistent (India-centric: single currency, INR ₹). Mirrors backend _norm_applicant_ctc.
const CTC_NUM_RE = /^\s*([\d,]+(?:\.\d+)?)\s*(lpa|lac|lakh|lakhs|cr|crore|l)?\s*$/i
export function fmtComp(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (/₹|\brs\b|\binr\b|\$|€|£/i.test(s)) return s
  const m = s.match(CTC_NUM_RE)
  if (!m) return s
  const val = Number(m[1].replace(/,/g, ''))
  if (!isFinite(val)) return s
  const unit = (m[2] || '').toLowerCase()
  if (unit === 'cr' || unit === 'crore') return `₹${val} Cr`
  if (unit) return `₹${val} LPA`
  if (val >= 100000) return `₹${val.toLocaleString('en-IN')}`
  return `₹${val} LPA`
}

function TwoLine({ primary, secondary }) {
  if (!primary && !secondary) return <span className="text-slate-300">—</span>
  return (
    <div className="min-w-0 max-w-[220px]">
      {primary && <div className="truncate text-sm font-medium text-slate-800">{primary}</div>}
      {secondary && <div className="truncate text-xs text-slate-500">{secondary}</div>}
    </div>
  )
}

const COL_WIDTH = {
  idx: 'w-12',
  edit: 'w-12',
  name: 'min-w-[200px]',
  contact: 'w-[120px]',
  role: 'min-w-[180px]',
  education: 'min-w-[180px]',
  comp: 'min-w-[150px]',
  exp: 'w-24',
  source: 'w-28',
  sub_source: 'w-28',
  location: 'min-w-[130px]',
  suggested_role: 'min-w-[160px]',
  pipeline: 'min-w-[140px]',
  added: 'w-32',
  applied_by: 'w-28',
}

// String accessors for per-column filtering (F9). Columns without an entry get no filter input.
const FILTER_ACCESSORS = {
  name: (r) => `${r.name || ''} ${r.email || ''}`,
  contact: (r) => `${r.email || ''} ${r.phone || ''} ${r.linkedin || ''}`,
  role: (r) => `${r.current_title || ''} ${r.current_company || ''}`,
  education: (r) => `${r.education_degree || ''} ${r.education_institution || ''}`,
  comp: (r) => `${r.current_ctc || ''} ${r.salary_expectation || ''}`,
  exp: (r) => (r.total_yoe != null ? String(r.total_yoe) : ''),
  source: (r) => r.source || '',
  sub_source: (r) => r.sub_source || '',
  location: (r) => r.location || '',
  suggested_role: (r) => r.suggested_role || '',
  pipeline: (r) => `${r.primary_stage || r.latest_stage || ''} ${r.primary_role || ''} ${r.primary_score ?? r.top_score ?? ''}`,
}

const SCORE_PILL = {
  green: 'bg-emerald-100 text-emerald-700',
  blue: 'bg-sky-100 text-sky-700',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
}
const STAGE_DOT = {
  gray: 'bg-slate-400', blue: 'bg-sky-500', violet: 'bg-brand-500',
  amber: 'bg-amber-500', green: 'bg-emerald-500', rose: 'bg-rose-500',
}

export default function TalentPoolTable({ rows, onRowClick, onEdit, selectable = false, selectedIds, onToggleSelect, onToggleAll }) {
  const { visible, updateVisible, resetVisible, activeColumns } = useTalentPoolColumns()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [density, setDensity] = useState('comfortable')
  const [sort, setSort] = useState({ key: 'added', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const cellPad = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3.5'
  const headPad = density === 'compact' ? 'px-3 py-2.5' : 'px-4 py-3'

  const filterCtl = useColumnFilters()
  const filtered = useMemo(
    () => filterCtl.apply(rows, FILTER_ACCESSORS),
    [rows, filterCtl.filters], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const distinct = useMemo(
    () => Object.fromEntries(Object.entries(FILTER_ACCESSORS).map(([k, acc]) => [k, distinctValues(rows, acc)])),
    [rows],
  )

  const sortFns = {
    name: (r) => (r.name || '').toLowerCase(),
    role: (r) => `${r.current_title || ''} ${r.current_company || ''}`.toLowerCase(),
    education: (r) => `${r.education_degree || ''} ${r.education_institution || ''}`.toLowerCase(),
    exp: (r) => Number(r.total_yoe) || 0,
    source: (r) => (r.source || '').toLowerCase(),
    sub_source: (r) => (r.sub_source || '').toLowerCase(),
    location: (r) => (r.location || '').toLowerCase(),
    suggested_role: (r) => (r.suggested_role || '').toLowerCase(),
    pipeline: (r) => (r.primary_score != null ? r.primary_score : r.top_score) || 0,
    added: (r) => new Date(r.created_at).getTime(),
  }

  const sorted = useMemo(() => {
    if (!sort.key || !sortFns[sort.key]) return filtered
    const fn = sortFns[sort.key]
    return [...filtered].sort((a, b) => {
      const av = fn(a)
      const bv = fn(b)
      if (typeof av === 'number' && typeof bv === 'number') {
        return sort.dir === 'asc' ? av - bv : bv - av
      }
      return sort.dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [filtered, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const pageRows = sorted.slice(start, start + pageSize)

  function toggleSort(key) {
    if (!sortFns[key]) return
    setSort((s) => {
      if (s.key !== key) return { key, dir: 'asc' }
      if (s.dir === 'asc') return { key, dir: 'desc' }
      return { key: 'added', dir: 'desc' }
    })
    setPage(1)
  }

  function renderCell(colId, row, index) {
    switch (colId) {
      case 'idx':
        return <span className="tabular-nums text-xs font-medium text-slate-400">{start + index + 1}</span>
      case 'edit':
        if (selectable) {
          return (
            <input
              type="checkbox"
              aria-label="Select candidate"
              checked={!!selectedIds?.has(row.id)}
              onChange={() => onToggleSelect?.(row.id)}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600"
            />
          )
        }
        return (
          <button
            type="button"
            title="Open profile"
            onClick={(e) => { e.stopPropagation(); onEdit(row) }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition duration-150 ease-snappy hover:bg-brand-100 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-95"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )
      case 'name':
        return (
          <div className="flex items-center gap-3">
            <Avatar name={row.name} className="h-9 w-9 shrink-0 text-xs ring-2 ring-white" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); selectable ? onToggleSelect?.(row.id) : onRowClick?.(row) }}
              className="min-w-0 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              <div className="truncate font-semibold text-brand-700 transition-colors duration-150 ease-snappy hover:text-brand-900 hover:underline">
                {row.name || 'Unnamed'}
              </div>
              <div className="truncate text-xs text-slate-500">{row.email || 'no email'}</div>
            </button>
          </div>
        )
      case 'contact':
        return (
          <div className="flex items-center gap-1">
            <ContactIcon
              href={row.linkedin ? (row.linkedin.startsWith('http') ? row.linkedin : `https://${row.linkedin}`) : ''}
              title="LinkedIn"
              icon={Globe}
              external
            />
            <ContactIcon href={row.phone ? `tel:${row.phone}` : ''} title={row.phone} icon={Phone} />
            <ContactIcon href={row.email ? `mailto:${row.email}` : ''} title={row.email} icon={Mail} />
          </div>
        )
      case 'role':
        return <TwoLine primary={row.current_title} secondary={row.current_company} />
      case 'education':
        return <TwoLine primary={row.education_degree} secondary={row.education_institution} />
      case 'comp':
        if (!row.current_ctc && !row.salary_expectation) return <span className="text-slate-300">—</span>
        return (
          <div className="space-y-0.5 text-xs">
            {row.current_ctc && (
              <div><span className="text-slate-500">Current:</span>{' '}<span className="font-semibold text-slate-800">{fmtComp(row.current_ctc)}</span></div>
            )}
            {row.salary_expectation && (
              <div><span className="text-slate-500">Expected:</span>{' '}<span className="font-semibold text-emerald-700">{fmtComp(row.salary_expectation)}</span></div>
            )}
          </div>
        )
      case 'exp':
        return row.total_yoe != null && row.total_yoe !== ''
          ? <span className="tabular-nums text-sm font-medium text-slate-800">{row.total_yoe} <span className="font-normal text-slate-400">yrs</span></span>
          : <span className="text-slate-300">—</span>
      case 'source':
        // Source = the candidate's acquisition channel (Candidate.source).
        return <Badge tone="gray" className="capitalize" title="Acquisition channel (where this candidate came from)">{row.source || '—'}</Badge>
      case 'sub_source': {
        // Sub-source = a finer attribution. Use the distinct sub_source when set; otherwise
        // fall back to who/what applied them (Application.applied_by). Avoid just echoing Source.
        const sub = (row.sub_source && row.sub_source !== row.source) ? row.sub_source : (row.applied_by || '')
        return sub
          ? <span className="text-sm capitalize text-slate-600" title="Finer attribution (e.g. who referred or which channel sub-tag)">{sub}</span>
          : <span className="text-slate-300">—</span>
      }
      case 'location':
        return row.location
          ? <span className="inline-flex max-w-[140px] items-center gap-1 truncate text-sm text-slate-700"><MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />{row.location}</span>
          : <span className="text-slate-300">—</span>
      case 'suggested_role': {
        if (!row.suggested_role) return <span className="text-slate-300">—</span>
        const tip = `AI best-fit role: ${row.suggested_role}${row.suggested_role_score != null ? ` · ${row.suggested_role_score}% match` : ''}`
        const inner = (
          <>
            <Sparkles className="h-3 w-3 shrink-0 text-brand-400" />
            <span className="truncate">{row.suggested_role}</span>
            {row.suggested_role_score != null && <span className="shrink-0 text-xs text-slate-400">{row.suggested_role_score}%</span>}
          </>
        )
        // Link straight to the matched role when we have its id.
        return row.suggested_role_id ? (
          <Link
            to={`/roles/${row.suggested_role_id}`}
            onClick={(e) => e.stopPropagation()}
            title={tip}
            className="inline-flex max-w-[160px] items-center gap-1 truncate text-sm text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            {inner}
          </Link>
        ) : (
          <span className="inline-flex max-w-[160px] items-center gap-1 truncate text-sm text-slate-700" title={tip}>
            {inner}
          </span>
        )
      }
      case 'pipeline': {
        if (!row.application_count) return <span className="text-xs text-slate-400">Not applied</span>
        // Show ONE application's stage + ITS score together (the candidate's primary/active
        // application) so the score and stage can never come from different roles. Prefer the
        // backend-matched primary_* fields; fall back to the most-recent stage + best score.
        const stage = row.primary_stage || row.latest_stage
        const score = row.primary_score != null ? row.primary_score : row.top_score
        const roleTitle = row.primary_role || ''
        const more = Math.max(0, (row.application_count || 0) - 1)
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-2 whitespace-nowrap">
              {score > 0 && (
                <span
                  className={cx('inline-flex h-5 items-center rounded-full px-2 text-xs font-semibold tabular-nums', SCORE_PILL[scoreTone(score)])}
                  title="Match score for this application"
                >
                  {Math.round(score)}
                </span>
              )}
              {stage && (
                <span className="inline-flex items-center gap-1.5 text-sm capitalize text-slate-700">
                  <span className={cx('h-1.5 w-1.5 rounded-full', STAGE_DOT[stageTone[stage]] || 'bg-slate-400')} />
                  {stage}
                </span>
              )}
              {more > 0 && (
                <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-medium text-slate-500" title={`${more} more application${more === 1 ? '' : 's'}`}>
                  +{more}
                </span>
              )}
            </div>
            {roleTitle && <div className="mt-0.5 max-w-[150px] truncate text-[11px] text-slate-400" title={roleTitle}>{roleTitle}</div>}
          </div>
        )
      }
      case 'added':
        return (
          <span className="whitespace-nowrap text-sm text-slate-600">
            {new Date(row.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        )
      case 'applied_by': {
        const by = row.applied_by || row.sub_source || row.source
        return by
          ? <span className="text-sm capitalize text-slate-600">{by}</span>
          : <span className="text-slate-300">—</span>
      }
      default:
        return null
    }
  }

  const stickyIds = new Set(['idx', 'edit', 'name'])
  let stickyLeft = 0
  const stickyOffsets = {}
  for (const col of activeColumns) {
    if (stickyIds.has(col.id)) {
      stickyOffsets[col.id] = stickyLeft
      if (col.id === 'idx') stickyLeft += 48
      else if (col.id === 'edit') stickyLeft += 48
      else stickyLeft += 220
    }
  }

  if (!rows.length) return null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => setDensity('comfortable')}
            className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97]', density === 'comfortable' ? 'bg-brand-50 text-brand-800' : 'text-slate-500')}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Comfortable
          </button>
          <button
            type="button"
            onClick={() => setDensity('compact')}
            className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97]', density === 'compact' ? 'bg-brand-50 text-brand-800' : 'text-slate-500')}
          >
            <LayoutList className="h-3.5 w-3.5" /> Compact
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" className="text-xs" onClick={() => setSettingsOpen(true)}>
            <Columns3 className="h-4 w-4" /> Columns
          </Button>
          <Button variant="ghost" className="text-xs" onClick={() => exportTalentPoolCsv(sorted)}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md ring-1 ring-slate-900/5">
        <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-30 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/90 backdrop-blur-sm">
              <tr>
                {activeColumns.map((col) => {
                  const sortable = !!sortFns[col.id]
                  const isSticky = stickyIds.has(col.id)
                  return (
                    <th
                      key={col.id}
                      className={cx(
                        headPad,
                        COL_WIDTH[col.id],
                        'text-[11px] font-bold uppercase tracking-wider text-slate-500',
                        isSticky && 'sticky z-40 bg-slate-50 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.06)]',
                      )}
                      style={isSticky ? { left: stickyOffsets[col.id] } : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {selectable && col.id === 'edit' ? (
                          <input
                            type="checkbox"
                            aria-label="Select all on this page"
                            checked={pageRows.length > 0 && pageRows.every((r) => selectedIds?.has(r.id))}
                            onChange={() => onToggleAll?.(pageRows.map((r) => r.id))}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600"
                          />
                        ) : (
                          <span
                            className={cx('inline-flex items-center gap-1', sortable && 'cursor-pointer select-none hover:text-brand-700')}
                            onClick={sortable ? () => toggleSort(col.id) : undefined}
                          >
                            {col.label}
                            {sort.key === col.id && <span className="text-brand-600">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                          </span>
                        )}
                        {FILTER_ACCESSORS[col.id] && (
                          <ColumnFilter
                            label={col.label}
                            values={distinct[col.id] || []}
                            excluded={filterCtl.filters[col.id] || []}
                            onChange={(arr) => { filterCtl.setFilter(col.id, arr); setPage(1) }}
                          />
                        )}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr
                  key={row.id}
                  onClick={() => (selectable ? onToggleSelect?.(row.id) : onRowClick?.(row))}
                  className={cx(
                    'group cursor-pointer border-b border-slate-100 transition-colors duration-150 ease-snappy hover:bg-brand-50',
                    selectable && selectedIds?.has(row.id) && 'bg-brand-50/60',
                  )}
                >
                  {activeColumns.map((col) => {
                    const isSticky = stickyIds.has(col.id)
                    return (
                      <td
                        key={col.id}
                        className={cx(
                          cellPad,
                          COL_WIDTH[col.id],
                          'align-middle',
                          isSticky && 'sticky z-20 bg-white group-hover:bg-brand-50 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.04)]',
                        )}
                        style={isSticky ? { left: stickyOffsets[col.id] } : undefined}
                      >
                        {renderCell(col.id, row, i)}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {!sorted.length && (
                <tr>
                  <td colSpan={activeColumns.length} className="px-4 py-10 text-center text-sm text-slate-400">
                    No candidates match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/90 px-4 py-3 text-xs text-slate-600">
          <span className="flex items-center gap-2">
            <span>
              Showing <strong className="text-slate-900">{sorted.length ? start + 1 : 0}–{Math.min(start + pageSize, sorted.length)}</strong> of{' '}
              <strong className="text-slate-900">{sorted.length}</strong> candidates
              {filterCtl.active > 0 && <span className="text-slate-400"> (filtered from {rows.length})</span>}
            </span>
            {filterCtl.active > 0 && (
              <button
                type="button"
                onClick={() => { filterCtl.clear(); setPage(1) }}
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
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
              >
                {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button type="button" disabled={safePage <= 1} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 transition duration-150 ease-snappy hover:border-brand-200 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100" onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
            <span className="tabular-nums px-1">Page {safePage} / {totalPages}</span>
            <button type="button" disabled={safePage >= totalPages} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 transition duration-150 ease-snappy hover:border-brand-200 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        </div>
      </div>

      <TalentPoolColumnSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        visible={visible}
        onToggle={updateVisible}
        onReset={resetVisible}
      />
    </div>
  )
}
