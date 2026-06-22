import { useState } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  Calculator,
  ChevronDown,
  Sparkles,
  ShieldCheck,
} from 'lucide-react'
import { Badge, Button, Spinner, cx } from '../../ui'
import { api } from '../../api'
import { useToast } from '../Toast'

// Maps the engine's recommendation → a plain-English fit verdict + visual tone.
const VERDICT = {
  strong_yes: {
    label: 'Strong fit',
    tone: 'green',
    ring: 'text-emerald-600',
    blurb: 'Clears the bar on the signals that matter most for this role. Fast-track.',
  },
  yes: {
    label: 'Fit',
    tone: 'green',
    ring: 'text-emerald-600',
    blurb: 'Solid match against the requirements — worth advancing to interview.',
  },
  maybe: {
    label: 'Borderline',
    tone: 'amber',
    ring: 'text-amber-500',
    blurb: 'Partial match. Advance only if the gaps below are coverable in interview.',
  },
  no: {
    label: 'Not a fit',
    tone: 'rose',
    ring: 'text-rose-500',
    blurb: 'Misses core requirements for this role as scored from the resume.',
  },
}

const DIM_META = {
  skill_match: { label: 'Skill match', group: 'measured' },
  experience_match: { label: 'Experience match', group: 'measured' },
  domain_relevance: { label: 'Domain relevance', group: 'ai' },
  communication: { label: 'Communication', group: 'ai' },
  leadership: { label: 'Leadership', group: 'ai' },
  culture_fit: { label: 'Culture fit', group: 'ai' },
  growth_potential: { label: 'Growth potential', group: 'ai' },
  salary_fit: { label: 'Salary fit', group: 'ai' },
  stability: { label: 'Stability', group: 'ai' },
}

const dimLabel = (k) => DIM_META[k]?.label || k.replace(/_/g, ' ')
const titleize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

export function verdictFor(rec, overall) {
  if (VERDICT[rec]) return VERDICT[rec]
  // Legacy rows without a recommendation — derive from the overall score.
  if (overall >= 80) return VERDICT.strong_yes
  if (overall >= 65) return VERDICT.yes
  if (overall >= 50) return VERDICT.maybe
  return VERDICT.no
}

function barColor(value) {
  if (value >= 80) return 'bg-emerald-500'
  if (value >= 65) return 'bg-sky-500'
  if (value >= 50) return 'bg-amber-500'
  return 'bg-rose-500'
}

// Resolve the tag the same way verdictFor() does, so the reason can't contradict the label.
function tagOf(rec, overall) {
  if (rec === 'strong_yes' || rec === 'yes' || rec === 'maybe' || rec === 'no') return rec
  if (overall >= 80) return 'strong_yes'
  if (overall >= 65) return 'yes'
  if (overall >= 50) return 'maybe'
  return 'no'
}

// "react, fastapi, sql" → "React, FastAPI and SQL"; caps long lists at "A, B and N more".
function fmtSkills(arr) {
  const a = arr.map((s) => titleize(String(s)))
  if (a.length <= 1) return a[0] || ''
  if (a.length <= 3) return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`
  return `${a[0]}, ${a[1]} and ${a.length - 2} more`
}

// The mock provider emits a fixed rationale we can mine for exact, honest numbers.
// Kept in lockstep with backend/app/services/ai/mock.py _score(); if that wording
// ever changes this parse just returns null and we fall back to the structured spine.
const MOCK_SUMMARY_RE =
  /Matched\s+(\d+)\/(\d+)\s+mandatory skills.*?Experience\s+([\d.]+)\s*yrs\s*vs\s*required\s+([\d.]+)-([\d.]+)\s*\(~(\d+)%/i
function parseMockSummary(summary) {
  const m = summary ? String(summary).match(MOCK_SUMMARY_RE) : null
  if (!m) return null
  return { matchedN: +m[1], mandTotal: +m[2], yoe: +m[3], ymin: +m[4], ymax: +m[5], expPct: +m[6] }
}

// A 1-2 line, candidate-specific "why this tag" line for the verdict banner — derived
// only from data the report already holds (no rescore), and it never invents a number:
// counts come from the skill chips, the exact mandatory ratio / yrs-vs-range only from
// the mock summary when present, and experience is otherwise described qualitatively.
function reasonForTag(app, bd, overall, contributions, matched, missing) {
  const tag = tagOf(app.recommendation, overall)
  const exp = contributions.find((c) => c.key === 'experience_match')?.score
  const nMiss = missing.length
  const hasBreakdown = !!(bd.contributions && bd.contributions.length) || matched.length > 0 || nMiss > 0

  // Legacy / unscored rows: nothing candidate-specific to cite — speak to the band only.
  if (!hasBreakdown) {
    if (!overall) return 'Not scored yet — run the AI score to see why this candidate ranks where they do.'
    const band =
      overall >= 80 ? 'clears the strong-fit bar' :
      overall >= 65 ? 'is a solid match' :
      overall >= 50 ? 'is borderline' : 'falls below the bar'
    return `Scored ${overall}/100 overall, which ${band}. Re-run the AI score for a skill-level breakdown.`
  }

  const mk = parseMockSummary(bd.summary)

  // Skill clause — prefer the exact mandatory count, else honest chip counts.
  const skillClause =
    mk && mk.mandTotal > 0
      ? `matched ${mk.matchedN} of ${mk.mandTotal} must-have skills`
      : nMiss > 0
        ? `missing ${nMiss} must-have skill${nMiss === 1 ? '' : 's'} (${fmtSkills(missing)})`
        : tag === 'maybe' || tag === 'no'
          ? 'partial match on the blended skill and soft-signal scores'
          : 'covers the role’s must-have skills'

  // Experience clause — exact yrs-vs-range when available, else a qualitative read; only when decisive.
  // (experience_match also drops for the over-experienced, so say "outside", not "below".)
  const expClause =
    mk
      ? mk.expPct >= 90
        ? ` Experience (${mk.yoe} yrs) sits in the ${mk.ymin}-${mk.ymax} yr target.`
        : mk.expPct >= 60
          ? mk.yoe > mk.ymax
            ? ` Experience (${mk.yoe} yrs) is above the ${mk.ymin}-${mk.ymax} yr target.`
            : ` Experience (${mk.yoe} yrs) is near the ${mk.ymin}-${mk.ymax} yr target.`
          : ` Experience (${mk.yoe} yrs) is outside the ${mk.ymin}-${mk.ymax} yr target.`
      : exp == null
        ? ''
        : exp >= 75
          ? ' Experience fits the required range.'
          : exp < 55
            ? ' Experience is outside the required range.'
            : ''

  switch (tag) {
    case 'strong_yes':
      return `Strong fit — ${skillClause}; ${overall}/100 overall.${expClause}`
    case 'yes':
      return `Fit — ${skillClause}; ${overall}/100 overall — worth advancing to interview.${expClause}`
    case 'maybe':
      return `Borderline — ${skillClause}; ${overall}/100 overall. Advance only if the gaps are coverable in interview.${expClause}`
    case 'no':
    default:
      return `Not a fit — ${skillClause}; ${overall}/100 overall.${expClause}`
  }
}

function DimRow({ dkey, score, weight }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-slate-600">
          {dimLabel(dkey)}
          {weight != null && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-400">
              {weight}%
            </span>
          )}
        </span>
        <span className="tabular-nums font-semibold text-slate-700">{score}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={cx('h-full rounded-full transition-[width] duration-500 ease-snappy', barColor(score))} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

export default function AiReportTab({ app, onRefresh }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [showMath, setShowMath] = useState(true)

  const overall = Math.round(app.score_overall || 0)
  const bd = app.score_breakdown || {}
  const dims = app.score_dimensions || {}
  const verdict = verdictFor(app.recommendation, overall)

  const strengths = (bd.strengths || []).filter(Boolean)
  const concerns = (bd.concerns || []).filter(Boolean)
  const matched = (bd.matched_skills || []).filter(Boolean)
  const missing = (bd.missing_skills || []).filter(Boolean)

  // Prefer the rich contributions array; fall back to raw dimensions for legacy rows.
  const contributions =
    bd.contributions && bd.contributions.length
      ? bd.contributions
      : Object.entries(dims).map(([key, score]) => ({ key, score, weight: null, points: null }))
  const weightByKey = Object.fromEntries(contributions.map((c) => [c.key, c.weight]))

  const measured = contributions.filter((c) => DIM_META[c.key]?.group === 'measured')
  const aiDims = contributions.filter((c) => DIM_META[c.key]?.group !== 'measured')

  // The matched / missing skills already render as chips below, so drop any
  // strength / concern that merely restates a skill name — keeps the bullet
  // pointers high-signal instead of echoing the chips.
  const matchedSet = new Set(matched.map((s) => String(s).toLowerCase().trim()))
  const missingSet = new Set(missing.map((s) => String(s).toLowerCase().trim()))
  // True if `text` names any skill in `set` as a whole token (space-padded so "sql" ≠ "nosql").
  const namesSkill = (text, set) => {
    const padded = ` ${String(text).toLowerCase().trim()} `
    for (const s of set) { if (s && padded.includes(` ${s} `)) return true }
    return false
  }
  // Drop a strength that just echoes a matched chip, OR that credits a skill we found missing
  // (a contradiction). Likewise drop a gap that echoes a missing chip, OR that flags a skill we
  // matched as absent. Guards older reports whose AI text disagreed with the deterministic match.
  const strongPoints = strengths.filter((s) => {
    const core = String(s).toLowerCase().trim()
    return !matchedSet.has(core) && !namesSkill(core, missingSet)
  })
  const gaps = concerns.filter((c) => {
    const core = String(c).replace(/^Missing:\s*/i, '').toLowerCase().trim()
    return !missingSet.has(core) && !namesSkill(core, matchedSet)
  })

  // Surface the experience read as a pointer — otherwise it's only a score bar.
  const expScore = contributions.find((c) => c.key === 'experience_match')?.score
  if (typeof expScore === 'number') {
    if (expScore >= 75) strongPoints.push('Experience fits the role’s required range')
    else if (expScore < 55) gaps.push('Experience is below the role’s required range')
  }

  const hasReport = !!(bd.contributions?.length || strengths.length || concerns.length)

  async function rescore() {
    setBusy(true)
    try {
      await api.rescore(app.id)
      await onRefresh()
      toast('AI report refreshed')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* ---- Verdict banner ---- */}
      <div className={cx('flex items-center gap-4 rounded-2xl border p-4', {
        green: 'border-emerald-200 bg-emerald-50/60',
        amber: 'border-amber-200 bg-amber-50/60',
        rose: 'border-rose-200 bg-rose-50/60',
      }[verdict.tone])}>
        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-white shadow-sm">
          <span className={cx('text-2xl font-bold leading-none tabular-nums', verdict.ring)}>{overall}</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">/ 100</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-slate-900">{verdict.label}</span>
            <Badge tone={verdict.tone}>{(app.recommendation || 'unscored').replace(/_/g, ' ')}</Badge>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            {reasonForTag(app, bd, overall, contributions, matched, missing) || verdict.blurb}
          </p>
        </div>
      </div>

      {!hasReport && (
        <div className="flex items-start gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          <span>Detailed strengths &amp; gaps haven&apos;t been generated yet. Click <b>Re-run AI score</b> to build the full report.</span>
        </div>
      )}

      {/* ---- Strong points & gaps ---- */}
      {(strongPoints.length > 0 || gaps.length > 0 || matched.length > 0 || missing.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Strong points
            </div>
            {strongPoints.length > 0 && (
              <ul className="space-y-1.5 text-sm text-slate-700">
                {strongPoints.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                    <span>{titleize(String(s))}</span>
                  </li>
                ))}
              </ul>
            )}
            {matched.length > 0 && (
              <div className={cx('flex flex-wrap gap-1.5', strongPoints.length > 0 && 'mt-3')}>
                {matched.map((s) => (
                  <span key={s} className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    {titleize(s)}
                  </span>
                ))}
              </div>
            )}
            {strongPoints.length === 0 && matched.length === 0 && (
              <p className="text-xs text-slate-400">No standout strengths surfaced.</p>
            )}
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
              <AlertTriangle className="h-4 w-4" /> Gaps &amp; risks
            </div>
            {gaps.length > 0 && (
              <ul className="space-y-1.5 text-sm text-slate-700">
                {gaps.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                    <span>{titleize(String(c).replace(/^Missing:\s*/i, 'Missing required skill: '))}</span>
                  </li>
                ))}
              </ul>
            )}
            {missing.length > 0 && (
              <div className={cx('flex flex-wrap gap-1.5', gaps.length > 0 && 'mt-3')}>
                {missing.map((s) => (
                  <span key={s} className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    {titleize(s)}
                  </span>
                ))}
              </div>
            )}
            {gaps.length === 0 && missing.length === 0 && (
              <p className="text-xs text-slate-400">No blocking gaps detected.</p>
            )}
          </div>
        </div>
      )}

      {/* ---- Score breakdown ---- */}
      <div className="space-y-4 rounded-xl border border-slate-100 p-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Score breakdown
        </div>
        {measured.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-slate-400" /> Measured from the resume
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {measured.map((c) => <DimRow key={c.key} dkey={c.key} score={c.score} weight={c.weight} />)}
            </div>
          </div>
        )}
        {aiDims.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <Sparkles className="h-3.5 w-3.5 text-slate-400" /> AI &amp; heuristic estimates — confirm in interview
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {aiDims.map((c) => <DimRow key={c.key} dkey={c.key} score={c.score} weight={weightByKey[c.key]} />)}
            </div>
          </div>
        )}
      </div>

      {/* ---- How this score is calculated ---- */}
      <div className="overflow-hidden rounded-xl border border-slate-100">
        <button
          type="button"
          onClick={() => setShowMath((v) => !v)}
          className="flex w-full items-center justify-between gap-2 bg-slate-50 px-4 py-3 text-left transition-colors duration-150 ease-snappy hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <Calculator className="h-4 w-4 text-slate-400" /> How this score is calculated
          </span>
          <ChevronDown className={cx('h-4 w-4 text-slate-400 transition-transform', showMath && 'rotate-180')} />
        </button>
        {showMath && (
          <div className="space-y-3 px-4 py-4 text-xs leading-relaxed text-slate-600">
            <p>
              The overall rating is a <b>weighted average of 9 dimensions</b> — each weight reflects how
              much that dimension matters for this role.{' '}
              <span className="font-medium text-slate-700">Overall = Σ (dimension score × weight).</span>
            </p>
            <ul className="space-y-1.5">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                <span>
                  <b>Skill match</b> is measured deterministically: exact overlap with the role&apos;s
                  mandatory skills{bd.skill_blend ? ` (${Math.round((bd.skill_blend.keyword || 0) * 100)}%)` : ''} blended
                  with semantic similarity of the whole resume to the role{bd.skill_blend ? ` (${Math.round((bd.skill_blend.semantic || 0) * 100)}%)` : ''}.
                  {bd.keyword_skill != null && (
                    <span className="text-slate-400"> Here: keyword {bd.keyword_skill} + semantic {bd.semantic_skill}.</span>
                  )}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                <span><b>Experience match</b> compares the candidate&apos;s years of experience against the role&apos;s required range.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                <span>The remaining <b>soft dimensions</b> are AI / heuristic estimates and are weighted lower — treat them as prompts to verify, not verdicts.</span>
              </li>
            </ul>

            {contributions.some((c) => c.points != null) && (
              <div className="overflow-hidden rounded-lg border border-slate-100">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Dimension</th>
                      <th className="px-3 py-1.5 text-right font-medium">Score</th>
                      <th className="px-3 py-1.5 text-right font-medium">Weight</th>
                      <th className="px-3 py-1.5 text-right font-medium">Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {contributions.map((c) => (
                      <tr key={c.key}>
                        <td className="px-3 py-1.5 text-slate-600">{dimLabel(c.key)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{c.score}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{c.weight != null ? `${c.weight}%` : '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-700">{c.points != null ? c.points : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 text-[11px] font-semibold text-slate-700">
                    <tr>
                      <td className="px-3 py-1.5" colSpan={3}>Overall</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{overall}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-medium text-slate-500">Rating bands:</span>
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">≥80 Strong fit</span>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">65–79 Fit</span>
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">50–64 Borderline</span>
              <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">&lt;50 Not a fit</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-[11px] text-slate-400">AI suggestion — a recruiter makes the final call.</p>
        <Button variant="ghost" className="text-xs" disabled={busy} onClick={rescore}>
          {busy ? <Spinner /> : 'Re-run AI score'}
        </Button>
      </div>
    </div>
  )
}
