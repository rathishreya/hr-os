# Design

Visual system for HR-OS, captured from the live frontend (`frontend/src`). React 19 + Vite +
Tailwind CSS v4. This documents what exists so future work stays on-brand.

## Theme

Light only (`color-scheme: light`). Calm, dense product UI: a near-white tinted app background
with white content surfaces, a single violet brand accent, and a state-rich semantic palette.
Color strategy is **Restrained** — neutrals carry the surface, violet is reserved for primary
actions, current selection, and links.

## Color

Defined in `frontend/src/index.css` (`:root`) and used via Tailwind's violet/slate scales.

| Role          | Value                  | Token / utility            |
|---------------|------------------------|----------------------------|
| Brand         | violet, OKLCH `54.1% 0.281 293` | `--color-brand-600` → `*-brand-600` |
| Brand hover   | `--color-brand-700`    | `*-brand-700`              |
| Brand light   | `--color-brand-50/100` | `bg-brand-50`, `text-brand-700` |
| Surface       | `#ffffff`              | `--color-surface`          |
| App background| `#f6f7fb`              | `--color-bg`               |
| Ink (body)    | `#1f2430`              | (body color)               |
| Muted text    | `#64748b` (slate-500)  | `--color-muted`            |
| Border        | `#e2e8f0` (slate-200)  | `--color-border`           |

The full brand ramp (`--color-brand-50…950`) lives in the `@theme` block of
`frontend/src/index.css` and is the **single source of truth** for the accent. It generates the
`*-brand-*` Tailwind utilities (`bg-brand-600`, `text-brand-700`, `ring-brand-500/50`, …) used
across all components. To rebrand the entire app, edit only those eleven lines.

Semantic state tones (badges, scores, status dots): `violet` (selected/primary),
`emerald`/green (success, high score), `sky`/blue (info, mid score), `amber` (warning,
attention), `rose` (error, low score), `slate` (neutral). Score thresholds: ≥80 green,
≥65 blue, ≥50 amber, else rose (`scoreTone` in `ui.jsx`).

> **Resolved:** the brand accent is now fully tokenized. The old hardcoded `violet-*` classes
> (252 of them across 41 files) were migrated to `brand-*` utilities backed by the `@theme`
> ramp, with byte-identical output. Rebranding is now a one-file edit. The neutral scale
> (`slate-*`) and semantic state colors (`emerald`/`sky`/`amber`/`rose`) are intentionally left
> on Tailwind's defaults — they are not the brand.

## Typography

One family: system sans (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto`).
Fixed rem scale (not fluid) — correct for product UI.

- Page title (`PageHeader` h1): `text-2xl font-bold tracking-tight text-slate-900`
- Modal title: `text-lg font-semibold`
- Body: `text-sm` ink; muted meta in `text-slate-500`
- Labels / table headers: `text-xs font-medium uppercase tracking-wide text-slate-500`
- Numeric data: `tabular-nums`

## Motion

- Custom easing `--ease-snappy: cubic-bezier(0.23, 1, 0.32, 1)`, exposed as the `ease-snappy`
  Tailwind utility. Used on hovers, presses, tab/route transitions.
- Durations 140–300ms. Enter with the snappy curve, exit fast; never `ease-in` on UI.
- Press feedback via `active:scale-[0.97]` on buttons.
- Keyframes: `toast-in/out`, `menu-in` (origin-aware popover entrance).
- `prefers-reduced-motion: reduce` collapses all animation/transition to ~instant.

## Layout

- App shell: fixed 256px (`w-64`) left sidebar on `lg+`, slide-in drawer below `lg` with
  backdrop + sticky mobile header. Content max-width `max-w-6xl` (standard pages) or
  `max-w-[1600px]` (job-detail full-bleed).
- Responsive behavior is structural (collapse sidebar, horizontal-scroll tables with
  `min-w-[960px]`, breakpoint columns), not fluid type.
- Radii: cards `rounded-2xl` (16px), buttons/inputs `rounded-xl` (12px), pills/badges
  `rounded-full`. Shadows are soft and shallow (`shadow-sm`, `--shadow-card`).

## Components

Shared primitives in `frontend/src/ui.jsx`:

- **Button** — variants: `primary` (violet), `ghost` (white + border), `subtle` (transparent),
  `danger` (rose). Has hover, active-press, disabled, and (after this pass) `focus-visible`.
- **IconButton**, **Badge** (6 tones), **Spinner**, **Skeleton** (loading uses skeletons, not
  center spinners), **ScoreBar**, **Field** + `inputClass`, **Avatar** (initials),
  **PageHeader**, **EmptyState** (teaches the interface), **Tabs**, **Modal**.
- **DataTable** (`components/DataTable.jsx`) — sortable, paginated, sticky header, compact mode,
  empty state, keyboard-operable headers with `aria-sort`.

### Interaction states

Every interactive element should define default / hover / focus-visible / active / disabled,
plus loading / error where async. Focus indicator is `ring-2 ring-violet-500/50`. Loading is a
skeleton, not a spinner-in-content. Empty states use `EmptyState` with an icon, title,
description, and a primary action.
