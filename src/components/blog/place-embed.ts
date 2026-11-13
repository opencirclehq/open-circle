/**
 * Where an embed lands in the Markdown: on its own line in place of the cursor
 * marker, at the end when there was no cursor, or nowhere when cancelled.
 * Null means nothing changes.
 */
export function placeEmbed(markdown: string, marker: string | null, url: string | null): string | null {
  const placed = !!marker && markdown.includes(marker);
  // Replacer functions, because a replacement string treats "$&" and similar as patterns.
  if (!url) return placed ? markdown.replace(marker!, () => "") : null;
  return placed ? markdown.replace(marker!, () => `\n\n<${url}>\n\n`) : `${markdown.trimEnd()}\n\n<${url}>\n`;
}
