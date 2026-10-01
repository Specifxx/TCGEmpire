// Small display helpers for the Pokémon section. Client-safe.

import type { PkListingSource } from "./types";

export function pokemonImageAlt(name: string): string {
  return `${name}, sealed Pokémon TCG product`;
}

export function sourceWord(source: PkListingSource | null): string {
  if (source === "tcgplayer") return "on TCGplayer";
  if (source === "ebay") return "on eBay";
  if (source === "cardmarket") return "on Cardmarket";
  return "";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Nov 2025" from "2025-11-14"; the date is a calendar day, never shifted by time zone. */
export function formatDay(day: string | null | undefined): string | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}/.test(day)) return null;
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** The TCGplayer 200px thumbnail for grids (the stored URL is the 1000px rendition). */
export function thumbOf(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  return imageUrl.replace(/_in_1000x1000\.jpg$/, "_200w.jpg");
}
