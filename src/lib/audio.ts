import { ensurePron, type Accent } from "./api";

let currentUrl: string | null = null;

/** Play a word's recorded pronunciation for the given accent (cached, else fetched). */
export async function playPron(word: string, accent: Accent): Promise<void> {
  const bytes = await ensurePron(word, accent);
  if (!bytes) {
    return;
  }

  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
  }
  const blob = new Blob([bytes], { type: "audio/mpeg" });
  currentUrl = URL.createObjectURL(blob);
  const audio = new Audio(currentUrl);
  await audio.play().catch(() => {});
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
  synth.speak(utterance);
}
