import { useEffect } from 'react'

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — HR-OS` : 'HR-OS by EZ — AI Hiring Operating System'
  }, [title])
}
