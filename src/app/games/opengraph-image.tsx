import { ImageResponse } from "next/og";

// Social-share / promo card for the Games hub. Static (plain divs, no font or
// emoji fetches) so it's generated once at build — also the image Reddit/Discord
// unfurl when the /games link is shared. No emoji here: ImageResponse has no emoji
// font unless one is fetched, so they'd render as blank gaps.
export const alt = "Riftbound Games on RiftCompare — five free mini-games";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#34d17e";
const TILES = [
  { name: "Riftle", sub: "Daily card puzzle", c: "#34d17e" },
  { name: "Higher or Lower", sub: "Price streak game", c: "#f5a524" },
  { name: "Price Check", sub: "Guess the price", c: "#e5484d" },
  { name: "Zoomed In", sub: "Name the art", c: "#a855f7" },
  { name: "Pairs", sub: "Memory match", c: "#3b82f6" },
];

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
        {/* Header */}
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
                color: "#06130c",
                fontSize: 46,
                fontWeight: 800,
                marginRight: 20,
              }}
            >
              R
            </div>
            <div style={{ display: "flex", fontSize: 60, fontWeight: 800, letterSpacing: -2 }}>
              <span style={{ color: "#ffffff" }}>Rift</span>
              <span style={{ color: GREEN }}>Compare</span>
              <span style={{ color: "#7c8696", marginLeft: 18 }}>Games</span>
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: GREEN }}>5 free games</div>
        </div>

        {/* Tiles */}
        <div style={{ display: "flex", gap: 18 }}>
          {TILES.map((t) => (
            <div
              key={t.name}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                height: 240,
                borderRadius: 20,
                padding: "22px 20px",
                justifyContent: "space-between",
                background: `linear-gradient(160deg, ${t.c}26, #141b28)`,
                border: `2px solid ${t.c}66`,
              }}
            >
              <div style={{ display: "flex", width: 46, height: 46, borderRadius: 12, background: t.c }} />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 27, fontWeight: 800, color: "#ffffff", lineHeight: 1.1 }}>{t.name}</div>
                <div style={{ display: "flex", fontSize: 18, color: "#8b95a5", marginTop: 6 }}>{t.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 30, color: "#cbd5e1" }}>
            Built on live Riftbound card data — no signup, play forever
          </div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 800, color: GREEN }}>riftcompare.com/games</div>
        </div>
      </div>
    ),
    size
  );
}
