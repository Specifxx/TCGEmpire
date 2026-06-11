import { ImageResponse } from "next/og";

// Default social-share card for the whole site. Applies to every route that
// doesn't set its own image (card pages override it with the real card art, the
// Riftle page has its own). Drawn with plain divs — no font/emoji fetches — so
// it's statically generated once at build.
export const alt = "RiftCompare — Riftbound card prices compared across stores";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#34d17e";

// A stylised price-comparison list: three "store rows", cheapest highlighted.
const ROWS = [
  { w: 150, win: true },
  { w: 190, win: false },
  { w: 120, win: false },
];

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "70px 80px",
          background: "linear-gradient(135deg, #0b0f17 0%, #101826 55%, #0c2018 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Left: wordmark + pitch */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 660 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 84,
                height: 84,
                borderRadius: 20,
                background: GREEN,
                color: "#06130c",
                fontSize: 56,
                fontWeight: 800,
                marginRight: 24,
              }}
            >
              R
            </div>
            <div style={{ display: "flex", fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>
              <span style={{ color: "#ffffff" }}>Rift</span>
              <span style={{ color: GREEN }}>Compare</span>
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 30, fontSize: 40, color: "#e6ebf2", lineHeight: 1.25, fontWeight: 700 }}>
            Riftbound card prices, compared
          </div>
          <div style={{ display: "flex", marginTop: 14, fontSize: 28, color: "#8b95a5", lineHeight: 1.4 }}>
            Every card · every store · cheapest first
          </div>
          {/* No emoji here on purpose: ImageResponse has no emoji font unless one
              is fetched, so flags would render as blank gaps. */}
          <div style={{ display: "flex", marginTop: 30, fontSize: 26, color: "#7c8696" }}>
            Australia · New Zealand · United States · United Kingdom
          </div>
        </div>

        {/* Right: stylised price-comparison rows, cheapest highlighted */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {ROWS.map((r, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                width: 330,
                marginTop: i === 0 ? 0 : 18,
                padding: "18px 22px",
                borderRadius: 16,
                background: r.win ? "rgba(52,209,126,0.14)" : "#141b28",
                border: r.win ? `3px solid ${GREEN}` : "2px solid #243047",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: r.win ? GREEN : "#243047",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 16 }}>
                <div style={{ display: "flex", width: r.w, height: 14, borderRadius: 7, background: r.win ? "#9fe8c4" : "#37445c" }} />
                <div style={{ display: "flex", width: 70, height: 12, borderRadius: 6, marginTop: 10, background: r.win ? GREEN : "#2c374b" }} />
              </div>
              {r.win && (
                <div
                  style={{
                    display: "flex",
                    marginLeft: "auto",
                    padding: "6px 14px",
                    borderRadius: 999,
                    background: GREEN,
                    color: "#06210f",
                    fontSize: 22,
                    fontWeight: 800,
                  }}
                >
                  BEST
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
