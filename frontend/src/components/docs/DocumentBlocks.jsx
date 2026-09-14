import { richSegments } from './rich'
import { isClause, selfMarked, sigCaptionLines } from './docHtml'
import { signImageFor } from './signatureAssets'

// The real handwritten sign where we hold the artwork; Great Vibes stand-in otherwise.
function ScriptSign({ text, height }) {
  const img = signImageFor(text)
  if (img) return <img src={img} alt={text} style={{ height, margin: '4px 0' }} />
  return <span style={SCRIPT_STYLE}>{text}</span>
}

/**
 * Renders a structured EZ Lab document (offer letter / contract) from its `blocks`, matching the
 * source PDF: bold/underline inline marks, bordered Schedule A + Compensation tables, signatures.
 * Falls back to a plain <pre> of `content` when there are no blocks (legacy AI docs).
 */
function Rich({ text }) {
  return (
    <>
      {richSegments(text).map((seg, i) => {
        if (!seg.bold && !seg.underline) return seg.text
        const cls = `${seg.bold ? 'font-semibold text-slate-800' : ''} ${seg.underline ? 'underline' : ''}`.trim()
        return <span key={i} className={cls}>{seg.text}</span>
      })}
    </>
  )
}

function StrongPrefix({ text, prefix }) {
  // The sources set a clause number in regular weight with only the label bold, so a leading
  // "N. " is split out of the bold span.
  const Bold = ({ children }) => <strong className="font-semibold text-slate-800">{children}</strong>
  const BoldPrefix = ({ p }) => {
    const m = /^(\s*\d{1,2}(?:\.\d+)?[.)]?\s+)([\s\S]*)$/.exec(p)
    return m ? (<>{m[1]}<Bold>{m[2]}</Bold></>) : <Bold>{p}</Bold>
  }
  // prefix already embedded at the start of text (e.g. a name/signatory line): bold just that span.
  if (prefix && text.startsWith(prefix)) {
    return (<><BoldPrefix p={prefix} /><Rich text={text.slice(prefix.length)} /></>)
  }
  if (prefix && !text) return <BoldPrefix p={prefix} />
  // prefix is a standalone label (e.g. "Effectiveness", "Termination"): render "Label: body".
  if (prefix) return (<><BoldPrefix p={prefix} /><Bold>: </Bold><Rich text={text} /></>)
  return <Rich text={text} />
}

function MiniBlocks({ blocks }) {
  // Cells of a Schedule A row can hold any block — a compensation table, a rate grid, a heading —
  // so render them through the same switch as the top level rather than assuming para/list.
  return (
    <div className="space-y-1.5">
      {(blocks || []).map((b, i) =>
        b.type === 'list' ? (
          <List key={i} block={b} dense />
        ) : b.type === 'para' || !b.type ? (
          <p key={i} className="text-sm leading-relaxed text-slate-700"><StrongPrefix text={b.text || ''} prefix={b.strong_prefix} /></p>
        ) : (
          renderBlock(b, i)
        ),
      )}
    </div>
  )
}

function List({ block, dense = false }) {
  const Tag = block.ordered ? 'ol' : 'ul'
  // Self-marked items (A., a), (i), iii.) are set without bullets in the sources.
  const plain = !block.ordered && selfMarked(block.items)
  return (
    <Tag
      start={block.ordered && block.start ? Number(block.start) : undefined}
      className={`${plain ? 'list-none pl-3 [&>li]:pl-8 [&>li]:-indent-8' : block.ordered ? 'list-decimal pl-6' : 'list-disc pl-6'} space-y-1 text-sm leading-relaxed text-slate-700 marker:text-slate-500 ${dense ? '' : 'my-1'}`}
    >
      {/* An item may be {text, subs}: a bullet with its own indented second level. */}
      {(block.items || []).map((it, i) => (
        <li key={i}>
          <Rich text={it && typeof it === 'object' ? it.text || '' : it} />
          {it && typeof it === 'object' && (it.subs || []).length > 0 && (
            <ul className="mt-1 list-[circle] space-y-1 pl-6 marker:text-slate-500">
              {it.subs.map((s, j) => (<li key={j}><Rich text={s} /></li>))}
            </ul>
          )}
        </li>
      ))}
    </Tag>
  )
}

function TermsTable({ block }) {
  return (
    <table className="w-full border-collapse text-sm">
      <tbody>
        {(block.rows || []).map((row, i) => (
          <tr key={i} className="border border-slate-300 align-top">
            <th className="w-44 border border-slate-300 bg-slate-50 p-2.5 text-left font-semibold text-slate-700">{row.label}</th>
            <td className="border border-slate-300 p-2.5"><MiniBlocks blocks={row.blocks} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const CELL = 'border border-[#333] px-2 py-[2px]'

function CompTable({ block }) {
  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={`${CELL} bg-[#D9D9D9] text-left font-semibold text-slate-800`}>Component</th>
            <th className={`${CELL} bg-[#D9D9D9] text-right font-semibold text-slate-800`}>INR</th>
          </tr>
        </thead>
        <tbody>
          {(block.rows || []).map((row, i) => (
            <tr key={i} className={row.emphasis ? 'bg-[#D9D9D9] font-semibold text-slate-900' : 'text-slate-700'}>
              <td className={CELL}>{row.label}</td>
              <td className={`${CELL} text-right tabular-nums`}>{row.value}</td>
            </tr>
          ))}
          {(block.notes || []).length > 0 && (
            <tr>
              <td colSpan={2} className={CELL}><u><strong className="font-semibold">Important Points</strong></u></td>
            </tr>
          )}
          {(block.notes || []).map((n, i) => (
            <tr key={`note-${i}`}>
              <td colSpan={2} className={`${CELL} text-[12px] italic text-slate-700`}>{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {block.known === false && (
        <p className="mt-1.5 text-xs text-amber-600">No CTC on this role — amounts show ₹ —. Add the Annual CTC and regenerate to fill the breakdown.</p>
      )}
    </div>
  )
}

function GridTable({ block }) {
  const cell = (i) => (block.align?.[i] === 'right' ? 'text-right tabular-nums' : block.align?.[i] === 'center' ? 'text-center' : 'text-left')
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {(block.columns || []).map((c, i) => (
              <th key={i} className={`border border-slate-300 bg-slate-100 p-2 font-semibold text-slate-700 ${cell(i)}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(block.rows || []).map((row, ri) => (
            <tr key={ri} className="text-slate-700">
              {(row || []).map((v, ci) => (
                <td key={ci} className={`border border-slate-300 p-2 ${cell(ci)}`}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const SCRIPT_STYLE = { fontFamily: "'Great Vibes', cursive", fontSize: '26px', lineHeight: 1.1, color: '#1f2430' }

function Signature({ block }) {
  return (
    <div className="break-inside-avoid">
      {block.heading && (
        <p className={`mt-5 font-semibold text-slate-800 ${block.heading_align === 'right' ? 'text-right' : ''}`}>
          {block.heading}
        </p>
      )}
      {/* Two columns with a gap, a rule PER column: the handwritten sign sits just above its rule in
          a fixed-height bottom-aligned zone (so every rule lands on one line), and under the rule the
          caption lines (role / "NAME: <name>", plus Title/Date for signatory blocks) — as the source
          contracts set it. sigCaptionLines is shared with the editor, email and PDF. */}
      <div className="mt-2 flex gap-9">
        {(block.columns || []).map((c, i) => (
          <div key={i} className="flex-1">
            <div className="flex min-h-[46px] flex-col justify-end border-b border-black pb-1">
              {c.script && <div><ScriptSign text={c.script} height="28px" /></div>}
            </div>
            {sigCaptionLines(c).map((line, j) => (
              <div key={j} className="font-semibold leading-snug text-slate-900">{line}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

const HEADING_CLASS = {
  1: 'mt-2 text-center text-base font-bold text-slate-900',
  2: 'text-sm font-bold text-slate-800',
  3: 'text-center text-sm font-semibold text-slate-800',
}

function renderBlock(b, i) {
  switch (b.type) {
    case 'heading':
      return <h3 key={i} className={`${HEADING_CLASS[b.level] || HEADING_CLASS[2]} ${b.underline ? 'underline underline-offset-4' : ''}`}>{b.text}</h3>
    case 'para':
      return (
        <p
          key={i}
          className={`text-sm leading-relaxed ${b.muted ? 'text-slate-500' : 'text-slate-700'} ${b.align === 'right' ? 'text-right font-semibold' : 'text-left'}`}
          style={isClause(b) ? { paddingLeft: '2em', textIndent: '-2em' } : undefined}
        >
          <StrongPrefix text={b.text || ''} prefix={b.strong_prefix} />
        </p>
      )
    case 'list':
      return <List key={i} block={b} />
    case 'terms':
      return <TermsTable key={i} block={b} />
    case 'comp':
      return <CompTable key={i} block={b} />
    case 'table':
      return <GridTable key={i} block={b} />
    case 'script':
      return <p key={i}><ScriptSign text={b.text} height="30px" /></p>
    case 'signature':
      return <Signature key={i} block={b} />
    case 'row':
      // Two stacks level with each other, as the source letters set the salutation and the date.
      return (
        <div key={i} className="flex items-start gap-4">
          <div className="min-w-0 flex-1">{(b.left || []).map(renderBlock)}</div>
          <div className="shrink-0 text-right">{(b.right || []).map(renderBlock)}</div>
        </div>
      )
    case 'space':
      return <div key={i} style={{ height: Number(b.points) || 40 }} />
    case 'divider':
      return <hr key={i} className="my-4 border-slate-200" />
    default:
      return null
  }
}

export default function DocumentBlocks({ blocks, content }) {
  if (!blocks || blocks.length === 0) {
    return <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{content}</pre>
  }
  return <div className="space-y-3">{blocks.map(renderBlock)}</div>
}
