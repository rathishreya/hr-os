/** Parse lightweight inline markup used in document text into styled segments.
 *   **bold**   -> bold
 *   __underline__ -> underline
 * Returns [{ text, bold, underline }]. Non-nested; plain text passes through unchanged.
 *
 * The underline run must begin and end with a non-space, non-underscore character. Without that
 * guard it swallowed the fill-in blanks these contracts are full of: the execution line
 * "executed as of the __ day of _______ 20__." parsed "__ day of __" as an underline and printed
 * "executed as of the  day of ___ 20." — the blanks gone and the words underlined instead. A rule
 * of underscores is a line somebody writes a date on, not markup. */
export function richSegments(text) {
  const s = String(text == null ? '' : text)
  const re = /\*\*([^*]+)\*\*|__([^_\s](?:[^_]*[^_\s])?)__/g
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
