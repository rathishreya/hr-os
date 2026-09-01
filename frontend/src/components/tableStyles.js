// One vocabulary for every data table in the app.
//
// The tables had drifted into five different headers — plain slate, translucent slate, a slate
// gradient, a hardcoded lavender (#e8e4f5) and a bare one with no ground at all — across three
// header type sizes and three cell paddings. Moving between pages read as moving between
// products. Import these instead of retyping classes, so they cannot drift apart again.
//
// The header band is violet because the brand is violet and one table had already reached for it
// by hand: #e8e4f5 and brand-100 are the same colour to within a 1.05 ratio. It is OPAQUE on
// purpose — a translucent sticky header lets rows bleed through as they scroll underneath it.

/** The card a table sits in. */
export const TABLE_WRAP = 'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'

/** The scroll container. Pass a maxHeight alongside it when the header should stick. */
export const TABLE_SCROLL = 'relative overflow-auto'

/**
 * The header band. Stickiness and z-index stay at the call site: where a header sits in the
 * stacking order is a property of the page around it, not of the table.
 */
export const THEAD = 'bg-brand-100'

/** The header's own row, carrying the rule that separates it from the body. */
export const THEAD_ROW = 'border-b border-brand-200'

/** Header lettering, without padding — for tables that compute their own. 7.7:1 on brand-100. */
export const TH_TYPE = 'text-left text-[11px] font-semibold uppercase tracking-wide text-brand-800'

/** A header cell, padding included. */
export const TH = `px-3 py-2 ${TH_TYPE}`

/** A body cell. */
export const TD = 'px-3 py-2 align-middle'

/** The hairline between two body rows. */
export const ROW = 'border-b border-slate-100'

/** The rule closing a group of rows, heavier than the rule between them. */
export const ROW_GROUP = 'border-b border-slate-200'

/** Pointer feedback. Kept lighter than the header so the two never read as the same band. */
export const ROW_HOVER = 'transition-colors duration-150 ease-snappy hover:bg-brand-50/60'

/** A cell with nothing in it. Faint enough to read as absence, dark enough to be seen. */
export const EMPTY = 'text-slate-300'
