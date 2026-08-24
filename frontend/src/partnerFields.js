// Shared definition of the partner-intake fields. The public form (PartnerIntake) and the admin
// table (Partners) both use these so the `details` keys line up with what was imported into prod.
// Mirrors the "Hiring & Placement Collaboration" Google Form.

export const PARTNER_CATEGORIES = [
  { value: 'Hiring Vendor/ Recruitment Agency', label: 'Hiring Vendor / Recruitment Agency', kind: 'vendor',
    blurb: 'Recruitment agencies & staffing partners who source candidates for us.' },
  { value: 'College/ University/ Institute', label: 'College / University / Institute', kind: 'college',
    blurb: 'Campus placement cells for internships & campus hiring.' },
]

// Core (top-level) fields → mapped to the payload's named fields. `full` = full-width row.
export const coreFields = (kind) => [
  { name: 'organization', label: kind === 'vendor' ? 'Organization name' : 'College / University / Institute name', required: true, full: true },
  { name: 'website', label: 'Website or LinkedIn page link', required: true, placeholder: 'https://…' },
  { name: 'country', label: 'Country', required: true, placeholder: 'India' },
  { name: 'city', label: 'City / location', required: true },
  { name: 'contact_name', label: 'Point of contact name', required: true },
  { name: 'designation', label: 'Designation', required: true },
  { name: 'phone', label: 'Contact number (with country code)', required: true, placeholder: '+91 …' },
  { name: 'email', label: 'Official email', required: true, type: 'email' },
]

// Category-specific fields. `key` is the `details` map key (kept identical to the imported data).
// type: 'text' | 'textarea' | 'radio' | 'multi'. `other:true` adds an "Other" free-text option to a multi.
export const VENDOR_FIELDS = [
  { key: 'Geographies / Programs', label: 'Geographies you serve', required: true, type: 'multi', other: true,
    options: ['India', 'Asia-Pacific (excluding India)', 'Middle East', 'Europe', 'North America', 'South America', 'Africa'] },
  { key: 'Industries / Disciplines', label: 'Industries you specialize in', required: true, type: 'multi', other: true,
    options: ['IT / Technology', 'Design / Creative', 'Marketing / Digital', 'Sales / Business Development', 'Finance / Accounting', 'Operations / Supply Chain', 'HR / Admin', 'Legal', 'Engineering / Technical'] },
  { key: 'Hiring / Engagement Types', label: 'Types of hiring you support', required: true, type: 'multi', other: true,
    options: ['Full-Time', 'Part-Time', 'Freelancers / Consultants', 'Interns', 'Contractual', 'Remote / Global Roles'] },
  { key: 'Global Client Experience', label: 'Experience working with clients globally?', required: true, type: 'radio', options: ['Yes', 'No'] },
  { key: 'TAT / Internship Duration', label: 'Average TAT for closing a position', required: true, type: 'text', placeholder: 'e.g. 24–48 hours' },
  { key: 'Fee / Min Stipend', label: 'Fee structure / commercial model', required: true, type: 'textarea' },
  { key: 'Brochure / Profile', label: 'Company profile / brochure link (optional)', required: false, type: 'text', placeholder: 'https://… (Drive/website link)' },
]

export const COLLEGE_FIELDS = [
  { key: 'Geographies / Programs', label: 'Programs offered', required: true, type: 'multi', other: true,
    options: ['Undergraduate', 'Postgraduate', 'Diploma / Certificate Courses'] },
  { key: 'Industries / Disciplines', label: 'Disciplines / streams', required: true, type: 'multi', other: true,
    options: ['Engineering / Technology', 'Management / Business Studies', 'Design / Fine Arts', 'Computer Applications', 'Sciences', 'Humanities / Liberal Arts', 'Commerce'] },
  { key: 'Internship Season', label: 'Internship placement season timeline', required: true, type: 'text', placeholder: 'e.g. June–October 2026' },
  { key: 'TAT / Internship Duration', label: 'Internship duration allowed to students', required: true, type: 'text', placeholder: 'e.g. 2 months' },
  { key: 'Fee / Min Stipend', label: 'Minimum stipend criteria for internships', required: true, type: 'text', placeholder: 'e.g. ₹15,000/month' },
  { key: 'Full-Time Season', label: 'Full-time role placement season timeline', required: true, type: 'text', placeholder: 'e.g. September 2026' },
  { key: 'Min CTC', label: 'Minimum CTC criteria for full-time roles', required: true, type: 'text', placeholder: 'e.g. 6 LPA' },
  { key: 'Hiring / Engagement Types', label: 'Preferred modes of engagement', required: true, type: 'multi', other: true,
    options: ['Virtual Drives', 'On-Campus Drives', 'Internship Opportunities', 'Guest Sessions / Industry Talks'] },
  { key: 'Brochure / Profile', label: 'Placement brochure link (optional)', required: false, type: 'text', placeholder: 'https://… (Drive/website link)' },
]

export const fieldsForKind = (kind) => (kind === 'vendor' ? VENDOR_FIELDS : COLLEGE_FIELDS)
