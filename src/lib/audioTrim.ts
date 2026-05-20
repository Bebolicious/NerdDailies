// Decode an audio file, slice it to the first `maxSeconds`, and re-encode it
// as MP3 at 128 kbps so uploads are normalized and small (~960 KB for 60s).
// The MP3 encoder is dynamically imported so player builds never pull it in.

const MP3_KBPS = 128
const DEFAULT_MAX_SECONDS = 60

export async function trimAndEncodeToMp3(
  file: File,
  maxSeconds: number = DEFAULT_MAX_SECONDS,
): Promise<File> {
  const arrayBuffer = await file.arrayBuffer()

  const AudioCtor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext
  const ctx = new AudioCtor()
  let audioBuffer: AudioBuffer
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    ctx.close()
  }

  const sampleRate = audioBuffer.sampleRate
  const supportedRates = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]
  if (!supportedRates.includes(sampleRate)) {
    throw new Error(
      `Unsupported sample rate ${sampleRate} Hz — re-export as 44.1 or 48 kHz.`,
    )
  }

  const channels = Math.min(audioBuffer.numberOfChannels, 2)
  const sampleCount = Math.min(
    audioBuffer.length,
    Math.floor(maxSeconds * sampleRate),
  )

  const left = floatToInt16(audioBuffer.getChannelData(0).subarray(0, sampleCount))
  const right =
    channels === 2
      ? floatToInt16(audioBuffer.getChannelData(1).subarray(0, sampleCount))
      : null

  const lamejs = (await import('@breezystack/lamejs')).default
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, MP3_KBPS)
  const blockSize = 1152
  const chunks: BlobPart[] = []
  for (let i = 0; i < sampleCount; i += blockSize) {
    const leftChunk = left.subarray(i, i + blockSize)
    const buf = right
      ? encoder.encodeBuffer(leftChunk, right.subarray(i, i + blockSize))
      : encoder.encodeBuffer(leftChunk)
    if (buf.length > 0) chunks.push(new Uint8Array(buf))
  }
  const tail = encoder.flush()
  if (tail.length > 0) chunks.push(new Uint8Array(tail))

  const blob = new Blob(chunks, { type: 'audio/mpeg' })
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'soundtrack'
  return new File([blob], `${baseName}.mp3`, { type: 'audio/mpeg' })
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}
