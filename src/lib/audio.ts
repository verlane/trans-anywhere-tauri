import { ensurePron, type Accent } from "./api";

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
/** Playback gain (0.0-1.0). Updated from settings via `setPronVolume`. */
let pronVolume = 1;

/** Set the pronunciation playback volume from a 0-100 percentage. */
export function setPronVolume(percent: number): void {
  pronVolume = Math.min(1, Math.max(0, percent / 100));
}

/**
 * Find where the actual sound starts, in seconds. Naver's recordings (especially
 * the male Japanese ones) can have a long silent intro — skipping it removes the
 * "delayed" feel. A small lead-in is kept so the first phoneme isn't clipped.
 */
function soundStart(buffer: AudioBuffer, threshold = 0.012): number {
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > threshold) {
      return Math.max(0, i / buffer.sampleRate - 0.04);
    }
  }
  return 0;
}

/** Play a word's recorded pronunciation, trimming any leading silence. */
export async function playPron(word: string, accent: Accent): Promise<void> {
  const bytes = await ensurePron(word, accent);
  if (!bytes) {
    return;
  }
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    const buffer = await audioCtx.decodeAudioData(bytes.slice().buffer);
    try {
      currentSource?.stop();
    } catch {
      // previous source already finished
    }
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.value = pronVolume;
    source.connect(gain);
    gain.connect(audioCtx.destination);
    source.start(0, soundStart(buffer));
    currentSource = source;
  } catch {
    // ignore decode/playback errors
  }
}

/** Speak text with the browser's TTS when Naver has no recording (e.g. many Japanese words). */
export function speakTts(text: string, lang: string): void {
  const synth = window.speechSynthesis;
  if (!synth) {
    return;
  }
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "ja" ? "ja-JP" : lang === "en" ? "en-US" : lang || "en-US";
  utterance.volume = pronVolume;
  synth.speak(utterance);
}
