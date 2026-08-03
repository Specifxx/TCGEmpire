// Descriptive, keyword-aware alt text for card art.
//
// WHY THIS EXISTS: card images were rendered with `alt={card.name}` on the hero
// and `alt="" aria-hidden` on every thumbnail. Both are defensible in isolation —
// the thumbnails genuinely sit next to a text label — but between them the site
// published thousands of card images that said nothing about what they were, and
// the SEO audit's "missing alt text" bucket is exactly that. A card image is
// CONTENT, not decoration: it is the single best image-search asset the site has,
// and "Zed, Master of Shadows" alone doesn't tell Google (or a screen-reader user
// deciding whether to open the tile) that this is a Riftbound Signature printing
// numbered 191 in Vendetta.
//
// The alt deliberately reads DIFFERENTLY from the adjacent visible label, so on
// the rows where both are present a screen reader gains information rather than
// hearing the same words twice.
//
// Genuinely decorative images (user avatars, gradient overlays, the generated
// OG-image canvas) keep alt="" — see scripts/check-images.ts, which allows an
// explicit empty alt but fails the build on a missing one.
import { isCrystalRose, isOvernumbered, isSignature } from "./constants";

export interface CardAltFields {
  name: string;
  setCode?: string | null;
  setName?: string | null;
  collectorNumber?: string | null;
  rarity?: string | null;
  variant?: string | null;
  isPromo?: boolean | null;
  type?: string | null;
}

/**
 * The printing's "kind" word, used as the adjective in the alt sentence:
 * "Riftbound <kind> card". Most distinctive treatment wins, mirroring the order
 * in cardCredentials() so the alt and the visible badges can't disagree.
 */
function printingWord(c: CardAltFields): string {
  const num = c.collectorNumber ?? "";
  if (num && isSignature(num)) return "signature";
  if (c.setCode && num && isCrystalRose(c.setCode, num)) return "Crystal Rose special";
  if (num && isOvernumbered(num)) return "overnumbered";
  if (c.isPromo) return "promo";
  if (c.rarity === "Showcase") return "Showcase";
  if (c.variant) return "alternate art";
  if (c.rarity === "Epic") return "Epic";
  return "";
}

/**
 * "Zed, Master of Shadows — Riftbound signature card VEN 191"
 *
 * Degrades cleanly: call sites that only have a name (the games, the eBay ad
 * carousel) still get a sentence that names the game, which is strictly better
 * than the bare name and far better than "".
 */
export function cardImageAlt(c: CardAltFields): string {
  const kind = printingWord(c);
  const noun = kind ? `Riftbound ${kind} card` : "Riftbound card";
  // "191" reads better than "191/166"; the denominator is set metadata, not an
  // identifier, and Google's image alt guidance favours natural phrasing.
  const num = (c.collectorNumber ?? "").split("/")[0].replace(/\*/g, "").trim();
  const ident = [c.setCode?.toUpperCase(), num].filter(Boolean).join(" ");
  return [c.name, "—", noun, ident].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Alt text for a sealed product tile (booster box / pack / deck renders).
 * Sealed images come from arbitrary store CDNs and the group name is already the
 * product's full title, so the alt just frames it as a product photo.
 */
export function sealedImageAlt(name: string): string {
  return `${name} — sealed Riftbound TCG product`;
}
