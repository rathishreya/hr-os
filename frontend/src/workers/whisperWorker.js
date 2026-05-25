// Open-source Whisper running on-device (no server, no paid API) via transformers.js.
// Receives 16kHz mono Float32 audio, returns the transcript.
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false   // fetch the model from the HF hub on first use (then cached)

let transcriber = null

async function getTranscriber() {
  if (!transcriber) {
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      progress_callback: (p) => self.postMessage({ type: 'progress', data: p }),
    })
  }
  return transcriber
}

self.onmessage = async (e) => {
  if (e.data?.type !== 'transcribe') return
  try {
    const t = await getTranscriber()
    const out = await t(e.data.audio, { chunk_length_s: 30, stride_length_s: 5 })
    self.postMessage({ type: 'result', text: (out?.text || '').trim() })
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err?.message || err) })
  }
}
