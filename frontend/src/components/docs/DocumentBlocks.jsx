import { richSegments } from './rich'

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
  // prefix already embedded at the start of text (e.g. a name/signatory line): bold just that span.
  if (prefix && text.startsWith(prefix)) {
    return (<><strong className="font-semibold text-slate-800">{prefix}</strong><Rich text={text.slice(prefix.length)} /></>)
  }
  if (prefix && !text) return <strong className="font-semibold text-slate-800">{prefix}</strong>
  // prefix is a standalone label (e.g. "Effectiveness", "Termination"): render "Label: body".
  if (prefix) return (<><strong className="font-semibold text-slate-800">{prefix}: </strong><Rich text={text} /></>)
  return <Rich text={text} />
}

function MiniBlocks({ blocks }) {
  return (
    <div className="space-y-1.5">
      {(blocks || []).map((b, i) =>
        b.type === 'list' ? (
          <List key={i} block={b} dense />
        ) : (
          <p key={i} className="text-sm leading-relaxed text-slate-700"><StrongPrefix text={b.text || ''} prefix={b.strong_prefix} /></p>
        ),
      )}
    </div>
  )
}

function List({ block, dense = false }) {
  const Tag = block.ordered ? 'ol' : 'ul'
  return (
    <Tag className={`${block.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5 text-sm leading-relaxed text-slate-700 ${dense ? '' : 'my-1'}`}>
      {(block.items || []).map((it, i) => (<li key={i}><Rich text={it} /></li>))}
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

function CompTable({ block }) {
  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-slate-300 bg-slate-100 p-2 text-left font-semibold text-slate-700">Component</th>
            <th className="border border-slate-300 bg-slate-100 p-2 text-right font-semibold text-slate-700">INR</th>
          </tr>
        </thead>
        <tbody>
          {(block.rows || []).map((row, i) => (
            <tr key={i} className={row.emphasis ? 'bg-slate-50 font-semibold text-slate-900' : 'text-slate-700'}>
              <td className="border border-slate-300 p-2">{row.label}</td>
              <td className="border border-slate-300 p-2 text-right tabular-nums">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {block.known === false && (
        <p className="mt-1.5 text-xs text-amber-600">No CTC on this role — amounts show “₹ —”. Add the Annual CTC and regenerate to fill the breakdown.</p>
      )}
      {(block.notes || []).length > 0 && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Important points</div>
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed text-slate-500">
            {block.notes.map((n, i) => (<li key={i}>{n}</li>))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Signature({ block }) {
  return (
    <div className="mt-2 flex flex-wrap gap-8">
      {(block.columns || []).map((c, i) => (
        <div key={i} className="min-w-[200px]">
          <div className="mb-1 h-6 border-b border-slate-400">{c.name}</div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</div>
        </div>
      ))}
    </div>
  )
}

const HEADING_CLASS = {
  1: 'mt-2 text-center text-base font-bold uppercase tracking-wide text-slate-900',
  2: 'text-sm font-bold uppercase tracking-wide text-slate-800',
  3: 'text-center text-sm font-semibold text-slate-800',
}

export default function DocumentBlocks({ blocks, content }) {
  if (!blocks || blocks.length === 0) {
    return <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{content}</pre>
  }
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return <h3 key={i} className={`${HEADING_CLASS[b.level] || HEADING_CLASS[2]} ${b.underline ? 'underline underline-offset-4' : ''}`}>{b.text}</h3>
          case 'para':
            return (
              <p key={i} className={`text-sm leading-relaxed ${b.muted ? 'text-slate-500' : 'text-slate-700'} ${b.align === 'right' ? 'text-right text-emerald-700' : 'text-justify'}`}>
                <StrongPrefix text={b.text || ''} prefix={b.strong_prefix} />
              </p>
            )
          case 'list':
            return <List key={i} block={b} />
          case 'terms':
            return <TermsTable key={i} block={b} />
          case 'comp':
            return <CompTable key={i} block={b} />
          case 'signature':
            return <Signature key={i} block={b} />
          case 'divider':
            return <hr key={i} className="my-4 border-slate-200" />
          default:
            return null
        }
      })}
    </div>
  )
}
