/** The URL InlineAds fetches for a set. A plain module (not "use client") so the card page, a server component, can call it to preload the same fetch. */
export function inlinePicksUrl(set: string): string {
  return `/api/mini-picks${set ? `?set=${encodeURIComponent(set)}` : ""}`;
}
