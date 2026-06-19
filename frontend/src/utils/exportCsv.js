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

export function exportTalentPoolCsv(rows) {
  const headers = [
    'Name', 'Email', 'Phone', 'LinkedIn', 'GitHub', 'Current Title', 'Current Company',
    'Education', 'Institution', 'Current CTC', 'Expected CTC', 'Experience (Yrs)',
    'Source', 'Sub-source', 'Location', 'Top Score', 'Latest Stage', 'Date Added',
  ]
  const data = rows.map((r) => [
    r.name || '',
    r.email || '',
    r.phone || '',
    r.linkedin || '',
    r.github || '',
    r.current_title || '',
    r.current_company || '',
    r.education_degree || '',
    r.education_institution || '',
    r.current_ctc || '',
    r.salary_expectation || '',
    r.total_yoe ?? '',
    r.source || '',
    r.sub_source || '',
    r.location || '',
    Math.round(r.top_score || 0),
    r.latest_stage || '',
    r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
  ])
  return downloadCsv([headers, ...data], 'talent_pool.csv')
}

export function exportPipelineCsv(apps, roleTitle = 'pipeline') {
  const headers = [
    'Name', 'Email', 'Phone', 'LinkedIn', 'GitHub', 'Source', 'Stage', 'Score', 'Rating/5', 'AI verdict', 'Recommendation',
    'Current Title', 'Current Company', 'Education', 'Institution',
    'Current CTC', 'Expected CTC', 'YOE', 'Location', 'Notice', 'Last email', 'Applied', 'Status Changed', 'Notes',
  ]
  const rows = apps.map((app) => {
    const c = app.candidate || {}
    const p = app.profile || {}
    const m = app.meta || {}
    const lastEmail = m.last_email_at
      ? `${m.last_email_template || 'email'} · ${m.last_email_status || 'sent'} · ${new Date(m.last_email_at).toLocaleDateString()}`
      : ''
    return [
      c.name || '',
      c.email || '',
      c.phone || p.phone || '',
      p.linkedin || '',
      p.github || '',
      c.source || '',
      app.stage || '',
      Math.round(app.score_overall || 0),
      ((app.score_overall || 0) / 20).toFixed(1),
      VERDICT_LABEL[app.recommendation] || '',
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
      lastEmail,
      app.created_at ? new Date(app.created_at).toLocaleDateString() : '',
      app.stage_changed_at ? new Date(app.stage_changed_at).toLocaleDateString() : '',
      (app.notes || '').replace(/\n/g, ' '),
    ]
  })
  return downloadCsv([headers, ...rows], `${roleTitle.replace(/\s+/g, '_').toLowerCase()}_candidates.csv`)
}
