/** A short, stable fingerprint of what a card shows, so a changed card gets a new image address. */
export function shareImageVersion(...parts: (string | number)[]): string {
  let hash = 2166136261;
  for (const character of parts.join("\n")) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}
