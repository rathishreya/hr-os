# Product

## Register

product

## Users

Recruiters, hiring managers, and Training & Placement Officers (TPOs) running real hiring
loops. They live inside the tool for hours: posting roles, screening inbound applications,
moving candidates through stages, scheduling interviews, comparing shortlists, and pushing
offers and onboarding. They are task-focused and time-pressured, often switching between a
dense list view and a single candidate's detail. Mixed technical fluency; the interface must
not assume they know recruiting jargon or AI internals.

## Product Purpose

HR-OS is an AI-native hiring operating system: one place to run the whole loop from job post
to onboarding. AI assists at every step (resume extraction, screening scores, ranking,
interview prep) but never decides — scores are suggestions, every candidate stays
human-reviewable, and nobody is auto-rejected. Success is a recruiter trusting the tool enough
to run a real requisition end to end without dropping back to spreadsheets and email.

## Brand Personality

Calm, credible, fast. Three words: trustworthy, efficient, modern. The voice is plain and
direct — it names what a button does, not how revolutionary it is. AI is present but quiet:
a helpful colleague, never a black box. Emotional goal is confidence under time pressure, not
delight for its own sake.

## Anti-references

- Loud "AI magic" dashboards with gradient-metric hero cards and confetti.
- Legacy ATS density-without-hierarchy (gray-on-gray walls of fields, no rhythm).
- Anything that makes an automated score feel like a verdict. The UI must always read as
  assistive and reversible.

## Design Principles

- **AI suggests, humans decide.** Every AI output is visibly a suggestion with a human action
  next to it. Never present a score as a final judgment.
- **The tool disappears into the task.** Earned familiarity over novelty; standard affordances
  (tables, tabs, drawers, modals) behave exactly as expected.
- **One vocabulary everywhere.** Same nouns (role, candidate, stage), same component shapes,
  same colors-mean-the-same-thing across every screen.
- **Density with rhythm.** Show the data recruiters need, but use spacing, weight, and one
  accent color to keep it scannable.
- **Reversible by default.** Destructive or consequential actions are clearly marked and
  recoverable; nothing irreversible happens silently.

## Accessibility & Inclusion

Target WCAG 2.1 AA. Body text ≥4.5:1 contrast; visible keyboard focus on every interactive
element; full keyboard operability for tables, tabs, drawers, and modals; `prefers-reduced-motion`
respected (already wired in `index.css`). Color is never the only signal for state.
