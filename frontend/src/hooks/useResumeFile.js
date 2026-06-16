import { useEffect, useState } from 'react'
import { api } from '../api'

// The résumé-file endpoint is auth-gated, so an <iframe src>/<img src>/<a href> pointing at it
// gets a 401 (a browser can't attach the bearer token to those). Fetch it WITH the auth header
// as a blob and hand back an object URL the browser can render/download in-session. Revoked on
// unmount / candidate change so we don't leak blob URLs.
export function useResumeFile(candidateId, enabled = true) {
  const [url, setUrl] = useState('')
  const [state, setState] = useState('idle') // idle | loading | ready | error

  useEffect(() => {
    if (!enabled || !candidateId) { setState('idle'); setUrl(''); return }
    let alive = true
    let objUrl = ''
    setState('loading'); setUrl('')
    api.fetchResumeFile(candidateId)
      .then((blob) => {
        if (!alive) return
        objUrl = URL.createObjectURL(blob)
        setUrl(objUrl)
        setState('ready')
      })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false; if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [candidateId, enabled])

  return { url, state }
}
