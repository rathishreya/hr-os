// Lightweight, SAFE formatting subset shared with the backend careers renderer:
// **bold**, *italic*, __underline__, and "- " / "  - " bullets (2-space indent = sub-bullet).
// Always escapes first, then maps only known tokens to tags — no raw HTML passes through.

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
}

// Free text → HTML: blank line = paragraph break, "- "/"* " lines = bullets (2-space indent = sub).
export function richToHtml(text) {
  const out = []
  let depth = 0
  const closeTo = (t) => { while (depth > t) { out.push('</ul>'); depth-- } }
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) { closeTo(0); continue }
    const m = line.match(/^(\s*)[-*]\s+(.*)$/)
    if (m) {
      const want = m[1].length >= 2 ? 2 : 1
      while (depth < want) { out.push('<ul>'); depth++ }
      closeTo(want)
      out.push(`<li>${inline(m[2].trim())}</li>`)
    } else {
      closeTo(0)
      out.push(`<p>${inline(line.trim())}</p>`)
    }
  }
  closeTo(0)
  return out.join('')
}

// A stored list of line-strings → nested <ul> (item indented 2+ spaces nests under the previous).
export function richListToHtml(items) {
  const list = (items || []).map(String).filter((i) => i.trim())
  if (!list.length) return ''
  const out = ['<ul>']
  let liOpen = false
  let subOpen = false
  for (const it of list) {
    const indent = it.length - it.replace(/^\s+/, '').length
    let body = it.trim()
    if (body.slice(0, 2) === '- ' || body.slice(0, 2) === '* ') body = body.slice(2).trim()
    const content = inline(body)
    if (indent >= 2) {
      if (!subOpen) { out.push('<ul>'); subOpen = true }
      out.push(`<li>${content}</li>`)
    } else {
      if (subOpen) { out.push('</ul>'); subOpen = false }
      if (liOpen) out.push('</li>')
      out.push(`<li>${content}`); liOpen = true
    }
  }
  if (subOpen) out.push('</ul>')
  if (liOpen) out.push('</li>')
  out.push('</ul>')
  return out.join('')
}
