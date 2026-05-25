import { useCallback, useMemo, useState } from 'react'

const STORAGE_KEY = 'hr-os-talent-pool-columns'

export const TALENT_POOL_COLUMNS = [
  { id: 'idx', label: '#', locked: true },
  { id: 'edit', label: '', locked: true },
  { id: 'name', label: 'Candidate', locked: true },
  { id: 'contact', label: 'Contact' },
  { id: 'role', label: 'Current role' },
  { id: 'education', label: 'Education' },
  { id: 'comp', label: 'Compensation' },
  { id: 'exp', label: 'Experience' },
  { id: 'source', label: 'Source' },
  { id: 'sub_source', label: 'Sub-source' },
  { id: 'location', label: 'Location' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'added', label: 'Date added' },
  { id: 'applied_by', label: 'Applied by' },
]

const DEFAULT_VISIBLE = Object.fromEntries(TALENT_POOL_COLUMNS.map((c) => [c.id, true]))

function loadVisible() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_VISIBLE }
    return { ...DEFAULT_VISIBLE, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_VISIBLE }
  }
}

export function useTalentPoolColumns() {
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
    () => TALENT_POOL_COLUMNS.filter((c) => c.locked || visible[c.id] !== false),
    [visible],
  )

  return { visible, updateVisible, resetVisible, activeColumns }
}
