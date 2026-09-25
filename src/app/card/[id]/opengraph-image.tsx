import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { cardImageForOg } from "@/lib/card-image-url";
import { CardOgImage, CARD_OG_SIZE } from "@/lib/card-og";
import { ogPriceLines, type OgPriceCard } from "@/lib/og-price";

// Per-card share card: card art + name + lowest live price, so a shared /card link
// unfurls as a price comparison (not just raw art). Replaces the plain-art OG that
// generateMetadata used to set (that `images` field is now removed so this wins).
//
// The headline is the DEFAULT market's price (US$, like the page, its title and
// its JSON-LD), with the other priced markets as a chip row — see lib/og-price.ts.
// It printed the AU column as "from A$…" to everyone until 2026-09-25. The
// composition lives in lib/card-og.tsx so it can be rendered from a fixture
// (scripts/render-card-og.tsx); this file is only the data hop.
export const runtime = "nodejs"; // Prisma needs the Node runtime
export const size = CARD_OG_SIZE;
export const contentType = "image/png";
export const alt = "RiftCompare — Riftbound card price";

const whereParam = (p: string) => ({ OR: [{ slug: p }, { id: p }] });

export default async function Image({ params }: { params: { id: string } }) {
  let card: (OgPriceCard & {
    name: string;
    setCode: string;
    collectorNumber: string;
    imageUrl: string | null;
    imageThumbUrl: string | null;
  }) | null = null;
  try {
    // The same one-row indexed findFirst as before, plus five integer columns.
    card = await prisma.card.findFirst({
      where: whereParam(params.id),
      select: {
        name: true,
        setCode: true,
        collectorNumber: true,
        lowestPriceCents: true,
        lowestPriceCentsUs: true,
        lowestPriceCentsUk: true,
        lowestPriceCentsSg: true,
        lowestPriceCentsCa: true,
        lowestPriceCentsEu: true,
        imageUrl: true,
        imageThumbUrl: true,
      },
    });
  } catch {
    /* fall through to the generic card below */
  }

  const { headline, others } = ogPriceLines(card);
  // cardImageForOg, not cardImageSrc: the mirror is WebP and satori cannot
  // decode it — the card slot rendered as an empty bordered box. Found and
  // fixed sitewide 2026-09-22; see that helper's comment.
  const art = card ? cardImageForOg(card) : null;

  return new ImageResponse(
    (
      <CardOgImage
        name={card?.name ?? "Riftbound card"}
        setLine={card ? `${card.setCode} · ${card.collectorNumber}` : "RiftCompare"}
        headline={headline}
        others={others}
        art={art}
      />
    ),
    size
  );
}
