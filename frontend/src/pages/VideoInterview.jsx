import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Video, CheckCircle2, AlertTriangle, Loader, ShieldAlert, Mic, Volume2, Sun, Monitor } from 'lucide-react'
import { api } from '../api'
import { Button, Spinner, cx } from '../ui'
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
function Shell({ children, company }) {
  const name = company?.name || ''
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/60">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-8">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-600 text-sm font-black text-white">{(name || 'H')[0].toUpperCase()}</div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-slate-900">{name || 'Video interview'}</div>
            <div className="text-[11px] text-slate-400">Video interview</div>
          </div>
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
  const [company, setCompany] = useState(null)
  const [err, setErr] = useState('')
  const [phase, setPhase] = useState('intro')   // intro|live|processing|done
  const [idx, setIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [focusLost, setFocusLost] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const [consent, setConsent] = useState(false)

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
    api.company().then(setCompany).catch(() => {})
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
  if (err) return <Shell company={company}><div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700"><AlertTriangle className="mb-2 h-5 w-5" />{err}</div></Shell>
  if (!interview) return <Shell company={company}><div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Loading…</div></Shell>

  const companyName = company?.name || ''
  // Show just the opening paragraph of the company bio — the full field can carry
  // several paragraphs and trailing social URLs that read as clutter on a welcome screen.
  const companyAbout = (company?.about || '').split(/\n\s*\n/)[0].trim()
  const firstName = (interview.candidate_name || '').trim().split(/\s+/)[0] || ''

  if (phase === 'done') {
    return (
      <Shell company={company}>
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-8 w-8" /></div>
          <h1 className="text-2xl font-bold text-balance text-slate-900">Thank you{firstName ? `, ${firstName}` : ''}!</h1>
          <p className="mx-auto mt-2 max-w-md text-pretty text-sm leading-relaxed text-slate-600">
            Your interview for <strong>{interview.role_position}</strong>{companyName ? <> at <strong>{companyName}</strong></> : ''} has been submitted. Our team will review your responses and get back to you with next steps.
          </p>
          <p className="mt-5 text-xs text-slate-400">You can safely close this tab.</p>
        </div>
      </Shell>
    )
  }

  if (phase === 'intro') {
    const qCount = questions.length
    const estMins = Math.max(2, Math.ceil(qCount * 1.5))
    const steps = [
      { icon: Volume2, title: 'Listen', text: `The AI interviewer reads each question aloud — ${qCount} in total, one at a time.` },
      { icon: Mic, title: 'Answer out loud', text: 'Speak naturally. When you pause, the next question begins on its own.' },
      { icon: Video, title: 'One continuous take', text: 'Everything records in a single take. No pausing or re-recording — just be yourself.' },
    ]
    const tips = [
      { icon: Sun, text: 'Sit facing a light source so your face is clearly visible.' },
      { icon: Mic, text: 'Find a quiet room and speak clearly into your microphone.' },
      { icon: Monitor, text: 'Use Chrome or Edge on a laptop or desktop for the best experience.' },
    ]
    return (
      <Shell company={company}>
        <div className="space-y-4">
          {/* Welcome */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-br from-brand-600 to-fuchsia-600 px-8 py-10 text-white">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                <Video className="h-3.5 w-3.5" /> Video interview
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-balance">Welcome{firstName ? `, ${firstName}` : ''} 👋</h1>
              <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-white/85">
                Thanks for applying for <strong className="font-semibold text-white">{interview.role_position}</strong>{companyName ? <> at <strong className="font-semibold text-white">{companyName}</strong></> : ''}. We're excited to learn more about you. This short interview takes about {estMins} minutes — take it whenever you're ready.
              </p>
            </div>
            {companyAbout && (
              <div className="px-8 py-5">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">About {companyName || 'us'}</div>
                <p className="max-w-2xl text-pretty text-sm leading-relaxed text-slate-600">{companyAbout}</p>
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">How it works</h2>
            <ol className="mt-4 grid gap-4 sm:grid-cols-3">
              {steps.map((s, i) => (
                <li key={i} className="flex flex-col gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><s.icon className="h-5 w-5" /></div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{i + 1}. {s.title}</div>
                    <p className="mt-0.5 text-sm leading-snug text-slate-500">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Tips + proctoring */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Before you begin</h3>
              <ul className="mt-3 space-y-2.5">
                {tips.map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                    <t.icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <span className="leading-snug">{t.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700"><ShieldAlert className="h-4 w-4" /> Proctored interview</h3>
              <p className="mt-3 text-sm leading-relaxed text-amber-800">
                This runs in fullscreen and records continuously in one take. There's no pausing, re-recording, or editing, and switching tabs is logged. Settle in somewhere you won't be interrupted.
              </p>
            </div>
          </div>

          {/* Consent + start */}
          <div className="flex flex-col items-center gap-3 pt-2 text-center">
            <label className="flex max-w-xl items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-left text-sm text-slate-600">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              <span>
                I consent to this interview being <strong>recorded</strong> and reviewed by {companyName || 'the hiring team'}, and to my responses being processed by AI services (transcription runs on my device when possible, and the recording may be sent to a third-party AI provider if that fails) for evaluation.
              </span>
            </label>
            <Button className="px-6 py-3 text-base" onClick={startInterview} disabled={!consent}><Video className="h-5 w-5" /> Allow camera &amp; start interview</Button>
            <p className="text-xs text-slate-400">You'll be asked to allow camera &amp; microphone to begin.</p>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell company={company}>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        {/* Header: progress + status */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Question {Math.min(idx + 1, questions.length)} of {questions.length}</div>
            <div className="mt-1.5 flex items-center gap-1.5">
              {questions.map((_, i) => (
                <span key={i} className={cx('h-1.5 rounded-full transition-all duration-300 ease-snappy', i < idx ? 'w-5 bg-brand-500' : i === idx ? 'w-8 bg-brand-600' : 'w-5 bg-slate-200')} />
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs">
            {focusLost > 0 && <span className="inline-flex items-center gap-1 font-medium text-rose-600"><ShieldAlert className="h-3.5 w-3.5" /> {focusLost} tab switch{focusLost !== 1 ? 'es' : ''}</span>}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 font-semibold text-rose-600"><span className="h-2 w-2 animate-pulse rounded-full bg-rose-600" /> REC {fmt(elapsed)}</span>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-slate-900 ring-1 ring-slate-900/5">
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
          {/* Status pill */}
          <div className="absolute left-3 top-3">
            {phase === 'live' && (speaking
              ? <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-sm"><Volume2 className="h-3.5 w-3.5" /> Interviewer is asking…</span>
              : listening
                ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-sm"><Mic className="h-3.5 w-3.5 animate-pulse" /> Listening — answer now</span>
                : null)}
          </div>
          {/* Question caption */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-5 pt-10">
            <p className="text-pretty text-lg font-semibold leading-snug text-white">{questions[idx]}</p>
          </div>
        </div>

        {phase === 'processing' ? (
          <div className="mt-5 flex items-center justify-center gap-2.5 rounded-xl bg-slate-50 py-4 text-sm font-medium text-slate-600">
            <Loader className="h-4 w-4 animate-spin text-brand-600" />
            {whisperStatus === 'loading' && progress ? `Transcribing on your device… loading model ${progress}%` : 'Uploading & transcribing your interview…'}
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-400">{speaking ? 'Listen to the question…' : 'The next question starts automatically when you finish speaking.'}</span>
            <button type="button" onClick={advance} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold text-brand-600 transition-colors duration-150 ease-snappy hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.97]">{idx + 1 >= questions.length ? 'Finish now' : 'Done — next'} →</button>
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">Recording continuously · please don't refresh or close this tab</p>
    </Shell>
  )
}
