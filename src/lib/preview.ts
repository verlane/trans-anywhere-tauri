/** First non-empty line of a definition: the short summary gloss (e.g. "조사, 살피다, 조망하다"). */
export function summaryLine(definition: string): string {
  for (const line of definition.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}
