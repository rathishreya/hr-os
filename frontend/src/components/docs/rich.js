/** Parse lightweight inline markup used in document text into styled segments.
 *   **bold**   -> bold
 *   __underline__ -> underline
 * Returns [{ text, bold, underline }]. Non-nested; plain text passes through unchanged. */
export function richSegments(text) {
  const s = String(text == null ? '' : text)
  const re = /\*\*([^*]+)\*\*|__([^_]+)__/g
  const out = []
  let last = 0
  let m
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), bold: false, underline: false })
    if (m[1] != null) out.push({ text: m[1], bold: true, underline: false })
    else out.push({ text: m[2], bold: false, underline: true })
    last = re.lastIndex
  }
  if (last < s.length) out.push({ text: s.slice(last), bold: false, underline: false })
  return out.length ? out : [{ text: s, bold: false, underline: false }]
}
