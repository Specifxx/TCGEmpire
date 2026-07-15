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
