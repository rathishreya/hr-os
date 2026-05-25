import { useCallback, useMemo, useState } from 'react'

const STORAGE_KEY = 'hr-os-job-app-columns'

export const JOB_APP_COLUMNS = [
  { id: 'select', label: '', locked: true },
  { id: 'idx', label: '#', locked: true },
  { id: 'edit', label: '', locked: true },
  { id: 'name', label: 'Name', locked: true },
  { id: 'rating', label: 'Rating' },
  { id: 'status', label: 'Status', locked: true },
  { id: 'role', label: 'Current company' },
  { id: 'education', label: 'Education' },
  { id: 'comp', label: 'Compensation' },
  { id: 'exp', label: 'Exp (yrs)' },
  { id: 'location', label: 'Location' },
  { id: 'notice', label: 'Notice' },
  { id: 'source', label: 'Source' },
  { id: 'sub_source', label: 'Sub-source' },
  { id: 'applied', label: 'Applied on' },
  { id: 'changed', label: 'Status changed' },
  { id: 'activity', label: 'Activity' },
  { id: 'interview', label: 'Interview' },
  { id: 'email', label: 'Email' },
  { id: 'ai', label: 'AI' },
]

const DEFAULT_VISIBLE = {
  select: true, idx: true, edit: true, name: true, rating: true, status: true,
  role: true, education: true, comp: true, exp: true, location: true, notice: true,
  source: true, sub_source: false, applied: true, changed: true, activity: false,
  interview: true, email: false, ai: true,
}

function loadVisible() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_VISIBLE }
    return { ...DEFAULT_VISIBLE, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_VISIBLE }
  }
}

export function useJobAppColumns() {
  const [visible, setVisible] = useState(loadVisible)

  const updateVisible = useCallback((id, on) => {
    setVisible((prev) => {
      const next = { ...prev, [id]: on }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const resetVisible = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_VISIBLE))
    setVisible({ ...DEFAULT_VISIBLE })
  }, [])

  const activeColumns = useMemo(
    () => JOB_APP_COLUMNS.filter((c) => c.locked || visible[c.id] !== false),
    [visible],
  )

  return { visible, updateVisible, resetVisible, activeColumns }
}
