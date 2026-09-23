import ReactDOM from "react-dom";
import { CardArt } from "./CardArt";
import { cardImageAlt } from "@/lib/image-alt";
import { cardImageSrc } from "@/lib/card-image-url";
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

// Renders the real Riftbound card image over a blurred backdrop so both portrait
// and landscape cards look good. Falls back to generated SVG art when no image is
// available. The art is served from our own mirror (public/card-art) — see
// lib/card-image-url.ts for why we stopped hotlinking the RiftScribe CDN.
export function CardImage({ card, isFoil = false, full = false, className, priority = false }: Props) {
  // lib/card-image-url.ts, not card.imageUrl directly: the rows still store
  // RiftScribe URLs, and the helper is what maps them onto our mirrored copy.
  const src = cardImageSrc(card, { full });

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

  // Only the signature prints are in the build-time manifest: optimize-images.ts
  // processes png/jpeg sources, and the mirror is already optimised .webp, so a
  // mirrored card resolves to null here and falls through to the plain <img>.
  const meta = optimisedImage(src);
  const webpSrcSet = meta?.webp
    ? [...(meta.variants ?? []).map((v) => `${v.src} ${v.w}w`), `${meta.webp} ${meta.width}w`].join(", ")
    : null;
  // One constant, used by the <source> below AND by the preload above it — a
  // preload whose `imagesizes` disagrees with the source's `sizes` picks a
  // different variant and downloads the image twice.
  const sizes = full ? "(max-width: 640px) 90vw, 420px" : "220px";

  // PRELOAD THE HERO. `loading="eager" fetchPriority="high"` (set below) only
  // takes effect once the parser REACHES this element, and on the card page
  // that is 51 KB into a 450 KB document — measured on the live page,
  // 2026-09-20, while Speed Insights had /card/[id] at 4.42s LCP with this very
  // element as the culprit. A preload link is hoisted into <head>, so the fetch
  // starts during head parsing instead.
  //
  // Only for `priority` — the one above-the-fold hero. Preloading a grid of
  // lazy tiles would do the opposite of this.
  //
  // The branches exist because a preload MUST resolve to the same file <picture>
  // picks, or the page downloads two copies of its largest image. `type` gates
  // each one: a browser that cannot decode AVIF skips that preload entirely
  // rather than fetching something it will not use.
  if (priority) {
    if (meta?.avif) {
      ReactDOM.preload(meta.avif, { as: "image", type: "image/avif", fetchPriority: "high" });
    } else if (webpSrcSet && meta?.webp) {
      ReactDOM.preload(meta.webp, {
        as: "image",
        type: "image/webp",
        fetchPriority: "high",
        imageSrcSet: webpSrcSet,
        imageSizes: sizes,
      });
    } else {
      // No manifest entry — the mirrored .webp renders as a bare <img> with no
      // <source> at all, so the img's own src IS what gets fetched. This is the
      // common case (879 files in public/card-art against 27 optimised ones)
      // and it is the case Speed Insights measured.
      ReactDOM.preload(src, { as: "image", fetchPriority: "high" });
    }
  }

  // `isolate` makes this wrapper its own stacking context (2026-09-23). Without
  // it the img's `z-10` (it must paint above the dimming overlay below) and the
  // foil's `z-20` leaked into the PARENT's stacking context — in CardTile that
  // tied with the watch heart's `absolute right-2 top-2 z-10` wrapper, which
  // comes earlier in the DOM, so the art painted over the heart and took its
  // taps: no heart at all at 390, a dark sliver at 1440, and a tap opened
  // QuickView instead. Contained here, a caller's z-10/z-20 overlays paint
  // above the whole image, as they were written to.
  return (
    <div
      className={`relative isolate overflow-hidden rounded-lg ${className ?? ""}`}
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

          <picture> rather than a bare <img> because the Vendetta Signature prints
          (prisma/manual-cards.json, pointing at riftcompare.com/signature-cards/*.jpg)
          are JPEGs that optimize-images.ts turns into a WebP rendition plus a
          responsive srcset at build time, and this is where those get served.
          Mirrored cards are already .webp and carry no manifest entry, so
          `webpSrcSet` is null and this renders exactly the <img> it always did. */}
      <picture>
        {meta?.avif && <source type="image/avif" srcSet={meta.avif} />}
        {webpSrcSet && (
          <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />
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
