// Trigger a CSV download from an array-of-arrays. Attaches the anchor to the document
// (some browsers ignore .click() on a detached node) and returns true on success / false
// on failure, so callers can report real success instead of an unconditional "Exported".
function downloadCsv(rowsOfArrays, filename) {
  try {
    const csv = rowsOfArrays
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    // Prepend a UTF-8 BOM so Excel renders ₹ and accented names correctly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return true
  } catch {
    return false
  }
}

// "12 LPA" / "1200000" → "₹12 LPA" / "₹12,00,000". Leaves any value that already carries a
// currency token (₹/Rs/INR/$) untouched; blanks stay blank. The recruiter-entered string is
// the source of truth — we only prefix a symbol when one is missing.
export function formatComp(value) {
  const s = String(value ?? '').trim()
  if (!s) return ''
  if (/[₹$]|\b(?:Rs\.?|INR|USD)\b/i.test(s)) return s
  // Bare number (no unit) → group in the Indian system for readability.
  if (/^\d[\d,]*(?:\.\d+)?$/.test(s)) {
    const n = Number(s.replace(/,/g, ''))
    if (Number.isFinite(n)) return `₹${n.toLocaleString('en-IN')}`
  }
  return `₹${s}`
}

const VERDICT_LABEL = { strong_yes: 'Yes', yes: 'Yes', maybe: 'Maybe', no: 'No' }

// Final Yes / Maybe / No verdict for an export row — mirrors the table's rowVerdict():
// prefer the AI recommendation, else derive from the overall score (so rows scored before the
// recommendation field existed still export a verdict), else blank for truly unscored rows.
function verdictLabel(app) {
  if (VERDICT_LABEL[app.recommendation]) return VERDICT_LABEL[app.recommendation]
  if (!app.scored_at && !(app.score_overall > 0)) return ''
  const s = app.score_overall || 0
  return s >= 65 ? 'Yes' : s >= 50 ? 'Maybe' : 'No'
}

// Each talent-pool table column id → the export (header, value) pairs it expands to. Multi-value
// cells (Contact, Current role, Compensation…) split into their natural sub-columns. Keyed by the
// same ids as TALENT_POOL_COLUMNS so the export mirrors exactly what's shown in the table.
const TP_EXPORT_MAP = {
  name: [['Candidate', (r) => r.name || '']],
  contact: [
    ['Email', (r) => r.email || ''],
    ['Phone', (r) => r.phone || ''],
    ['LinkedIn', (r) => r.linkedin || ''],
  ],
  role: [
    ['Current Title', (r) => r.current_title || ''],
    ['Current Company', (r) => r.current_company || ''],
  ],
  education: [
    ['Education', (r) => r.education_degree || ''],
    ['Institution', (r) => r.education_institution || ''],
  ],
  comp: [
    ['Current CTC', (r) => formatComp(r.current_ctc)],
    ['Expected CTC', (r) => formatComp(r.salary_expectation)],
  ],
  exp: [['Experience (Yrs)', (r) => r.total_yoe ?? '']],
  source: [['Source', (r) => r.source || '']],
  sub_source: [['Sub-source', (r) => r.sub_source || '']],
  location: [['Location', (r) => r.location || '']],
  suggested_role: [
    ['AI suggested role', (r) => r.suggested_role || ''],
    ['Match %', (r) => (r.suggested_role_score != null ? Math.round(r.suggested_role_score) : '')],
  ],
  pipeline: [
    ['Pipeline role', (r) => r.primary_role || ''],
    ['Pipeline stage', (r) => r.primary_stage || ''],
    ['Pipeline score', (r) => (r.primary_score != null ? Math.round(r.primary_score) : '')],
  ],
  added: [['Date added', (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString() : '')]],
}

// Export EVERY column (not just the visible ones) so the CSV always has the full picture — nothing
// is left out even if a column is hidden in the table.
export function exportTalentPoolCsv(rows) {
  const pairs = Object.values(TP_EXPORT_MAP).flat()
  const headers = pairs.map(([h]) => h)
  const data = rows.map((r) => pairs.map(([, fn]) => fn(r)))
  return downloadCsv([headers, ...data], 'talent_pool.csv')
}

export function exportPipelineCsv(apps, roleTitle = 'pipeline') {
  const headers = [
    'Name', 'Email', 'Phone', 'LinkedIn', 'GitHub', 'Source', 'Sub-source', 'Stage', 'Score', 'Rating/5', 'AI verdict', 'Recommendation',
    'Current Title', 'Current Company', 'Education', 'Institution',
    'Current CTC', 'Expected CTC', 'YOE', 'Location', 'Notice',
    'Interview', 'AI interview', 'Activity', 'Emails', 'Last email', 'Applied', 'Applied by', 'Status Changed', 'Notes',
  ]
  const rows = apps.map((app) => {
    const c = app.candidate || {}
    const p = app.profile || {}
    const m = app.meta || {}
    const lastEmail = m.last_email_at
      ? `${m.last_email_template || 'email'} · ${m.last_email_status || 'sent'} · ${new Date(m.last_email_at).toLocaleDateString()}`
      : ''
    const interview = m.interview_rounds_scheduled > 0
      ? `R${m.interview_next_round || '?'}`
      : (m.screening_status === 'completed' ? 'Screened' : m.screening_status === 'in_progress' ? 'Live' : '')
    const aiInterview = m.ai_interview_status === 'done' ? 'Done' : m.ai_interview_status === 'pending' ? 'Pending' : ''
    return [
      c.name || '',
      c.email || '',
      c.phone || p.phone || '',
      p.linkedin || '',
      p.github || '',
      c.source || '',
      p.sub_source || '',
      app.stage || '',
      Math.round(app.score_overall || 0),
      ((app.score_overall || 0) / 20).toFixed(1),
      verdictLabel(app),
      app.recommendation || '',
      p.current_title || '',
      p.current_company || '',
      p.education_degree || '',
      p.education_institution || '',
      formatComp(p.current_ctc),
      formatComp(p.salary_expectation),
      p.total_yoe ?? '',
      p.location || '',
      p.notice_period || '',
      interview,
      aiInterview,
      m.activity || '',
      m.email_count || 0,
      lastEmail,
      app.created_at ? new Date(app.created_at).toLocaleDateString() : '',
      app.applied_by || '',
      app.stage_changed_at ? new Date(app.stage_changed_at).toLocaleString() : '',
      (app.notes || '').replace(/\n/g, ' '),
    ]
  })
  return downloadCsv([headers, ...rows], `${roleTitle.replace(/\s+/g, '_').toLowerCase()}_candidates.csv`)
}
