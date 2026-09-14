import { useEffect, useState } from 'react'
import { api } from '../api'

// Defence in depth against a résumé that is really HTML. The server already serves this file under
// a safe, server-chosen Content-Type, so the blob should never be text/html — but a blob URL that
// somehow WAS text/html would execute same-origin in the recruiter's session when opened. Re-wrap
// the bytes under a vetted type: keep PDFs and images, force everything else to an opaque download
// type the browser will not run.
function reTyped(blob) {
  const t = blob.type || ''
  const safe = t === 'application/pdf' || t.startsWith('image/') ? t : 'application/octet-stream'
  return safe === t ? blob : new Blob([blob], { type: safe })
}

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
        objUrl = URL.createObjectURL(reTyped(blob))
        setUrl(objUrl)
        setState('ready')
      })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false; if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [candidateId, enabled])

  return { url, state }
}
