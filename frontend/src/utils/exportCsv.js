export function exportTalentPoolCsv(rows) {
  const headers = [
    'Name', 'Email', 'Phone', 'LinkedIn', 'Current Title', 'Current Company',
    'Education', 'Institution', 'Current CTC', 'Expected CTC', 'Experience (Yrs)',
    'Source', 'Sub-source', 'Location', 'Top Score', 'Latest Stage', 'Date Added',
  ]
  const data = rows.map((r) => [
    r.name || '',
    r.email || '',
    r.phone || '',
    r.linkedin || '',
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
  const csv = [headers, ...data]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'talent_pool.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function exportPipelineCsv(apps, roleTitle = 'pipeline') {
  const headers = [
    'Name', 'Email', 'Source', 'Stage', 'Score', 'Rating/5', 'Recommendation',
    'Current Title', 'Current Company', 'Education', 'Institution',
    'Current CTC', 'Expected CTC', 'YOE', 'Location', 'Notice', 'Applied', 'Status Changed', 'Notes',
  ]
  const rows = apps.map((app) => {
    const c = app.candidate || {}
    const p = app.profile || {}
    return [
      c.name || '',
      c.email || '',
      c.source || '',
      app.stage || '',
      Math.round(app.score_overall || 0),
      ((app.score_overall || 0) / 20).toFixed(1),
      app.recommendation || '',
      p.current_title || '',
      p.current_company || '',
      p.education_degree || '',
      p.education_institution || '',
      p.current_ctc || '',
      p.salary_expectation || '',
      p.total_yoe ?? '',
      p.location || '',
      p.notice_period || '',
      app.created_at ? new Date(app.created_at).toLocaleDateString() : '',
      app.stage_changed_at ? new Date(app.stage_changed_at).toLocaleDateString() : '',
      (app.notes || '').replace(/\n/g, ' '),
    ]
  })
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${roleTitle.replace(/\s+/g, '_').toLowerCase()}_candidates.csv`
  a.click()
  URL.revokeObjectURL(url)
}
