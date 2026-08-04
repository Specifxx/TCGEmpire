import { CardArt } from "./CardArt";
import { cardImageAlt } from "@/lib/image-alt";
import { optimisedImage } from "@/lib/image-manifest";

export interface CardImageData {
  name: string;
  domain: string;
  type: string;
  rarity: string;
  isPromo?: boolean;
  energyCost?: number | null;
  might?: number | null;
  collectorNumber?: string;
  setCode?: string;
  variant?: string | null;
  artSeed?: number;
  orientation?: string | null;
  imageUrl?: string | null;
  imageThumbUrl?: string | null;
  blurDataUrl?: string | null;
}

interface Props {
  card: CardImageData;
  isFoil?: boolean;
  full?: boolean; // use full-res image instead of the thumbnail
  className?: string;
  // Set on the LCP image (the card-detail hero) so it loads eagerly with high
  // fetch priority instead of being lazy-loaded. Default false keeps every grid/
  // list tile lazy — only the one above-the-fold hero should opt in.
  priority?: boolean;
}

// Small "PROMO" stamp centred at the bottom of the card art (where the real card's
// rarity symbol sits) — promo printings reuse the base art, so this marks them.
function PromoStamp() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-1.5 z-20 flex justify-center">
      <span className="rounded-full bg-gradient-to-br from-amber-400 to-amber-600 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-amber-950 shadow ring-1 ring-amber-300/50">
        Promo
      </span>
    </div>
  );
}

// Renders the real Riftbound card image (RiftScribe CDN) over a blurred backdrop
// so both portrait and landscape cards look good. Falls back to generated SVG art
// when no image is available.
export function CardImage({ card, isFoil = false, full = false, className, priority = false }: Props) {
  const src = full
    ? card.imageUrl ?? card.imageThumbUrl
    : card.imageThumbUrl ?? card.imageUrl;

  if (!src) {
    return (
      <div className={`relative ${className ?? ""}`}>
        <CardArt
          name={card.name}
          domain={card.domain}
          type={card.type}
          rarity={card.rarity}
          energyCost={card.energyCost}
          might={card.might}
          collectorNumber={card.collectorNumber}
          artSeed={card.artSeed ?? 1}
          isFoil={isFoil}
          className="h-full w-full"
        />
        {card.isPromo && <PromoStamp />}
      </div>
    );
  }

  const isLandscape = card.orientation === "landscape";

  // Only our own re-hosted card art is in the build-time manifest; anything on the
  // RiftScribe CDN resolves to null and falls through to the plain <img>.
  const meta = optimisedImage(src);
  const webpSrcSet = meta?.webp
    ? [...(meta.variants ?? []).map((v) => `${v.src} ${v.w}w`), `${meta.webp} ${meta.width}w`].join(", ")
    : null;

  return (
    <div
      className={`relative overflow-hidden rounded-lg ${className ?? ""}`}
      style={
        card.blurDataUrl
          ? {
              backgroundImage: `url(${card.blurDataUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : { backgroundColor: "#080b11" }
      }
    >
      {/* darken the (already-blurred) backdrop. No backdrop-filter here: it's a
          GPU-expensive effect and with infinite scroll there can be hundreds of
          tiles on screen, which made scrolling janky. The blurDataUrl background is
          pre-blurred, so a plain dark overlay gives the same look far cheaper. */}
      <div className="absolute inset-0 bg-ink-950/40" />
      {/* Intrinsic dimensions (5:7 card ratio) satisfy Lighthouse's "explicit
          width and height" audit and stop layout shift anywhere a wrapper doesn't
          already fix the aspect; the h-full/w-full CSS still controls rendered size.

          <picture> rather than a bare <img> because a handful of card images are
          RE-HOSTED BY US (the Vendetta Signature prints in prisma/manual-cards.json
          point at riftcompare.com/signature-cards/*.jpg) — those have a WebP
          rendition and a responsive srcset built at build time, and this is where
          they get served. Cards on the RiftScribe CDN have no manifest entry, so
          `webpSrcSet` is null and this renders exactly the <img> it always did. */}
      <picture>
        {meta?.avif && <source type="image/avif" srcSet={meta.avif} />}
        {webpSrcSet && (
          <source type="image/webp" srcSet={webpSrcSet} sizes={full ? "(max-width: 640px) 90vw, 420px" : "220px"} />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          // Descriptive and keyword-aware, from the card's own data — see
          // lib/image-alt.ts for why the bare name wasn't good enough.
          alt={cardImageAlt(card)}
          // The card-detail hero is the LCP element: load it eagerly with high fetch
          // priority. Every other call site (grids, lists) keeps lazy + async decode.
          {...(priority
            ? { loading: "eager" as const, fetchPriority: "high" as const }
            : { loading: "lazy" as const, decoding: "async" as const })}
          width={isLandscape ? 420 : 300}
          height={isLandscape ? 300 : 420}
          className={`relative z-10 h-full w-full ${
            isLandscape ? "object-contain" : "object-cover"
          }`}
        />
      </picture>
      {isFoil && (
        <div
          className="pointer-events-none absolute inset-0 z-20 opacity-50 mix-blend-screen"
          style={{
            background:
              "linear-gradient(115deg, #ff0080 0%, #ffea00 25%, #00ffd5 50%, #7a5cff 75%, #ff0080 100%)",
          }}
        />
      )}
      {card.isPromo && <PromoStamp />}
    </div>
  );
}
