import { useCallback, useEffect, useRef, useState } from 'react'

// Browser-native speech: SpeechRecognition (mic → text) + speechSynthesis (text → voice).
// 100% free, no API key, no install. STT works in Chrome/Edge; TTS works broadly.
const SR =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

export function useSpeech() {
  const sttSupported = !!SR
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)

  const cancelSpeak = useCallback(() => {
    try { window.speechSynthesis?.cancel() } catch { /* noop */ }
  }, [])

  const speak = useCallback((text) => {
    if (!ttsSupported || !text) return
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 1
      u.pitch = 1
      window.speechSynthesis.speak(u)
    } catch { /* noop */ }
  }, [ttsSupported])

  const startListening = useCallback((onResult) => {
    if (!sttSupported) return
    try { window.speechSynthesis?.cancel() } catch { /* noop */ }
    const rec = new SR()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.continuous = true
    let finalText = ''
    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript
        if (e.results[i].isFinal) finalText += chunk + ' '
        else interim += chunk
      }
      onResult?.((finalText + interim).trim())
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }, [sttSupported])

  const stopListening = useCallback(() => {
    try { recRef.current?.stop() } catch { /* noop */ }
    setListening(false)
  }, [])

  useEffect(() => () => {
    try { recRef.current?.stop() } catch { /* noop */ }
    try { window.speechSynthesis?.cancel() } catch { /* noop */ }
  }, [])

  return { sttSupported, ttsSupported, listening, speak, cancelSpeak, startListening, stopListening }
}
