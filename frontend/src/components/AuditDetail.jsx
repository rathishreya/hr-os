const CATEGORY_MAP = {
  'hiring_request.created': 'hiring',
  'hiring_request.updated': 'hiring',
  'hiring_request.duplicated': 'hiring',
  'job.generated': 'hiring',
  'job.published': 'hiring',
  'candidate.ingested': 'candidates',
  'application.created': 'candidates',
  'application.scored': 'pipeline',
  'application.stage_changed': 'pipeline',
  'application.human_override': 'pipeline',
  'application.notes_updated': 'pipeline',
  'email.sent': 'email',
}

export const AUDIT_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'hiring', label: 'Hiring' },
  { id: 'candidates', label: 'Candidates' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'email', label: 'Email' },
]

export function getAuditCategory(action) {
  return CATEGORY_MAP[action] || 'other'
}

export function formatAuditSummary(row) {
  const d = row.detail || {}
  switch (row.action) {
    case 'hiring_request.created':
      return `New hiring request created${d.position ? ` for ${d.position}` : ''}`
    case 'job.generated':
      return 'AI generated job description'
    case 'job.published':
      return 'Job published'
    case 'candidate.ingested':
      return `Candidate ingested${d.name ? `: ${d.name}` : ''}`
    case 'application.created':
      return 'Candidate applied to role'
    case 'application.scored':
      return `AI scored application${d.score_overall != null ? `: ${Math.round(d.score_overall)}` : ''}`
    case 'application.stage_changed':
      return `Moved to ${d.to || d.stage || 'new stage'}${d.from ? ` (was ${d.from})` : ''}`
    case 'application.human_override':
      return `Human override${d.note ? `: ${d.note}` : ''}`
    case 'email.sent':
      return `Sent ${d.template || 'email'}${d.status ? ` (${d.status})` : ''}`
    case 'hiring_request.duplicated':
      return `Duplicated from role #${d.from}`
    case 'application.notes_updated':
      return 'Recruiter notes updated'
    default:
      return row.action.replace(/\./g, ' · ').replace(/_/g, ' ')
  }
}

export function formatRelativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}
