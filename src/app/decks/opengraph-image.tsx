import { ImageResponse } from "next/og";
import { META_DECKS } from "@/lib/meta-decks";

// Social-share card for /decks. Before this existed the route fell back to the
// generic site-wide OG image, so every shared deck-index link unfurled as the
// logo — indistinguishable from the homepage in a Discord or Reddit feed.
//
// Deliberately REGION-NEUTRAL: no prices, no currency. Build cost is resolved per
// visitor from a cookie (lib/get-country.ts), so any figure baked in here would be
// wrong for five of the six markets and can't be varied per request anyway — an
// OG image is generated once and cached by the scraper, not by the reader.
//
// Static (plain divs, no font or emoji fetches) so it's generated at build time.
export const alt = "Riftbound Vendetta top meta decks on RiftCompare — tiered tournament decklists with live build costs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#34d17e";

// Tier 1 + 2 legends, straight from the same data the page renders.
const HEADLINE = META_DECKS.filter((d) => d.tier === "1" || d.tier === "2").slice(0, 4);

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #0b0f17 0%, #101826 55%, #0c2018 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 72,
                height: 72,
                borderRadius: 18,
                background: GREEN,
                color: "#0b0e14",
                fontSize: 44,
                fontWeight: 900,
              }}
            >
              R
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 22 }}>
              <div style={{ color: "#ffffff", fontSize: 34, fontWeight: 800 }}>RiftCompare</div>
              <div style={{ color: "#8b93a7", fontSize: 22 }}>Riftbound price comparison</div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 22px",
              borderRadius: 999,
              background: GREEN,
              color: "#0b0e14",
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: 1,
            }}
          >
            VENDETTA META
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#ffffff", fontSize: 76, fontWeight: 900, lineHeight: 1.05 }}>Top Meta Decks</div>
          <div style={{ color: "#c2c9d6", fontSize: 30, marginTop: 16, lineHeight: 1.35 }}>
            Real top-finishing Vendetta decklists, card-for-card —
          </div>
          <div style={{ color: "#c2c9d6", fontSize: 30, lineHeight: 1.35 }}>
            each priced live across the stores near you.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center" }}>
          {HEADLINE.map((d) => (
            <div
              key={d.slug}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "14px 20px",
                marginRight: 14,
                borderRadius: 14,
                border: "1.5px solid #223044",
                background: "rgba(16,24,38,0.75)",
              }}
            >
              <div style={{ color: "#ffffff", fontSize: 22, fontWeight: 800 }}>{d.name.split(",")[0]}</div>
              <div style={{ color: "#8b93a7", fontSize: 18 }}>Tier {d.tier} · {d.archetype}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
