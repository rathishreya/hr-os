// Free job boards offered at posting time. Shared by the create-job form and the
// publish dialog so the two never drift. Keys match the backend distribution channels.
export const POST_PLATFORMS = [
  { id: 'google_jobs', label: 'Google for Jobs' },
  { id: 'indeed', label: 'Indeed' },
  { id: 'adzuna', label: 'Adzuna' },
  { id: 'jooble', label: 'Jooble' },
  { id: 'careerjet', label: 'Careerjet' },
  { id: 'talent', label: 'Talent.com' },
  { id: 'jora', label: 'Jora' },
  { id: 'whatjobs', label: 'WhatJobs' },
]

// Interview round types. Values MUST match the backend VALID_TYPES in
// routers/interview_rounds.py. Shared by the create-job plan, the per-candidate planner,
// and the bulk-apply dialog so the three never drift.
export const INTERVIEW_TYPES = [
  { value: 'screening', label: 'Screening round' },
  { value: 'assessment', label: 'Assessment round' },
  { value: 'technical', label: 'Technical round' },
  { value: 'ai_interview', label: 'AI Interview round' },
  { value: 'round_1', label: 'Round 1' },
  { value: 'round_2', label: 'Round 2' },
  { value: 'round_3', label: 'Round 3' },
  { value: 'round_4', label: 'Round 4' },
  { value: 'final', label: 'Final round' },
]

export const INTERVIEW_TYPE_LABEL = Object.fromEntries(INTERVIEW_TYPES.map((t) => [t.value, t.label]))

