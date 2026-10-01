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

/** "Sep 2026" from "2026-09-16": a set's month in a meta description, where a full date is too long. */
export function formatMonth(day: string | null | undefined): string | null {
  if (!day || !/^\d{4}-\d{2}/.test(day)) return null;
  const [y, m] = day.slice(0, 7).split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Whole calendar days from `from` to `to` ("YYYY-MM-DD"), negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86400_000);
}

/** "a", "a and b", "a, b and c". */
export function listJoin(items: readonly string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// Kind names that are product names in their own right keep their capitals
// ("Elite Trainer Box", "Pokémon Center ETB", "Ultra-Premium Collection");
// the generic ones read lower case mid-sentence ("a booster bundle", "two tins").
const PROPER_KIND = /^(?:Elite|Pok[eé]mon|Ultra|Super|Build)\b/;

// Labels that are chip text rather than a countable noun ("1 Build & Battle").
const SINGULAR: Record<string, string> = { "build-battle": "Build & Battle kit", other: "other sealed product" };
const PLURAL: Record<string, string> = { other: "other sealed products" };

/** A kind's name for running text: "booster box" / "booster boxes", "Elite Trainer Box" / "Elite Trainer Boxes". */
export function kindNoun(info: { id?: string; label: string; plural: string }, n = 1): string {
  const word = n === 1 ? (SINGULAR[info.id ?? ""] ?? info.label) : (PLURAL[info.id ?? ""] ?? info.plural);
  return PROPER_KIND.test(word) ? word : word.toLowerCase();
}

/** "Black Bolt's", "Destined Rivals'". */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/**
 * Whether a URL segment could be one of our slugs: lowercase words joined by
 * hyphens, at most 120 characters (lib/pokemon/catalog.ts slugify). Anything
 * else is not a product or set, and is not worth a database read and a cache
 * entry to find out.
 */
export function isPokemonSlug(s: string): boolean {
  return s.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}
