import { useEffect } from 'react'

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — HR-OS` : 'HR-OS — AI Hiring Operating System'
  }, [title])
}
