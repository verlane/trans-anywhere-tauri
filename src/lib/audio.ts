import { getPron, fetchPron } from "./api";

let currentUrl: string | null = null;

async function loadBytes(word: string, pronUrl: string | null): Promise<Uint8Array | null> {
  const cached = await getPron(word);
  if (cached) {
    return cached;
  }
  if (pronUrl) {
    return fetchPron(word, pronUrl);
  }
  return null;
}

/** Play the pronunciation for a word: cached BLOB first, else download by url. */
export async function playPron(word: string, pronUrl: string | null): Promise<void> {
  const bytes = await loadBytes(word, pronUrl);
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
