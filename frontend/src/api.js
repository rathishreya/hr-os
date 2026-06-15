// Thin API client. In dev, calls go through the Vite proxy ('/api'). In a hosted
// split deploy (static frontend + separate backend), set VITE_API_BASE at build time
// to the backend's absolute API URL, e.g. https://hr-os-backend.onrender.com/api
const BASE = import.meta.env.VITE_API_BASE || '/api'

// ── Auth token (stored in localStorage, sent as a Bearer header) ──
let _token = (typeof localStorage !== 'undefined' && localStorage.getItem('hr_token')) || ''
export function setAuthToken(t) {
  _token = t || ''
  if (typeof localStorage === 'undefined') return
  if (_token) localStorage.setItem('hr_token', _token)
  else localStorage.removeItem('hr_token')
}
export function clearAuthToken() { setAuthToken('') }
export function authHeaders() { return _token ? { Authorization: `Bearer ${_token}` } : {} }

function onUnauthorized(path) {
  // Token missing/expired/invalid: drop it and let the app fall back to the login screen.
  // The login call itself legitimately 401s on bad credentials — don't treat that as a session drop.
  if (path === '/auth/login') return
  clearAuthToken()
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('hr:unauthorized'))
}

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    ...options,
  })
  if (!res.ok) {
    if (res.status === 401) onUnauthorized(path)
    let detail
    try { detail = (await res.json()).detail } catch { detail = res.statusText }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.status === 204 ? null : res.json()
}

function enrichBoardRow(app) {
  const stage = app.stage || 'applied'
  const activityByStage = {
    screening: 'Awaiting AI screen',
    interview: 'Interview stage',
    offer: 'Offer pending',
    hired: 'Hired',
    rejected: 'Rejected',
  }
  return {
    ...app,
    meta: {
      screening_status: 'none',
      screening_score: null,
      screening_recommendation: '',
      screening_summary: '',
      email_count: 0,
      last_email_template: '',
      last_email_status: '',
      last_email_at: null,
      has_notes: !!(app.notes || '').trim(),
      activity: activityByStage[stage] || 'New application',
      is_live: false,
      interview_rounds_scheduled: 0,
      interview_next_round: null,
    },
    profile: {},
    stage_changed_at: app.created_at,
  }
}

export const api = {
  // Auth
  login: (email, password) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signup: (name, email, password) => req('/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  canSignup: () => req('/auth/can-signup'),
  me: () => req('/auth/me'),

  aiStatus: () => req('/ai-status'),
  company: () => req('/company'),
  exportData: () => req('/admin/export'),
  analytics: () => req('/analytics/overview'),
  publishJob: (jobId, platforms = []) => req(`/jobs/${jobId}/publish`, { method: 'POST', body: JSON.stringify({ platforms }) }),
  distributionChannels: () => req('/distribution/channels'),
  distributionIntegrations: () => req('/distribution/integrations'),
  googleIndexJob: (jobId) => req('/distribution/google/index', { method: 'POST', body: JSON.stringify({ job_id: jobId }) }),
  linkedinShareJob: (jobId) => req('/distribution/linkedin/share', { method: 'POST', body: JSON.stringify({ job_id: jobId }) }),

  // Users & roles (team directory; roles place people in the tool, e.g. panellists)
  listUsers: (role = '') => req(`/users${role ? `?role=${encodeURIComponent(role)}` : ''}`),
  createUser: (body) => req('/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id, body) => req(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteUser: (id) => req(`/users/${id}`, { method: 'DELETE' }),

  // Placement officers (TPO) + campus outreach
  listTpos: () => req('/tpos'),
  createTpo: (body) => req('/tpos', { method: 'POST', body: JSON.stringify(body) }),
  updateTpo: (id, body) => req(`/tpos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTpo: (id) => req(`/tpos/${id}`, { method: 'DELETE' }),
  sendToTpos: (hrId, body) => req(`/hiring-requests/${hrId}/send-to-tpos`, { method: 'POST', body: JSON.stringify(body) }),

  listRoles: () => req('/hiring-requests'),
  listRolesTable: (q = '', status = '') => {
    const params = new URLSearchParams({ table: '1' })
    if (q) params.set('q', q)
    if (status) params.set('status', status)
    return req(`/hiring-requests?${params}`)
  },
  getRole: (id) => req(`/hiring-requests/${id}`),
  createRole: (body) => req('/hiring-requests', { method: 'POST', body: JSON.stringify(body) }),
  suggestSkills: (body) => req('/hiring-requests/suggest-skills', { method: 'POST', body: JSON.stringify(body) }),
  updateRole: (id, body) => req(`/hiring-requests/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  duplicateRole: (id) => req(`/hiring-requests/${id}/duplicate`, { method: 'POST' }),
  deleteRole: (id) => req(`/hiring-requests/${id}`, { method: 'DELETE' }),
  generateJD: (id) => req(`/hiring-requests/${id}/generate-jd`, { method: 'POST' }),
  getJD: (id) => req(`/hiring-requests/${id}/job`),
  updateJob: (jobId, body) => req(`/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  listCandidates: (q = '') => req(`/candidates${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  listCandidatesTable: (q = '') => req(`/candidates?table=1${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  reparseAllCandidates: () => req('/candidates/reparse-all', { method: 'POST' }),
  getCandidate: (id) => req(`/candidates/${id}`),
  // Fetch the original résumé file WITH the auth header (gated endpoint → can't open via a
  // plain link), returned as a Blob the caller can open/download.
  fetchResumeFile: async (id) => {
    const r = await fetch(BASE + `/candidates/${id}/resume-file`, { headers: authHeaders() })
    if (!r.ok) { if (r.status === 401) onUnauthorized(`/candidates/${id}/resume-file`); throw new Error('Could not load résumé file') }
    return r.blob()
  },
  getCandidateProfile: (id) => req(`/candidates/${id}/profile`),
  deleteCandidate: (id) => req(`/candidates/${id}`, { method: 'DELETE' }),
  createCandidate: (body) => req('/candidates', { method: 'POST', body: JSON.stringify(body) }),
  applyCandidate: (candId, hiringRequestId) =>
    req(`/candidates/${candId}/apply`, { method: 'POST', body: JSON.stringify({ hiring_request_id: hiringRequestId }) }),
  uploadCandidate: (formData) =>
    fetch(BASE + '/candidates/upload', { method: 'POST', headers: authHeaders(), body: formData }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Upload failed')
      return r.json()
    }),

  pipeline: (roleId) => req(`/pipeline/${roleId}`),
  pipelineSummary: (roleId) => req(`/pipeline/${roleId}/summary`),
  pipelineBoard: async (roleId) => {
    try {
      return await req(`/pipeline/${roleId}/board`)
    } catch {
      const apps = await req(`/pipeline/${roleId}`)
      return apps.map(enrichBoardRow)
    }
  },
  getApplication: (id) => req(`/applications/${id}`),
  moveStage: (id, stage, note = '') =>
    req(`/applications/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage, note }) }),
  updateNotes: (id, notes) =>
    req(`/applications/${id}/notes`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
  rescore: (id) => req(`/applications/${id}/score`, { method: 'PUT' }),
  rescoreAll: () => req('/applications/rescore-all', { method: 'POST' }),
  override: (id, body) => req(`/applications/${id}/override`, { method: 'PUT', body: JSON.stringify(body) }),

  emailTemplates: () => req('/comms/templates'),
  previewEmail: (body) => req('/comms/preview', { method: 'POST', body: JSON.stringify(body) }),
  sendEmail: (body) => req('/comms/send', { method: 'POST', body: JSON.stringify(body) }),
  sendBulkEmail: (body) => req('/comms/send-bulk', { method: 'POST', body: JSON.stringify(body) }),
  listEmails: (applicationId) => req(`/comms/emails?application_id=${applicationId}`),

  listInterviewRounds: (applicationId) => req(`/interview-rounds?application_id=${applicationId}`),
  myInterviews: () => req('/interview-rounds/mine'),
  submitPanelFeedback: (roundId, body) => req(`/interview-rounds/${roundId}/feedback`, { method: 'POST', body: JSON.stringify(body) }),
  createInterviewRound: (body) => req('/interview-rounds', { method: 'POST', body: JSON.stringify(body) }),
  bulkInterviewRounds: (body) => req('/interview-rounds/bulk', { method: 'POST', body: JSON.stringify(body) }),
  updateInterviewRound: (id, body) => req(`/interview-rounds/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteInterviewRound: (id) => req(`/interview-rounds/${id}`, { method: 'DELETE' }),

  listScreening: (applicationId) => req(`/screening?application_id=${applicationId}`),
  startScreening: (applicationId) => req('/screening/start', { method: 'POST', body: JSON.stringify({ application_id: applicationId }) }),
  answerScreening: (id, answer) => req(`/screening/${id}/answer`, { method: 'POST', body: JSON.stringify({ answer }) }),

  // Offers & contracts (AI draft → human approval)
  listDocuments: (applicationId) => req(`/documents?application_id=${applicationId}`),
  listAllDocuments: () => req('/documents'),
  listDocumentTemplates: () => req('/documents/templates'),
  generateDocument: (body) => req('/documents/generate', { method: 'POST', body: JSON.stringify(body) }),
  regenerateDocument: (id, body) => req(`/documents/${id}/regenerate`, { method: 'POST', body: JSON.stringify(body) }),
  approveDocument: (id, by = 'recruiter') => req(`/documents/${id}/approve`, { method: 'POST', body: JSON.stringify({ by }) }),
  uploadDocumentFile: (id, formData) =>
    fetch(BASE + `/documents/${id}/upload`, { method: 'POST', headers: authHeaders(), body: formData }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Upload failed')
      return r.json()
    }),
  documentUploadUrl: (id) => `${BASE}/documents/${id}/upload-file`,
  moveDocumentToOnboarding: (id, move = true) => req(`/documents/${id}/move-to-onboarding`, { method: 'POST', body: JSON.stringify({ move }) }),

  // Assessments (uploaded files sent to candidates)
  listAssessments: () => req('/assessments'),
  createAssessment: (formData) =>
    fetch(BASE + '/assessments', { method: 'POST', headers: authHeaders(), body: formData }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Upload failed')
      return r.json()
    }),
  deleteAssessment: (id) => req(`/assessments/${id}`, { method: 'DELETE' }),
  assessmentFileUrl: (id) => `${BASE}/assessments/${id}/file`,
  assessmentFileByIdUrl: (id, fileId) => `${BASE}/assessments/${id}/files/${fileId}`,
  draftAssessmentEmail: (id, body) => req(`/assessments/${id}/draft-email`, { method: 'POST', body: JSON.stringify(body) }),
  sendAssessment: (id, body) => req(`/assessments/${id}/send`, { method: 'POST', body: JSON.stringify(body) }),

  // Video interview (pre-defined questions, async one-way, open-source on-device transcription)
  setVideoQuestions: (jobId, questions) => req(`/jobs/${jobId}/video-questions`, { method: 'PATCH', body: JSON.stringify({ questions }) }),
  generateVideoQuestions: (applicationId) => req(`/video-interview/generate-questions?application_id=${applicationId}`, { method: 'POST' }),
  getVideoInterview: (applicationId) => req(`/video-interview?application_id=${applicationId}`),
  submitVideoAnswer: (interviewId, formData) =>
    fetch(BASE + `/video-interview/${interviewId}/answer`, { method: 'POST', body: formData }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Upload failed')
      return r.json()
    }),
  completeVideoInterview: (id) => req(`/video-interview/${id}/complete`, { method: 'POST' }),
  deleteVideoInterview: (id) => req(`/video-interview/${id}`, { method: 'DELETE' }),
  retranscribeVideo: (id) => req(`/video-interview/${id}/transcribe`, { method: 'POST' }),
  evaluateVideo: (id) => req(`/video-interview/${id}/evaluate`, { method: 'POST' }),
  videoAnswerUrl: (answerId) => `${BASE}/video-interview/answers/${answerId}/video`,
  // Single continuous (proctored) recording of the whole session
  submitVideoRecording: (interviewId, formData) =>
    fetch(BASE + `/video-interview/${interviewId}/recording`, { method: 'POST', body: formData }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Upload failed')
      return r.json()
    }),
  videoRecordingUrl: (interviewId) => `${BASE}/video-interview/${interviewId}/recording`,

  // Onboarding
  listOnboarding: (applicationId) => req(`/onboarding?application_id=${applicationId}`),
  listAllOnboarding: () => req('/onboarding'),
  generateOnboarding: (applicationId) => req('/onboarding/generate', { method: 'POST', body: JSON.stringify({ application_id: applicationId }) }),
  toggleOnboardingTask: (planId, taskId, done) => req(`/onboarding/${planId}/task`, { method: 'PATCH', body: JSON.stringify({ task_id: taskId, done }) }),
  updateOnboardingDetails: (planId, details) => req(`/onboarding/${planId}/details`, { method: 'PATCH', body: JSON.stringify({ details }) }),
}
