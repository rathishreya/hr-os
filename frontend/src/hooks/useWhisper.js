import { useCallback, useEffect, useRef, useState } from 'react'

// Manages the on-device Whisper worker. status: idle|loading|transcribing|ready|error|unsupported
export function useWhisper() {
  const workerRef = useRef(null)
  const resolveRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let worker
    try {
      worker = new Worker(new URL('../workers/whisperWorker.js', import.meta.url), { type: 'module' })
      worker.onmessage = (e) => {
        const { type, text, data, error } = e.data || {}
        if (type === 'progress') {
          setStatus('loading')
          if (data?.progress != null) setProgress(Math.round(data.progress))
        } else if (type === 'result') {
          setStatus('ready')
          resolveRef.current?.({ text: text || '' })
          resolveRef.current = null
        } else if (type === 'error') {
          setStatus('error')
          resolveRef.current?.({ text: '', error })
          resolveRef.current = null
        }
      }
      worker.onerror = () => {
        setStatus('error')
        resolveRef.current?.({ text: '', error: 'worker' })   // never leave a caller hanging
        resolveRef.current = null
      }
      workerRef.current = worker
    } catch {
      setStatus('unsupported')
    }
    return () => worker?.terminate()
  }, [])

  // Always resolves (never hangs) — on result, error, or a hard timeout — so the
  // upload flow proceeds even if on-device transcription fails. Server-side falls back.
  const transcribe = useCallback(async (float32) => {
    if (!workerRef.current || !float32) return { text: '', error: 'unsupported' }
    setStatus('transcribing')
    return new Promise((resolve) => {
      let done = false
      const finish = (val) => { if (done) return; done = true; clearTimeout(timer); resolveRef.current = null; resolve(val) }
      const timer = setTimeout(() => finish({ text: '', error: 'timeout' }), 120000)
      resolveRef.current = finish
      try { workerRef.current.postMessage({ type: 'transcribe', audio: float32 }, [float32.buffer]) }
      catch { finish({ text: '', error: 'post-failed' }) }
    })
  }, [])

  return { transcribe, status, progress }
}
