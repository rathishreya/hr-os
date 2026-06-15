/** Renders plain resume text with document-style formatting (sections, bullets, skill rows). */

const SECTION_HEADERS = new Set([
  'professional summary', 'summary', 'objective', 'profile',
  'technical skills', 'skills', 'core competencies',
  'internship experience', 'work experience', 'experience', 'employment history',
  'projects', 'education', 'certifications', 'achievements', 'awards',
  'additional information', 'languages', 'interests',
])

function isSectionHeader(line) {
  const t = line.trim()
  if (!t || t.length > 55) return false
  if (isBulletLine(t)) return false
  const lower = t.toLowerCase().replace(/:$/, '')
  if (SECTION_HEADERS.has(lower)) return true
  if (/^[A-Z][A-Za-z\s/&-]+$/.test(t) && t.split(/\s+/).length <= 6 && !t.includes(':')) return true
  return false
}

function isBulletLine(line) {
  const t = line.trim()
  return /^(\(cid:\d+\)|[\u2022\u2023\u25CF•\-\*]|–)\s*/.test(t) || /^-\s+\S/.test(t)
}

function cleanBullet(line) {
  return line.trim().replace(/^(\(cid:\d+\)|[\u2022\u2023\u25CF•\-\*]|–)\s*/, '').replace(/^-\s+/, '')
}

function parseCategoryLine(line) {
  const m = line.match(/^([A-Za-z][A-Za-z\s/&]{0,28}):\s*(.+)$/)
  if (!m || m[1].split(' ').length > 4) return null
  return { label: m[1], value: m[2] }
}

function isJobHeading(line) {
  const t = line.trim()
  return (
    t.length > 10
    && !isBulletLine(t)
    && !parseCategoryLine(t)
    && (/\(\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4})/i.test(t)
      || /\d{4}\s*[–—-]\s*\d{4}/.test(t)
      || /intern|engineer|developer|analyst|manager|lead/i.test(t))
  )
}

export function parseResumeDocument(text) {
  const raw = (text || '').trim()
  if (!raw) return null

  const lines = raw.split(/\r?\n/).map((l) => l.trim())
  const nonEmpty = lines.filter(Boolean)
  if (!nonEmpty.length) return null

  const name = nonEmpty[0]
  let i = 1
  const contactLines = []
  while (i < nonEmpty.length && !isSectionHeader(nonEmpty[i])) {
    contactLines.push(nonEmpty[i])
    i++
  }

  const sections = []
  while (i < nonEmpty.length) {
    if (!isSectionHeader(nonEmpty[i])) {
      i++
      continue
    }
    const title = nonEmpty[i]
    i++
    const content = []
    while (i < nonEmpty.length && !isSectionHeader(nonEmpty[i])) {
      content.push(nonEmpty[i])
      i++
    }
    sections.push({ title, lines: content })
  }

  return { name, contactLines, sections }
}

function ContactLine({ line }) {
  const parts = line.split(/\s*\|\s*/).filter(Boolean)
  if (parts.length <= 1) {
    return <p className="text-center text-sm text-slate-600">{line}</p>
  }
  return (
    <p className="text-center text-sm text-slate-600">
      {parts.map((part, idx) => (
        <span key={idx}>
          {idx > 0 && <span className="mx-2 text-slate-300">|</span>}
          <span>{part}</span>
        </span>
      ))}
    </p>
  )
}

function SectionContent({ lines }) {
  const blocks = []
  let bulletGroup = []

  function flushBullets() {
    if (!bulletGroup.length) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="mb-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700 marker:text-slate-400">
        {bulletGroup.map((b, j) => <li key={j} className="pl-1">{b}</li>)}
      </ul>,
    )
    bulletGroup = []
  }

  for (const line of lines) {
    if (isBulletLine(line)) {
      bulletGroup.push(cleanBullet(line))
      continue
    }
    flushBullets()

    const cat = parseCategoryLine(line)
    if (cat) {
      blocks.push(
        <p key={`cat-${blocks.length}`} className="mb-1.5 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">{cat.label}:</span>{' '}
          {cat.value}
        </p>,
      )
      continue
    }

    if (isJobHeading(line)) {
      blocks.push(
        <p key={`job-${blocks.length}`} className="mb-2 text-sm font-semibold text-slate-900">
          {line}
        </p>,
      )
      continue
    }

    blocks.push(
      <p key={`p-${blocks.length}`} className="mb-2 text-sm leading-relaxed text-slate-700">
        {line}
      </p>,
    )
  }
  flushBullets()
  return <>{blocks}</>
}

export default function FormattedResume({ text, className = '' }) {
  const doc = parseResumeDocument(text)

  if (!doc) {
    return (
      <p className="text-center text-sm text-slate-500">No resume text to display.</p>
    )
  }

  return (
    <article
      className={`mx-auto w-full max-w-3xl bg-white px-6 py-7 text-slate-800 sm:px-10 sm:py-9 ${className}`}
    >
      <header className="border-b border-slate-200 pb-5 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 text-balance">{doc.name}</h1>
        <div className="mx-auto mt-2.5 max-w-2xl space-y-0.5">
          {doc.contactLines.map((line, i) => (
            <ContactLine key={i} line={line} />
          ))}
        </div>
      </header>

      <div className="pt-6">
        {doc.sections.map((sec, i) => (
          <section key={i} className="mb-7 last:mb-0">
            <h2 className="mb-3 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-[0.12em] text-brand-700">
              {sec.title}
            </h2>
            <SectionContent lines={sec.lines} />
          </section>
        ))}
      </div>
    </article>
  )
}
