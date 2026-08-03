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

// Currencies offered as the Budget / CTC prefix on the create/edit job form. INR is the
// default. The composed budget_ctc string keeps the code (e.g. "INR 20-28 LPA") so the
// backend salary parser (parse_budget_ctc) reads the figures and ignores the currency token.
export const CURRENCIES = [
  { code: 'INR', symbol: '₹' },
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
  { code: 'AED', symbol: 'د.إ' },
  { code: 'SGD', symbol: 'S$' },
]

// Canonical seed values for the creatable Department / Location dropdowns. Existing roles'
// values are merged in at runtime (see useFieldOptions), and recruiters can still type a
// brand-new value (free-text add) — these are just a sensible starting set.
// EZ's actual departments (de-duplicated from the org list).
export const DEPARTMENT_SEEDS = [
  'Delivery', 'Technology', 'Sales', 'Branding and Marketing', 'People',
  'Administration', 'CEOs Office', 'COOs Office', 'Director Office',
]

export const LOCATION_SEEDS = [
  'Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi NCR', 'Chennai',
  'Kolkata', 'Ahmedabad', 'Remote (India)', 'Remote',
]

// Seed values for the creatable Team dropdown (sits next to Department). Like the others, the
// org's own team values from existing roles are merged in at runtime and free-text is allowed.
// EZ's actual teams (de-duplicated from the org list).
export const TEAM_SEEDS = [
  'Visual Graphics Team', 'Operations', 'Product Development', 'Technology', 'Sales', 'Delivery',
  'Research and Data', 'Applied Research', 'Market Research Team', 'Branding and Marketing',
  'Product Operations', 'Client Relations', 'Corporate Development', 'Accounting', 'Facilities',
  'Administration', 'Human Resources', 'People', 'IT', 'Audio Visual Team', 'Animation Videos',
  'Language Services', 'Arabic Language Team', 'French Language Team', 'German Language Team',
  'Chinese Language Team', 'Urdu Language Team', 'Hindi Language Team', 'Turkish Language Team',
  'Other Language Team', 'CEOs Office', 'COOs Office', 'Director Office',
]

// Whether a requisition is a brand-new headcount or backfilling someone who left.
export const HIRE_TYPES = [
  { value: 'new', label: 'New' },
  { value: 'replacement', label: 'Replacement' },
]

