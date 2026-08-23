import { ImageResponse } from "next/og";
import { getSharedListing } from "@/lib/share";
import { formatMoney } from "@/lib/format";
import { CONDITIONS } from "@/lib/constants";

// The unfurl is the entire point of the share link. A bare URL in a Discord
// channel is a grey box nobody clicks; the same URL showing the card art, the
// asking price and "22% under stores" is the pitch itself, made before anyone
// opens anything. This image is therefore not decoration — it is the product
// surface that travels.
export const runtime = "nodejs"; // Prisma needs the Node runtime
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "RiftCompare marketplace listing";

const accent = "#34d17e";

export default async function Image({ params }: { params: { token: string } }) {
  // A dead/rotated token still has to render SOMETHING: Discord caches whatever
  // it gets, and an error here becomes a permanently broken preview for that
  // URL. Falling back to plain branding keeps the unfurl intact.
  const l = await getSharedListing(params.token).catch(() => null);

  const name = l?.card.name ?? "Riftbound single";
  const setLine = l ? `${l.card.setCode} · ${l.card.collectorNumber}` : "RiftCompare Marketplace";
  const price = l ? formatMoney(l.priceCents, l.currency) : null;
  const art = l?.card.imageUrl ?? l?.card.imageThumbUrl ?? null;
  const cond = l ? (CONDITIONS[l.condition]?.full ?? l.condition) : null;
  const savingPct =
    l?.marketCents != null && l.marketCents > l.priceCents
      ? Math.round(((l.marketCents - l.priceCents) / l.marketCents) * 100)
      : null;
  const sold = l != null && (l.status !== "ACTIVE" || l.quantity === 0);

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
            <div style={{ color: "#e2e8f0", fontSize: 28, fontWeight: 700 }}>RiftCompare Marketplace</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ color: "#94a3b8", fontSize: 26, fontWeight: 600, textTransform: "uppercase", letterSpacing: 2 }}>
              {setLine}
            </div>
            <div style={{ color: "#ffffff", fontSize: name.length > 22 ? 58 : 70, fontWeight: 800, lineHeight: 1.02, marginTop: 8 }}>
              {name}
            </div>
            {price ? (
              <div style={{ display: "flex", alignItems: "baseline", marginTop: 18 }}>
                <div style={{ color: sold ? "#64748b" : accent, fontSize: 82, fontWeight: 800, lineHeight: 1 }}>{price}</div>
                {cond ? (
                  <div style={{ color: "#94a3b8", fontSize: 28, fontWeight: 600, marginLeft: 18 }}>{cond}</div>
                ) : null}
              </div>
            ) : null}
            {sold ? (
              <div style={{ color: "#f5a524", fontSize: 30, fontWeight: 700, marginTop: 12 }}>Sold — see current prices</div>
            ) : savingPct != null && savingPct > 0 ? (
              <div style={{ color: accent, fontSize: 30, fontWeight: 700, marginTop: 12 }}>
                {`${savingPct}% under the cheapest store`}
              </div>
            ) : null}
          </div>

          <div style={{ color: "#cbd5e1", fontSize: 22, fontWeight: 500 }}>Buyer protection on every order</div>
        </div>

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
