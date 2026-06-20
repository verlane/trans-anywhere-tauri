import { ensurePron, type Accent } from "./api";

let currentUrl: string | null = null;

/** Play a word's pronunciation for the given accent (cached, else fetched). */
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
