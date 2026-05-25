// Thin API client. In dev, calls go through the Vite proxy ('/api'). In a hosted
// split deploy (static frontend + separate backend), set VITE_API_BASE at build time
// to the backend's absolute API URL, e.g. https://hr-os-backend.onrender.com/api
const BASE = import.meta.env.VITE_API_BASE || '/api'

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
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
  aiStatus: () => req('/ai-status'),
  company: () => req('/company'),
  analytics: () => req('/analytics/overview'),
  publishJob: (jobId, platforms = []) => req(`/jobs/${jobId}/publish`, { method: 'POST', body: JSON.stringify({ platforms }) }),
  distributionChannels: () => req('/distribution/channels'),

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
  updateRole: (id, body) => req(`/hiring-requests/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  duplicateRole: (id) => req(`/hiring-requests/${id}/duplicate`, { method: 'POST' }),
  deleteRole: (id) => req(`/hiring-requests/${id}`, { method: 'DELETE' }),
  generateJD: (id) => req(`/hiring-requests/${id}/generate-jd`, { method: 'POST' }),
  getJD: (id) => req(`/hiring-requests/${id}/job`),

  listCandidates: (q = '') => req(`/candidates${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  listCandidatesTable: (q = '') => req(`/candidates?table=1${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  reparseAllCandidates: () => req('/candidates/reparse-all', { method: 'POST' }),
  getCandidate: (id) => req(`/candidates/${id}`),
  getCandidateProfile: (id) => req(`/candidates/${id}/profile`),
  createCandidate: (body) => req('/candidates', { method: 'POST', body: JSON.stringify(body) }),
  applyCandidate: (candId, hiringRequestId) =>
    req(`/candidates/${candId}/apply`, { method: 'POST', body: JSON.stringify({ hiring_request_id: hiringRequestId }) }),
  uploadCandidate: (formData) =>
    fetch(BASE + '/candidates/upload', { method: 'POST', body: formData }).then(async (r) => {
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
  override: (id, body) => req(`/applications/${id}/override`, { method: 'PUT', body: JSON.stringify(body) }),

  emailTemplates: () => req('/comms/templates'),
  sendEmail: (body) => req('/comms/send', { method: 'POST', body: JSON.stringify(body) }),
  listEmails: (applicationId) => req(`/comms/emails?application_id=${applicationId}`),

  listInterviewRounds: (applicationId) => req(`/interview-rounds?application_id=${applicationId}`),
  createInterviewRound: (body) => req('/interview-rounds', { method: 'POST', body: JSON.stringify(body) }),
  updateInterviewRound: (id, body) => req(`/interview-rounds/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteInterviewRound: (id) => req(`/interview-rounds/${id}`, { method: 'DELETE' }),

  listScreening: (applicationId) => req(`/screening?application_id=${applicationId}`),
  startScreening: (applicationId) => req('/screening/start', { method: 'POST', body: JSON.stringify({ application_id: applicationId }) }),
  answerScreening: (id, answer) => req(`/screening/${id}/answer`, { method: 'POST', body: JSON.stringify({ answer }) }),

  // Offers & contracts (AI draft → human approval)
  listDocuments: (applicationId) => req(`/documents?application_id=${applicationId}`),
  generateDocument: (body) => req('/documents/generate', { method: 'POST', body: JSON.stringify(body) }),
  approveDocument: (id, by = 'recruiter') => req(`/documents/${id}/approve`, { method: 'POST', body: JSON.stringify({ by }) }),

  // Video interview (pre-defined questions, async one-way, open-source on-device transcription)
  setVideoQuestions: (jobId, questions) => req(`/jobs/${jobId}/video-questions`, { method: 'PATCH', body: JSON.stringify({ questions }) }),
  getVideoInterview: (applicationId) => req(`/video-interview?application_id=${applicationId}`),
  submitVideoAnswer: (interviewId, formData) =>
    fetch(BASE + `/video-interview/${interviewId}/answer`, { method: 'POST', body: formData }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Upload failed')
      return r.json()
    }),
  completeVideoInterview: (id) => req(`/video-interview/${id}/complete`, { method: 'POST' }),
  deleteVideoInterview: (id) => req(`/video-interview/${id}`, { method: 'DELETE' }),
  retranscribeVideo: (id) => req(`/video-interview/${id}/transcribe`, { method: 'POST' }),
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
  generateOnboarding: (applicationId) => req('/onboarding/generate', { method: 'POST', body: JSON.stringify({ application_id: applicationId }) }),
  toggleOnboardingTask: (planId, taskId, done) => req(`/onboarding/${planId}/task`, { method: 'PATCH', body: JSON.stringify({ task_id: taskId, done }) }),
}
