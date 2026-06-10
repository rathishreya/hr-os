// Mirror of backend services/salary.py — keeps the in-app JD preview / copy blocks consistent
// with the public careers page. The recruiter's budget_ctc is the single source of truth for
// displayed salary; any salary figure the AI baked into the JD text is rewritten to it (or
// stripped when no budget is set). Non-salary numbers (years, head-counts, %, dates, phones)
// are never touched. Keep this in sync with the Python version.

// Unit-anchored salary detector: a match needs a lakh-family unit (L/LPA/lakh/lac) OR a
// currency token (₹/Rs/INR) paired with a pay period.
const SALARY_SRC = String.raw`(?<![A-Za-z])(?:(?:(?:₹|\bRs\.?|\bINR\b)\s*)?\d[\d,]*(?:\.\d+)?(?:\s*(?:-|–|—|to|and)\s*(?:(?:₹|\bRs\.?|\bINR\b)\s*)?\d[\d,]*(?:\.\d+)?)?\s*(?:L|LPA|lakhs?|lacs?)\b(?:\s*(?:per\s+annum|p\.?\s?a\.?|per\s+year|/\s?year|annually|per\s+month|/\s?month|p\.?\s?m\.?)\b)?|(?:₹|\bRs\.?|\bINR\b)\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:-|–|—|to|and)\s*(?:(?:₹|\bRs\.?|\bINR\b)\s*)?\d[\d,]*(?:\.\d+)?)?\s*(?:per\s+annum|p\.?\s?a\.?|per\s+year|/\s?year|annually|per\s+month|/\s?month|p\.?\s?m\.?)\b)`

const NEG_CONTEXT = /\b(discount|subscription|refund|cashback|fee|fine|penalty)\b/i

function hasSalary(line) {
  return new RegExp(SALARY_SRC, 'i').test(line) && !NEG_CONTEXT.test(line)
}

function tidy(s) {
  return s
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+([+&/])\s+(?=[.,;:]|$)/g, ' ')
    .replace(/^[\s;,]+/, '')
    .trim()
}

const LABEL_RE = /^\s*(?:competitive\s+)?(?:salary|compensation|remuneration|pay(?:\s*band)?|ctc|stipend|budget)[^A-Za-z0-9]*(?:range\s+of|of|is|:)?\s*/i

export function canonicalizeSalary(text, budget) {
  if (!text) return text
  budget = (budget || '').trim()
  const out = []
  for (const raw of String(text).split('\n')) {
    if (!hasSalary(raw)) { out.push(raw); continue }
    const indent = raw.slice(0, raw.length - raw.trimStart().length)
    const body = raw.trim()
    if (budget) {
      let used = false
      const sub = body.replace(new RegExp(SALARY_SRC, 'gi'), () => {
        if (used) return ''
        used = true
        return budget
      })
      out.push(indent + tidy(sub))
    } else {
      const stripped = tidy(body.replace(new RegExp(SALARY_SRC, 'gi'), ''))
      // Drop the line if only a salary label/punctuation remains; else keep the rest.
      if (!/[A-Za-z0-9]/.test(stripped.replace(LABEL_RE, ''))) continue
      out.push(indent + stripped)
    }
  }
  return out.join('\n')
}

export function canonicalizeSalaryList(items, budget) {
  const res = []
  for (const it of (items || [])) {
    const s = canonicalizeSalary(String(it), budget)
    if (s.trim()) res.push(s)
  }
  return res
}
