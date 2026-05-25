import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Video, CheckCircle2, AlertTriangle, Loader, ShieldAlert, Mic, Volume2 } from 'lucide-react'
import { api } from '../api'
import { Button, Spinner } from '../ui'
import { useWhisper } from '../hooks/useWhisper'
import { blobToPCM16k } from '../utils/audio'
import { usePageTitle } from '../hooks/usePageTitle'

const MAX_TOTAL_SECONDS = 10 * 60   // hard cap on the whole session
const SILENCE_MS = 2600             // auto-advance after this much silence once they've spoken
const MIN_ANSWER_MS = 1500          // don't advance in the first moment
const MAX_WAIT_NO_SPEECH = 60000    // if they never speak, move on after this
const VOL_THRESHOLD = 0.025         // RMS above this = speaking

function pickMime() {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || 'video/webm'
}
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// Module-level so it keeps a stable identity across re-renders (a component defined
// inside the render gets a new identity each render, remounting the <video> and dropping
// the camera stream — which is exactly the "can't see themselves" bug).
function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-8">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-lg font-black text-white">H</div>
          <div className="text-sm font-semibold text-slate-800">Video interview</div>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function VideoInterview() {
  usePageTitle('Video interview')
  const { appId } = useParams()
  const { transcribe, status: whisperStatus, progress } = useWhisper()

  const [interview, setInterview] = useState(null)
  const [err, setErr] = useState('')
  const [phase, setPhase] = useState('intro')   // intro|live|processing|done
  const [idx, setIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [focusLost, setFocusLost] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)

  const streamRef = useRef(null)
  const liveRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const startRef = useRef(0)
  const timelineRef = useRef([])
  const proctorRef = useRef({ focus_lost: 0, fullscreen_exits: 0, events: [] })
  const tickRef = useRef(null)
  const phaseRef = useRef('intro'); phaseRef.current = phase
  const idxRef = useRef(0)
  // audio detection
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const detectRef = useRef(null)
  const listeningRef = useRef(false)
  const hasSpokenRef = useRef(false)
  const lastVoiceRef = useRef(0)
  const listenStartRef = useRef(0)

  useEffect(() => {
    api.getVideoInterview(appId).then(setInterview).catch((e) => setErr(e.message))
    return () => cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId])

  const questions = interview?.questions || []
  const now = () => (Date.now() - startRef.current) / 1000

  function logEvent(type) { proctorRef.current.events.push({ type, at: Math.round(now()) }) }
  function onVisibility() {
    if (phaseRef.current === 'live' && document.hidden) { proctorRef.current.focus_lost += 1; setFocusLost((n) => n + 1); logEvent('tab_hidden') }
  }
  function onFullscreenChange() {
    if (phaseRef.current === 'live' && !document.fullscreenElement) { proctorRef.current.fullscreen_exits += 1; logEvent('fullscreen_exit') }
  }
  function beforeUnload(e) { if (phaseRef.current === 'live') { e.preventDefault(); e.returnValue = '' } }

  function cleanup() {
    clearInterval(tickRef.current)
    clearInterval(detectRef.current)
    document.removeEventListener('visibilitychange', onVisibility)
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    window.removeEventListener('beforeunload', beforeUnload)
    try { audioCtxRef.current?.close() } catch { /* ignore */ }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    try { if (document.fullscreenElement) document.exitFullscreen() } catch { /* ignore */ }
  }

  function speakAndListen(text) {
    listeningRef.current = false
    setListening(false); setSpeaking(true)
    let started = false
    const begin = () => {
      if (started) return
      started = true
      setSpeaking(false)
      hasSpokenRef.current = false
      lastVoiceRef.current = Date.now()
      listenStartRef.current = Date.now()
      listeningRef.current = true
      setListening(true)
    }
    try {
      const u = new SpeechSynthesisUtterance(text)
      u.onend = begin
      window.speechSynthesis?.cancel()
      window.speechSynthesis?.speak(u)
    } catch { /* ignore */ }
    // fallback in case onend never fires (some browsers)
    setTimeout(begin, Math.max(4000, (text || '').length * 80))
  }

  function advance() {
    if (!listeningRef.current && phaseRef.current === 'live') { /* allow manual even if not listening */ }
    listeningRef.current = false
    setListening(false)
    const cur = idxRef.current
    if (cur + 1 >= questions.length) { finish(); return }
    const ni = cur + 1
    idxRef.current = ni
    setIdx(ni)
    timelineRef.current.push({ q_index: ni, question: questions[ni], at: Math.round(now()) })
    speakAndListen(questions[ni])
  }

  function detectLoop() {
    if (phaseRef.current !== 'live' || !listeningRef.current || !analyserRef.current) return
    const buf = new Uint8Array(analyserRef.current.fftSize)
    analyserRef.current.getByteTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x }
    const rms = Math.sqrt(sum / buf.length)
    const t = Date.now()
    if (rms > VOL_THRESHOLD) { hasSpokenRef.current = true; lastVoiceRef.current = t }
    if (hasSpokenRef.current && t - lastVoiceRef.current > SILENCE_MS && t - listenStartRef.current > MIN_ANSWER_MS) advance()
    else if (!hasSpokenRef.current && t - listenStartRef.current > MAX_WAIT_NO_SPEECH) advance()
  }

  async function startInterview() {
    let stream
    try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }) }
    catch { setErr('Camera/microphone access was denied. Please allow access and reload.'); return }
    streamRef.current = stream
    if (liveRef.current) { liveRef.current.srcObject = stream; liveRef.current.play().catch(() => {}) }
    try { await document.documentElement.requestFullscreen?.() } catch { /* optional */ }

    // continuous recording
    chunksRef.current = []
    const rec = new MediaRecorder(stream, { mimeType: pickMime() })
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
    rec.onstop = onStopped
    recorderRef.current = rec
    rec.start(1000)
    startRef.current = Date.now()
    idxRef.current = 0
    timelineRef.current = [{ q_index: 0, question: questions[0] || '', at: 0 }]

    // mic level detector for auto-advance
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new AC()
      const srcNode = audioCtxRef.current.createMediaStreamSource(stream)
      const analyser = audioCtxRef.current.createAnalyser()
      analyser.fftSize = 1024
      srcNode.connect(analyser)
      analyserRef.current = analyser
      detectRef.current = setInterval(detectLoop, 120)
    } catch { /* auto-advance disabled; manual link still works */ }

    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('beforeunload', beforeUnload)

    setPhase('live'); setIdx(0)
    tickRef.current = setInterval(() => { const t = now(); setElapsed(t); if (t >= MAX_TOTAL_SECONDS) finish() }, 500)
    speakAndListen(questions[0] || '')
  }

  function finish() {
    clearInterval(tickRef.current)
    clearInterval(detectRef.current)
    listeningRef.current = false
    window.speechSynthesis?.cancel()
    setPhase('processing')
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    else onStopped()
  }

  async function onStopped() {
    const blob = new Blob(chunksRef.current, { type: pickMime() })
    const duration = Math.round(now())
    let transcript = ''
    try { const pcm = await blobToPCM16k(blob); if (pcm) { const { text } = await transcribe(pcm); transcript = text || '' } }
    catch { /* recording still uploads */ }
    try {
      const fd = new FormData()
      fd.append('transcript', transcript)
      fd.append('timeline', JSON.stringify(timelineRef.current))
      fd.append('proctoring', JSON.stringify(proctorRef.current))
      fd.append('duration', String(duration))
      if (blob.size) fd.append('file', blob, `interview-${appId}.webm`)
      await api.submitVideoRecording(interview.id, fd)
      cleanup(); setPhase('done')
    } catch (e) { setErr(e.message) }
  }

  // ---- render ----
  if (err) return <Shell><div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700"><AlertTriangle className="mb-2 h-5 w-5" />{err}</div></Shell>
  if (!interview) return <Shell><div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Loading…</div></Shell>

  if (phase === 'done') {
    return (
      <Shell>
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-7 w-7" /></div>
          <h1 className="text-xl font-bold text-slate-900">Interview submitted</h1>
          <p className="mt-2 text-sm text-slate-500">Your recorded interview for <strong>{interview.role_position}</strong> has been received. You can close this tab.</p>
        </div>
      </Shell>
    )
  }

  if (phase === 'intro') {
    return (
      <Shell>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">{interview.role_position} — video interview</h1>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div><strong>This is a proctored interview.</strong> It records <strong>continuously</strong> in one take — no pausing, re-recording, or editing. Stay in fullscreen; switching tabs is logged.</div>
          </div>
          <p className="mt-4 text-sm text-slate-600">The AI interviewer asks <strong>{questions.length} question{questions.length !== 1 ? 's' : ''}</strong>, read aloud one by one. Just answer out loud — when you stop talking, the <strong>next question starts automatically</strong>.</p>
          <Button className="mt-6" onClick={startInterview}><Video className="h-4 w-4" /> Allow camera &amp; start interview</Button>
          <p className="mt-3 text-xs text-slate-400">Works best in Chrome or Edge. Answers are transcribed privately on your device.</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="font-medium uppercase tracking-wide text-slate-400">Question {idx + 1} of {questions.length}</span>
          <div className="flex items-center gap-3">
            {focusLost > 0 && <span className="inline-flex items-center gap-1 font-medium text-rose-600"><ShieldAlert className="h-3.5 w-3.5" /> {focusLost} tab switch{focusLost !== 1 ? 'es' : ''}</span>}
            <span className="inline-flex items-center gap-1.5 font-medium text-rose-600"><span className="h-2 w-2 animate-pulse rounded-full bg-rose-600" /> REC {fmt(elapsed)}</span>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-slate-900">
          <video
            ref={(el) => {
              liveRef.current = el
              if (el && streamRef.current && el.srcObject !== streamRef.current) {
                el.srcObject = streamRef.current
                el.play().catch(() => {})
              }
            }}
            autoPlay muted playsInline className="aspect-video w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
            <p className="text-base font-semibold text-white">{questions[idx]}</p>
          </div>
          <div className="absolute right-3 top-3">
            {phase === 'live' && (speaking
              ? <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-600/90 px-2.5 py-1 text-xs font-medium text-white"><Volume2 className="h-3.5 w-3.5" /> AI asking…</span>
              : listening
                ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-2.5 py-1 text-xs font-medium text-white"><Mic className="h-3.5 w-3.5 animate-pulse" /> Listening — answer now</span>
                : null)}
          </div>
        </div>

        {phase === 'processing' ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <Loader className="h-4 w-4 animate-spin" />
            {whisperStatus === 'loading' && progress ? `Transcribing… loading model ${progress}%` : 'Uploading & transcribing on your device…'}
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
            <span>{speaking ? 'Listen to the question…' : 'The next question starts automatically when you finish answering.'}</span>
            <button type="button" onClick={advance} className="font-medium text-slate-400 hover:text-violet-600">{idx + 1 >= questions.length ? 'Finish now' : 'Done — next'} →</button>
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">Recording continuously · do not refresh or close this tab</p>
    </Shell>
  )
}
