import { CardArt } from "./CardArt";

export interface CardImageData {
  name: string;
  domain: string;
  type: string;
  rarity: string;
  energyCost?: number | null;
  might?: number | null;
  collectorNumber?: string;
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
}

// Renders the real Riftbound card image (RiftScribe CDN) over a blurred backdrop
// so both portrait and landscape cards look good. Falls back to generated SVG art
// when no image is available.
export function CardImage({ card, isFoil = false, full = false, className }: Props) {
  const src = full
    ? card.imageUrl ?? card.imageThumbUrl
    : card.imageThumbUrl ?? card.imageUrl;

  if (!src) {
    return (
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
        className={className}
      />
    );
  }

  const isLandscape = card.orientation === "landscape";

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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={card.name}
        loading="lazy"
        decoding="async"
        className={`relative z-10 h-full w-full ${
          isLandscape ? "object-contain" : "object-cover"
        }`}
      />
      {isFoil && (
        <div
          className="pointer-events-none absolute inset-0 z-20 opacity-50 mix-blend-screen"
          style={{
            background:
              "linear-gradient(115deg, #ff0080 0%, #ffea00 25%, #00ffd5 50%, #7a5cff 75%, #ff0080 100%)",
          }}
        />
      )}
    </div>
  );
}
