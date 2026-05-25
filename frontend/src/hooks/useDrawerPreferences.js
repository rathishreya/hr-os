import { useCallback, useMemo, useState } from 'react'

const STORAGE_KEY = 'hr-os-candidate-drawer-prefs'

export const DRAWER_TAB_OPTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'resume', label: 'Resume' },
  { id: 'score', label: 'AI report' },
  { id: 'screen', label: 'Interview' },
  { id: 'email', label: 'Comms' },
  { id: 'offer', label: 'Offer & Docs' },
  { id: 'onboard', label: 'Onboarding' },
  { id: 'notes', label: 'Notes' },
]

export const DEFAULT_DRAWER_PREFS = {
  width: 'medium',
  overlay: 'light',
  defaultTab: 'overview',
  resumeDefaultView: 'formatted',
  tabs: Object.fromEntries(DRAWER_TAB_OPTIONS.map((t) => [t.id, true])),
  overview: {
    stage: true,
    liveStatus: true,
    aiSummary: true,
    screeningEmails: true,
    interviewReport: true,
    comments: true,
  },
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_DRAWER_PREFS }
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_DRAWER_PREFS,
      ...parsed,
      tabs: { ...DEFAULT_DRAWER_PREFS.tabs, ...parsed.tabs },
      overview: { ...DEFAULT_DRAWER_PREFS.overview, ...parsed.overview },
    }
  } catch {
    return { ...DEFAULT_DRAWER_PREFS }
  }
}

export function useDrawerPreferences() {
  const [prefs, setPrefs] = useState(loadPrefs)

  const updatePrefs = useCallback((patch) => {
    setPrefs((prev) => {
      const next = {
        ...prev,
        ...patch,
        tabs: patch.tabs ? { ...prev.tabs, ...patch.tabs } : prev.tabs,
        overview: patch.overview ? { ...prev.overview, ...patch.overview } : prev.overview,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const resetPrefs = useCallback(() => {
    const next = { ...DEFAULT_DRAWER_PREFS }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setPrefs(next)
  }, [])

  const visibleTabs = useMemo(
    () => DRAWER_TAB_OPTIONS.filter((t) => prefs.tabs[t.id] !== false),
    [prefs.tabs],
  )

  return { prefs, updatePrefs, resetPrefs, visibleTabs }
}

export const WIDTH_CLASSES = {
  narrow: 'max-w-md',
  medium: 'max-w-xl',
  wide: 'max-w-3xl',
  full: 'max-w-[96vw] w-full',
}

export const OVERLAY_CLASSES = {
  none: 'bg-transparent',
  light: 'bg-slate-900/10',
  medium: 'bg-slate-900/25',
}
