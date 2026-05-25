// Decode a recorded media blob to 16kHz mono Float32 PCM — the format Whisper wants.
// Returns null if the browser can't decode the blob (caller falls back gracefully).
export async function blobToPCM16k(blob) {
  const TARGET = 16000
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  const arrayBuffer = await blob.arrayBuffer()
  const ctx = new Ctx()
  let decoded
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer)
  } catch {
    ctx.close()
    return null
  }
  // Down-mix to mono.
  const len = decoded.length
  const mono = new Float32Array(len)
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const data = decoded.getChannelData(c)
    for (let i = 0; i < len; i++) mono[i] += data[i] / decoded.numberOfChannels
  }
  ctx.close()
  if (decoded.sampleRate === TARGET) return mono
  // Resample to 16kHz via an OfflineAudioContext.
  const outLen = Math.ceil((len * TARGET) / decoded.sampleRate)
  const offline = new OfflineAudioContext(1, outLen, TARGET)
  const buf = offline.createBuffer(1, len, decoded.sampleRate)
  buf.copyToChannel(mono, 0)
  const src = offline.createBufferSource()
  src.buffer = buf
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0)
}
