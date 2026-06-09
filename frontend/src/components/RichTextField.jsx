import { useRef } from 'react'
import { Bold, Italic, Underline, List, IndentIncrease } from 'lucide-react'
import { Field } from '../ui'

// A textarea with a small formatting toolbar that inserts the shared markdown subset
// (**bold**, *italic*, __underline__, "- " bullets, "  - " sub-bullets). `onChange`
// receives the new string value. Pairs with utils/richText.js + the careers renderer.
export default function RichTextField({ label, hint, value, onChange, rows = 4 }) {
  const ref = useRef(null)

  const wrap = (mark) => {
    const el = ref.current
    if (!el) return
    const s = el.selectionStart
    const e = el.selectionEnd
    const v = value || ''
    const sel = v.slice(s, e) || 'text'
    onChange(v.slice(0, s) + mark + sel + mark + v.slice(e))
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = s + mark.length
      el.selectionEnd = s + mark.length + sel.length
    })
  }

  const prefixLine = (prefix) => {
    const el = ref.current
    if (!el) return
    const s = el.selectionStart
    const v = value || ''
    const lineStart = v.lastIndexOf('\n', s - 1) + 1
    onChange(v.slice(0, lineStart) + prefix + v.slice(lineStart))
    requestAnimationFrame(() => {
      el.focus()
      const p = s + prefix.length
      el.selectionStart = p
      el.selectionEnd = p
    })
  }

  const btn = 'rounded p-1.5 text-slate-500 transition-colors duration-150 ease-snappy hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40'
  const noBlur = (e) => e.preventDefault() // keep the textarea selection when a button is clicked

  return (
    <Field label={label} hint={hint}>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white transition-colors duration-150 ease-snappy focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
        <div className="flex items-center gap-0.5 border-b border-slate-100 bg-slate-50/70 px-1.5 py-1">
          <button type="button" title="Bold" aria-label="Bold" onMouseDown={noBlur} onClick={() => wrap('**')} className={btn}><Bold className="h-3.5 w-3.5" /></button>
          <button type="button" title="Italic" aria-label="Italic" onMouseDown={noBlur} onClick={() => wrap('*')} className={btn}><Italic className="h-3.5 w-3.5" /></button>
          <button type="button" title="Underline" aria-label="Underline" onMouseDown={noBlur} onClick={() => wrap('__')} className={btn}><Underline className="h-3.5 w-3.5" /></button>
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <button type="button" title="Bullet point" aria-label="Bullet point" onMouseDown={noBlur} onClick={() => prefixLine('- ')} className={btn}><List className="h-3.5 w-3.5" /></button>
          <button type="button" title="Sub-point (indent)" aria-label="Sub-point" onMouseDown={noBlur} onClick={() => prefixLine('  - ')} className={btn}><IndentIncrease className="h-3.5 w-3.5" /></button>
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full resize-y bg-transparent px-3 py-2 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none"
          style={{ minHeight: `${rows * 1.6}rem` }}
        />
      </div>
    </Field>
  )
}
