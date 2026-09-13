// Where a card's picture actually comes from, in one place.
//
// ── The outage this exists for ───────────────────────────────────────────────
// Card art is hosted by RiftScribe. Every card row carries TWO of their URLs,
// written by prisma/seed.ts and scripts/sync-cards.ts out of the upstream
// dataset (prisma/riftbound-cards.json):
//
//   imageUrl       https://cdn.riftscribe.gg/cards/originals/<id>-<hash>.png
//   imageThumbUrl  https://cdn.riftscribe.gg/cards/thumbnails/large/<id>-<hash>.webp
//
// In September 2026 the CDN dropped the `originals/` tree — every one of those
// PNGs now 404s, for every card in every set (OGN, OGS, SFD, UNL), and so does
// `thumbnails/medium/`. `thumbnails/large/` survives and is 744×1039, which is
// larger than anywhere on this site renders a card, hero included. Nothing in
// our database changed, so the `??` fallbacks that used to make missing art
// degrade gracefully never fired: `imageUrl` is non-null, it is simply dead.
//
// ── The fix ──────────────────────────────────────────────────────────────────
// Treat the dead prefix as a rewrite rule rather than as data. `liveCardImage`
// maps any `originals/*.png` URL onto its `thumbnails/large/*.webp` sibling —
// same filename stem, so no lookup and no request is needed to derive it — and
// returns every other URL untouched. That last part matters: the Vendetta
// signature prints in prisma/manual-cards.json are re-hosted BY US at
// riftcompare.com/signature-cards/*.jpg, they are genuinely full-resolution,
// and `full` callers must keep getting them.
//
// Do this at READ time, in every render path, rather than with one UPDATE:
// the dataset still ships the dead `image` field, so the next `sync-cards`
// run would write it straight back. (The two writers normalise through here
// too, so rows heal as they are re-synced — but the read path is what keeps
// the site correct in the meantime, and what keeps it correct if the CDN
// shuffles paths again.)
//
// Pinned by tests/card-image-url.test.ts, which also fails if a raw
// `cards/originals/` URL reappears anywhere in src/ or prisma/seed.ts.

const DEAD_ORIGINALS = "https://cdn.riftscribe.gg/cards/originals/";
const LIVE_LARGE = "https://cdn.riftscribe.gg/cards/thumbnails/large/";

/**
 * One URL in, one URL that actually resolves out.
 *
 * A dead `originals/<stem>.png` becomes `thumbnails/large/<stem>.webp`;
 * anything else (our own re-hosted art, a data: URI, null) is returned as-is.
 */
export function liveCardImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith(DEAD_ORIGINALS)) return url;
  const stem = url.slice(DEAD_ORIGINALS.length).replace(/\.[a-z0-9]+$/i, "");
  // A path segment here would escape the thumbnail tree; the dataset has none,
  // and a future one should fall back rather than build a nonsense URL.
  if (!stem || stem.includes("/")) return null;
  return `${LIVE_LARGE}${stem}.webp`;
}

export interface CardImageUrls {
  imageUrl?: string | null;
  imageThumbUrl?: string | null;
}

/**
 * The best URL to render a card with, or null when the card has no photo at
 * all (callers fall back to generated CardArt).
 *
 * `full` asks for the largest rendition — it still prefers our own re-hosted
 * originals, and lands on the same 744×1039 thumbnail for RiftScribe cards,
 * which is bigger than any slot on the site.
 */
export function cardImageSrc(card: CardImageUrls, opts: { full?: boolean } = {}): string | null {
  const main = liveCardImage(card.imageUrl);
  const thumb = liveCardImage(card.imageThumbUrl);
  return opts.full ? main ?? thumb : thumb ?? main;
}
