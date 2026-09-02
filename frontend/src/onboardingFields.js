// The onboarding form the People team sends with an offer letter.
//
// One definition, used by three things: the public form a candidate fills in, the validation that
// decides whether it can be submitted, and the panel HR reads and edits afterwards. Keeping them
// on one list is why the partner intake works (see partnerFields.js) — where the form and the
// table drift apart, the stored keys stop lining up with what anyone can see.
//
// `key` is the storage key. It never changes once data exists, even if the label does.

/** Who is filling it in. The three respondent types differ by hidden fields and by wording. */
export const VARIANTS = [
  { value: 'individual', label: 'Employee', blurb: 'Joining EZ Lab on a full-time or part-time contract.' },
  { value: 'freelancer', label: 'Freelancer / Consultant', blurb: 'Engaged for a defined scope of work, invoicing us.' },
  { value: 'organization', label: 'Organization / Agency', blurb: 'A company contracting with us, not an individual.' },
]

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', "Don't know"]
export const ACCOUNT_TYPES = ['Savings', 'Current']
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'SGD', 'AUD', 'CAD', 'Other']
export const RELATIONSHIPS = ['Parent', 'Spouse', 'Sibling', 'Child', 'Friend', 'Other']
export const YES_NO = ['Yes', 'No']

// Trimmed to the countries EZ actually hires from and contracts with, plus an Other escape. A full
// ISO list in a dropdown is 250 rows a candidate has to scroll past to find their own.
export const COUNTRIES = [
  'India', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Oman', 'Kuwait', 'Bahrain',
  'United Kingdom', 'United States', 'Canada', 'Australia', 'Singapore', 'Germany', 'France',
  'Netherlands', 'Ireland', 'Philippines', 'Sri Lanka', 'Nepal', 'Bangladesh', 'Other',
]

/**
 * A field.
 *   key       storage key — never rename once data exists
 *   label     default wording
 *   labels    per-variant wording, e.g. { organization: 'Legal Name of Entity' }
 *   type      text | email | tel | number | date | textarea | select | radio | file
 *   hide      variants that do not see this field at all
 *   required  true, false, or a function of the current answers (conditional)
 *   help      a line under the input, for anything the label cannot carry
 *   accept    file inputs only
 *   pattern   a RegExp the value must match when non-empty
 *   invalid   the message shown when `pattern` fails
 *   section   the heading it sits under
 */
const IMAGE = 'image/jpeg,image/png'
const DOC = 'application/pdf,image/jpeg,image/png'

export const SECTIONS = [
  { id: 'you', title: 'About you', blurb: 'As it appears on your government ID — this is what goes on your paperwork.' },
  { id: 'identity', title: 'Identity & documents', blurb: 'Clear photographs are fine; every file stays private to the People team.' },
  { id: 'employment', title: 'Employment history', blurb: 'So payroll can set up your provident fund correctly.' },
  { id: 'bank', title: 'Bank details', blurb: 'Where your salary is paid. Check the account number twice.' },
  { id: 'emergency', title: 'Emergency contact', blurb: 'Someone we can reach if we cannot reach you.' },
]

export const FIELDS = [
  // ── About you ─────────────────────────────────────────────────────────────────────────────
  {
    key: 'email', label: 'Email address', type: 'email', required: true, section: 'you',
    help: 'Where we send everything about your joining. Use a personal address you will keep.',
  },
  {
    key: 'legal_name', label: 'Your name, exactly as on your national ID', type: 'text', required: true,
    labels: { organization: 'Legal name of the entity' }, section: 'you',
    help: 'A mismatch here is the single most common reason payroll and PF registration get stuck.',
  },
  {
    key: 'photo', label: 'Your photograph', type: 'file', accept: IMAGE, required: true,
    hide: ['organization'], section: 'you', help: 'JPG or PNG, up to 5 MB. A plain head-and-shoulders photo.',
  },
  {
    key: 'dob', label: 'Date of birth', type: 'date', required: true,
    hide: ['organization'], section: 'you',
  },
  {
    key: 'blood_group', label: 'Blood group', type: 'select', options: BLOOD_GROUPS, required: true,
    hide: ['freelancer', 'organization'], section: 'you',
    help: 'Held for medical emergencies only.',
  },
  {
    key: 'mobile', label: 'Mobile number', type: 'tel', required: true,
    labels: { organization: 'Contact number of your SPOC' }, section: 'you',

  },
  {
    key: 'whatsapp', label: 'WhatsApp number', type: 'tel', required: false,
    labels: { organization: 'WhatsApp number of your SPOC' }, section: 'you',
    help: 'Only if it differs from the number above.',
  },
  {
    key: 'nationality', label: 'Nationality', type: 'select', options: COUNTRIES, required: true,
    labels: { organization: 'Location' }, section: 'you',
  },
  {
    key: 'permanent_address', label: 'Permanent address', type: 'textarea', required: true,
    labels: { organization: 'Registered address' }, hide: ['freelancer'], section: 'you',
  },
  {
    key: 'current_address', label: 'Current address', type: 'textarea', required: true,
    hide: ['freelancer', 'organization'], section: 'you',
    help: 'Where you are living now, if it differs from your permanent address.',
  },

  // ── Identity & documents ──────────────────────────────────────────────────────────────────
  {
    key: 'national_id_number', label: 'Aadhaar / national ID number', type: 'text', required: true,
    labels: { organization: 'GST / trade licence number' }, section: 'identity',
  },
  {
    key: 'national_id_file', label: 'Aadhaar / national ID', type: 'file', accept: DOC, required: true,
    labels: { organization: 'Copy of your GST / trade licence' }, section: 'identity',
    help: 'PDF or image, up to 5 MB.',
  },
  {
    key: 'passport_file', label: 'Passport', type: 'file', accept: DOC, required: false,
    hide: ['freelancer', 'organization'], section: 'identity',
    help: 'Optional, but needed before any work travel.',
  },
  {
    key: 'pan_number', label: 'PAN number', type: 'text', required: false, hide: ['freelancer'],
    section: 'identity', pattern: /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/,
    invalid: 'A PAN is five letters, four digits, then a letter — like ABCDE1234F.',
  },
  {
    key: 'pan_file', label: 'PAN card', type: 'file', accept: DOC, required: false,
    hide: ['freelancer'], section: 'identity',
  },
  {
    key: 'highschool_file', label: 'High school certificate', type: 'file', accept: DOC, required: true,
    hide: ['freelancer', 'organization'], section: 'identity',
  },
  {
    key: 'graduation_file', label: 'Graduation degree', type: 'file', accept: DOC, required: false,
    hide: ['freelancer', 'organization'], section: 'identity', help: 'If you have one.',
  },
  {
    key: 'postgrad_file', label: 'Post-graduation degree', type: 'file', accept: DOC, required: false,
    hide: ['freelancer', 'organization'], section: 'identity', help: 'If you have one.',
  },
  {
    key: 'signed_offer_file', label: 'Your signed offer letter', type: 'file', accept: DOC, required: true,
    labels: { organization: 'Signed copy of the agreement', freelancer: 'Your signed contract' },
    section: 'identity', help: 'The copy you signed and returned — or the email in which you accepted.',
  },

  // ── Employment history ────────────────────────────────────────────────────────────────────
  {
    key: 'first_job', label: 'Is this your first job?', type: 'radio', options: YES_NO, required: true,
    hide: ['freelancer', 'organization'], section: 'employment',
  },
  {
    key: 'has_pf', label: 'Do you already have a provident fund account?', type: 'radio', options: YES_NO,
    required: true, hide: ['freelancer', 'organization'], section: 'employment',
  },
  {
    key: 'uan', label: 'UAN', type: 'text', hide: ['freelancer', 'organization'], section: 'employment',
    // The spec left this one open ("???"). It is required exactly when there is a PF account to
    // attach it to, and meaningless otherwise.
    required: (a) => a.has_pf === 'Yes',
    pattern: /^\d{12}$/, invalid: 'A UAN is 12 digits.',
    help: 'Your Universal Account Number, from your previous employer.',
  },

  // ── Bank details ──────────────────────────────────────────────────────────────────────────
  {
    key: 'upi', label: 'UPI ID or PayPal', type: 'text', required: false, section: 'bank',
    help: 'For reimbursements. Optional.',
  },
  { key: 'beneficiary_name', label: 'Account holder name', type: 'text', required: true, section: 'bank',
    help: 'Exactly as your bank has it.' },
  { key: 'bank_name', label: 'Bank name', type: 'text', required: true, section: 'bank' },
  { key: 'bank_branch', label: 'Branch address', type: 'textarea', required: true, section: 'bank' },
  {
    key: 'account_number', label: 'Account number', type: 'text', required: true, section: 'bank',
    pattern: /^[0-9]{6,20}$/, invalid: 'An account number is 6 to 20 digits.',
  },
  {
    key: 'ifsc_swift', label: 'IFSC or SWIFT code', type: 'text', required: true, section: 'bank',
    help: 'IFSC for an Indian account, SWIFT/BIC for any other.',
  },
  {
    key: 'iban', label: 'IBAN', type: 'text', required: false, section: 'bank',
    help: 'Only if your country uses one — most transfers outside India need it.',
  },
  { key: 'account_type', label: 'Account type', type: 'select', options: ACCOUNT_TYPES, required: true, section: 'bank' },
  {
    key: 'bank_proof_file', label: 'Cancelled cheque, passbook or bank statement', type: 'file',
    accept: DOC, required: true, section: 'bank',
    help: 'Anything showing the account number and the account holder name together.',
  },
  {
    key: 'salary_currency', label: 'Which currency should we pay you in?', type: 'select',
    options: CURRENCIES, required: true, section: 'bank',
  },
  {
    // For an organisation the owner reworded this as a yes/no, so it is a different question with
    // a different answer set rather than the same one relabelled.
    key: 'needs_india_account', label: 'Do you need a salary account in India?', type: 'radio',
    options: YES_NO, required: true, only: ['organization'], section: 'bank',
  },
  {
    key: 'bank_currency', label: "Your bank's own currency", type: 'select', options: CURRENCIES,
    required: true, section: 'bank',
    help: 'The currency the account accepts. If we pay in another, your bank will convert.',
  },

  // ── Emergency contact ─────────────────────────────────────────────────────────────────────
  {
    key: 'emergency_name', label: 'Name', type: 'text', required: true,
    hide: ['freelancer', 'organization'], section: 'emergency',
  },
  {
    key: 'emergency_relationship', label: 'Relationship', type: 'select', options: RELATIONSHIPS,
    required: true, hide: ['freelancer', 'organization'], section: 'emergency',
  },
  {
    key: 'emergency_phone', label: 'Their contact number', type: 'tel', required: true,
    hide: ['freelancer', 'organization'], section: 'emergency', help: 'Mobile or landline.',
  },
  {
    key: 'emergency_phone_india', label: 'A number we can reach in India', type: 'tel', required: false,
    hide: ['freelancer', 'organization'], section: 'emergency',
    help: 'If your emergency contact is outside India.',
  },
]

/** The fields a given respondent actually sees, in order. */
export function fieldsFor(variant) {
  return FIELDS.filter((f) => {
    if (f.only) return f.only.includes(variant)
    return !(f.hide || []).includes(variant)
  })
}

/** The label this respondent sees. */
export const labelFor = (f, variant) => (f.labels && f.labels[variant]) || f.label

/** Is this field required, given what has been answered so far? */
export const isRequired = (f, answers) =>
  (typeof f.required === 'function' ? f.required(answers || {}) : !!f.required)

export const isFile = (f) => f.type === 'file'

export const MAX_FILE_BYTES = 5 * 1024 * 1024

/**
 * Every problem with the current answers, keyed by field. Empty means it can be submitted.
 * Shared by the public form and the HR panel so both agree on what "complete" means.
 */
export function validate(variant, answers, files) {
  const errors = {}
  for (const f of fieldsFor(variant)) {
    const raw = isFile(f) ? (files || {})[f.key] : (answers || {})[f.key]
    const value = typeof raw === 'string' ? raw.trim() : raw
    if (isRequired(f, answers) && !value) {
      errors[f.key] = `${labelFor(f, variant)} is needed.`
      continue
    }
    if (!value) continue
    if (isFile(f)) {
      if (value.size > MAX_FILE_BYTES) errors[f.key] = 'That file is over 5 MB.'
      continue
    }
    if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors[f.key] = 'That does not look like an email address.'
    } else if (f.type === 'tel' && !/^[+]?[\d\s()-]{7,20}$/.test(value)) {
      errors[f.key] = 'That does not look like a phone number.'
    } else if (f.pattern && !f.pattern.test(value)) {
      errors[f.key] = f.invalid || 'That is not a valid entry.'
    }
  }
  return errors
}
