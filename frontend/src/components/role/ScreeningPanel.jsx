import { useEffect, useRef, useState } from 'react'
import { Bot, User, Mic, Square, Volume2, VolumeX, CheckCircle2, AlertTriangle } from 'lucide-react'
import { api } from '../../api'
import { Badge, Button, Spinner, ScoreBar, cx, inputClass } from '../../ui'
import { useToast } from '../Toast'
import { useSpeech } from '../../hooks/useSpeech'

const ratingTone = (v) =>
  v >= 75 ? 'bg-emerald-100 text-emerald-700' : v >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'

export default function ScreeningPanel({ app, onChange }) {
  const { toast } = useToast()
  const [iv, setIv] = useState(null)
  const [loading, setLoading] = useState(true)
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [voice, setVoice] = useState(false)
  const bottomRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const speech = useSpeech()

  useEffect(() => {
    api.listScreening(app.id).then((list) => {
      setIv(list.find((x) => x.status === 'in_progress') || list[0] || null)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [app.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [iv?.transcript, iv?.current_question])

  // In voice mode, read each new question aloud once.
  useEffect(() => {
    const q = iv?.status === 'in_progress' ? iv?.current_question : null
    if (voice && q && lastSpokenRef.current !== q) {
      lastSpokenRef.current = q
      speech.speak(q)
    }
  }, [voice, iv?.current_question, iv?.status, speech])

  function toggleVoice() {
    const next = !voice
    setVoice(next)
    if (!next) { speech.cancelSpeak(); speech.stopListening() }
    else if (iv?.status === 'in_progress' && iv?.current_question) {
      lastSpokenRef.current = iv.current_question
      speech.speak(iv.current_question)
    }
  }

  function toggleMic() {
    if (speech.listening) speech.stopListening()
    else speech.startListening(setAnswer)
  }

  async function start() {
    setBusy(true)
    try {
      setIv(await api.startScreening(app.id))
      lastSpokenRef.current = null
      toast('Screening started')
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    if (!answer.trim()) return
    speech.stopListening()
    setBusy(true)
    try {
      const updated = await api.answerScreening(iv.id, answer)
      setIv(updated)
      setAnswer('')
      if (updated.status === 'completed') {
        onChange?.()
        if (voice) speech.speak(`Screening complete. Overall score ${updated.scores?.overall}. Recommendation: ${updated.recommendation}.`)
        toast('Screening complete')
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>

  const VoiceToggle = speech.ttsSupported && (
    <button
      type="button"
      onClick={toggleVoice}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition duration-150 ease-snappy active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
        voice ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
      )}
      title="Read questions aloud and answer by speaking"
    >
      {voice ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      Voice {voice ? 'on' : 'off'}
    </button>
  )

  if (!iv) {
    return (
      <div className="rounded-xl bg-slate-50 p-4 text-center">
        <p className="mb-3 text-sm text-slate-600">Run a quick AI interview to screen this candidate beyond their resume — by text or voice.</p>
        <div className="flex items-center justify-center gap-2">
          <Button onClick={start} disabled={busy}>{busy ? <><Spinner /> Starting…</> : 'Start AI screening'}</Button>
          {VoiceToggle}
        </div>
        {!speech.sttSupported && (
          <p className="mt-2 text-xs text-slate-400">Tip: voice answers (mic) work in Chrome or Edge.</p>
        )}
      </div>
    )
  }

  const REC = { advance: 'green', hold: 'amber', reject: 'rose' }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">AI Interview</span>
        {VoiceToggle}
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto">
        {(iv.transcript || []).map((t, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex gap-2">
              <Bot className="mt-1 h-4 w-4 shrink-0 text-brand-500" />
              <div className="rounded-2xl rounded-tl-sm bg-brand-50 px-3 py-2 text-sm text-slate-700">{t.q}</div>
            </div>
            <div className="flex justify-end gap-2">
              <div className="rounded-2xl rounded-tr-sm bg-slate-100 px-3 py-2 text-sm text-slate-700">{t.a}</div>
              <User className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {iv.status === 'in_progress' ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Bot className="mt-1 h-4 w-4 shrink-0 text-brand-500" />
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-brand-50 px-3 py-2 text-sm font-medium text-slate-800">
              {iv.current_question}
              {voice && speech.ttsSupported && (
                <button type="button" onClick={() => speech.speak(iv.current_question)} title="Replay question" className="text-brand-500 transition-transform duration-150 ease-snappy hover:text-brand-700 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">
                  <Volume2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="text-xs text-slate-400">
            Question {iv.current_index + 1} of {iv.questions.length}
            {speech.listening ? ' · listening… speak now' : ' · Ctrl/⌘+Enter to send'}
          </div>
          <div className="flex gap-2">
            <textarea
              className={`${inputClass} h-16 resize-none`}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={speech.listening ? 'Listening…' : 'Type the answer, or tap the mic to speak…'}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
            />
            <div className="flex flex-col gap-2">
              {speech.sttSupported && (
                <Button
                  variant={speech.listening ? 'danger' : 'ghost'}
                  className="px-3"
                  onClick={toggleMic}
                  disabled={busy}
                  title={speech.listening ? 'Stop recording' : 'Answer by voice'}
                >
                  {speech.listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
              <Button onClick={send} disabled={busy || !answer.trim()}>{busy ? <Spinner /> : 'Send'}</Button>
            </div>
          </div>
          {!speech.sttSupported && (
            <p className="text-xs text-slate-400">Voice answers (mic) need Chrome or Edge — text works everywhere.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <Badge tone={REC[iv.recommendation] || 'gray'}>AI says: {iv.recommendation}</Badge>
            <span className="text-sm font-semibold text-slate-800">Overall {iv.scores?.overall}/100</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(iv.scores || {}).filter(([k]) => k !== 'overall').map(([k, v]) => <ScoreBar key={k} label={k} value={v} />)}
          </div>
          {iv.summary && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{iv.summary}</p>}

          {Array.isArray(iv.per_question) && iv.per_question.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Answer ratings</h4>
              {(iv.transcript || []).map((t, i) => {
                const pq = iv.per_question[i]
                if (!pq) return null
                return (
                  <div key={i} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-slate-700">Q{i + 1}. {t.q}</p>
                      {typeof pq.rating === 'number' && (
                        <span className={cx('shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums', ratingTone(pq.rating))}>
                          {pq.rating}/100
                        </span>
                      )}
                    </div>
                    {pq.strengths?.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {pq.strengths.map((s, j) => (
                          <li key={j} className="flex gap-1.5 text-xs text-emerald-700">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {pq.gaps?.length > 0 && (
                      <ul className="mt-1 space-y-1">
                        {pq.gaps.map((g, j) => (
                          <li key={j} className="flex gap-1.5 text-xs text-amber-700">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{g}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <Button variant="ghost" className="px-3 py-1 text-xs" onClick={start} disabled={busy}>Re-run screening</Button>
        </div>
      )}
    </div>
  )
}
