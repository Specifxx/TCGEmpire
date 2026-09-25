import React from "react";
import { ogMarketsFooter, type OgPriceLine } from "@/lib/og-price";

// The /card share image's composition, as a pure function of already-loaded
// data. It lives here rather than in card/[id]/opengraph-image.tsx for the same
// reason lib/hot40-og.tsx does: a Next image route may only export the names
// Next recognises, and a plain module can be rendered from a fixture and looked
// at without a database (scripts/render-card-og.tsx). The route is the data hop.
export const CARD_OG_SIZE = { width: 1200, height: 630 };

const accent = "#34d17e";

export function CardOgImage({
  name,
  setLine,
  headline,
  others,
  art,
}: {
  name: string;
  setLine: string;
  headline: OgPriceLine | null;
  others: OgPriceLine[];
  art: string | null;
}) {
  return (
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
          {headline ? (
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 20 }}>
              <div style={{ color: "#94a3b8", fontSize: 30, fontWeight: 600, marginRight: 14 }}>from</div>
              <div style={{ color: accent, fontSize: 84, fontWeight: 800, lineHeight: 1 }}>{headline.text}</div>
            </div>
          ) : null}
          {/* The other priced markets, each in its own currency. The symbols
              (£ € A$ C$ S$) already name the market, so no flag emoji: satori
              would fetch an emoji font over the network for every render. One
              row, no wrap: 19px keeps five four-figure prices inside the
              ~676px beside the art (scripts/render-card-og.tsx's worst case). */}
          {others.length > 0 ? (
            <div style={{ display: "flex", marginTop: 18 }}>
              {others.slice(0, 5).map((o) => (
                <div
                  key={o.market}
                  style={{
                    display: "flex",
                    color: "#e2e8f0",
                    fontSize: 19,
                    fontWeight: 600,
                    padding: "4px 10px",
                    marginRight: 8,
                    borderRadius: 9,
                    background: "rgba(148,163,184,0.16)",
                  }}
                >
                  {o.text}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ color: "#cbd5e1", fontSize: 22, fontWeight: 500 }}>{ogMarketsFooter()}</div>
      </div>

      {/* Right: card art */}
      {art ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 340 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art} width={330} height={460} style={{ borderRadius: 18, objectFit: "cover", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} alt="" aria-hidden="true" />
        </div>
      ) : null}
    </div>
  );
}
