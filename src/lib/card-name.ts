// Card display name with its printing "credentials" baked in.
//
// Several printings share the SAME name AND collector number — most notably a promo
// (e.g. Nexus Night) vs its base card (both "Discipline" 058/298) — so showing just
// the name + number makes them indistinguishable in search and lists. These helpers
// append human-readable credentials (Promo, Alt Art, Showcase, Signature,
// Overnumbered) to the name so the distinction is visible in the title itself, not
// only in the floating badges.

import { isSignature, isOvernumbered } from "@/lib/constants";

export interface CardCredentialFields {
  variant?: string | null;
  isPromo?: boolean | null;
  rarity?: string | null;
  collectorNumber?: string | null;
}

// Credential tags for a card, most distinctive first. Empty for a plain base card.
export function cardCredentials(c: CardCredentialFields): string[] {
  const out: string[] = [];
  // Special art: Showcase rarity is itself an alt art, so don't also say "Alt Art".
  if (c.rarity === "Showcase") out.push("Showcase");
  else if (c.variant) out.push("Alt Art");
  // Special print run (mutually exclusive — a Signature is also overnumbered).
  if (c.collectorNumber && isSignature(c.collectorNumber)) out.push("Signature");
  else if (c.collectorNumber && isOvernumbered(c.collectorNumber)) out.push("Overnumbered");
  // Promo printing (Nexus Night / prerelease / OP) — shares the base number.
  if (c.isPromo) out.push("Promo");
  return out;
}

// "Discipline (Promo)" / "Vayne — Hunter (Signature)" / plain "Jinx" when base.
export function cardDisplayName(name: string, c: CardCredentialFields): string {
  const creds = cardCredentials(c);
  return creds.length ? `${name} (${creds.join(", ")})` : name;
}

// Search-friendly variant for external marketplace queries (eBay's _nkw, etc.) —
// same credentials as cardDisplayName but appended as plain terms rather than a
// parenthetical, since search boxes tokenize on words, not punctuation. Without
// this, searching a Signature/Alt Art/Overnumbered/Showcase/Promo printing just
// returns the base card's listings, which is functionally useless for the
// printing the visitor is actually looking at.
export function cardSearchName(name: string, c: CardCredentialFields): string {
  const creds = cardCredentials(c);
  return creds.length ? `${name} ${creds.join(" ")}` : name;
}

/**
 * The champion half of a card name: "Shen, Eye of Twilight" → "Shen".
 *
 * Riftbound champion cards are named `<Champion>, <Epithet>`, and that comma is
 * the whole rule — a card with no comma ("Moonfall", "Discipline") is returned
 * unchanged, which is correct: its full name IS what people type.
 *
 * WHY THIS MATTERS ENOUGH TO EXIST: people search the short name plus the
 * printing — "Shen signature", not "Shen, Eye of Twilight (Showcase,
 * Signature)". It is also the only form that fits a 60-character title for
 * these cards: the full-name variant of that same title is 70 characters and
 * the current displayName variant is 82, so Google truncates and the word it
 * cuts is "Riftbound". See lib/card-seo.ts's title ladder.
 *
 * It lives here rather than in card-seo.ts because card-narrative.ts needs it
 * too, and card-narrative → card-seo would be an import cycle.
 */
export function shortCardName(name: string): string {
  const comma = name.indexOf(",");
  if (comma <= 0) return name;
  const short = name.slice(0, comma).trim();
  return short.length > 0 ? short : name;
}
