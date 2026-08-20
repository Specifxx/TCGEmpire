import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";

// Per-card share card: card art + name + lowest live price, so a shared /card link
// unfurls as a price comparison (not just raw art). Replaces the plain-art OG that
// generateMetadata used to set (that `images` field is now removed so this wins).
export const runtime = "nodejs"; // Prisma needs the Node runtime
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "RiftCompare — Riftbound card price";

const accent = "#34d17e";
const whereParam = (p: string) => ({ OR: [{ slug: p }, { id: p }] });

export default async function Image({ params }: { params: { id: string } }) {
  let card: {
    name: string;
    setCode: string;
    collectorNumber: string;
    lowestPriceCents: number | null;
    imageUrl: string | null;
    imageThumbUrl: string | null;
  } | null = null;
  try {
    card = await prisma.card.findFirst({
      where: whereParam(params.id),
      select: { name: true, setCode: true, collectorNumber: true, lowestPriceCents: true, imageUrl: true, imageThumbUrl: true },
    });
  } catch {
    /* fall through to the generic card below */
  }

  const name = card?.name ?? "Riftbound card";
  const setLine = card ? `${card.setCode} · ${card.collectorNumber}` : "RiftCompare";
  const price = card?.lowestPriceCents != null ? formatMoney(card.lowestPriceCents) : null;
  const art = card?.imageUrl ?? card?.imageThumbUrl ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #0b0f17 0%, #101826 55%, #0c2018 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Left: brand + name + price */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, paddingRight: 40 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 56,
                height: 56,
                borderRadius: 14,
                background: accent,
                color: "#06130c",
                fontSize: 34,
                fontWeight: 800,
                marginRight: 18,
              }}
            >
              R
            </div>
            <div style={{ color: "#e2e8f0", fontSize: 28, fontWeight: 700 }}>RiftCompare</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ color: "#94a3b8", fontSize: 26, fontWeight: 600, textTransform: "uppercase", letterSpacing: 2 }}>{setLine}</div>
            <div style={{ color: "#ffffff", fontSize: name.length > 22 ? 60 : 74, fontWeight: 800, lineHeight: 1.02, marginTop: 8 }}>{name}</div>
            {price ? (
              <div style={{ display: "flex", alignItems: "baseline", marginTop: 20 }}>
                <div style={{ color: "#94a3b8", fontSize: 30, fontWeight: 600, marginRight: 14 }}>from</div>
                <div style={{ color: accent, fontSize: 84, fontWeight: 800, lineHeight: 1 }}>{price}</div>
              </div>
            ) : null}
          </div>

          <div style={{ color: "#cbd5e1", fontSize: 22, fontWeight: 500 }}>Compare live prices across AU · US · UK · SG · CA · DE</div>
        </div>

        {/* Right: card art */}
        {art ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 340 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={art} width={330} height={460} style={{ borderRadius: 18, objectFit: "cover", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} alt="" />
          </div>
        ) : null}
      </div>
    ),
    size
  );
}
