import { ImageResponse } from "next/og";

// Social-share card for /riftle — drawn with plain divs (no font/emoji fetches) so
// it renders deterministically on the edge. Mimics the game's wordle-style grid.
export const runtime = "edge";
export const alt = "Riftle — the daily Riftbound card guessing game on RiftCompare";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HIT = "#34d17e";
const MISS = "#232a36";
const ROWS: number[][] = [
  // 1 = green, 0 = dark — an "almost solved" board for flavour.
  [0, 0, 1, 0, 0, 0],
  [0, 1, 1, 0, 1, 0],
  [1, 1, 1, 0, 1, 1],
  [1, 1, 1, 1, 1, 1],
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
        {/* Left: wordmark + tagline */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 84,
                height: 84,
                borderRadius: 20,
                background: HIT,
                color: "#06130c",
                fontSize: 56,
                fontWeight: 800,
                marginRight: 24,
              }}
            >
              R
            </div>
            <div style={{ display: "flex", fontSize: 96, fontWeight: 800, color: "#ffffff", letterSpacing: -3 }}>
              Riftle
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 38, color: "#cbd5e1", lineHeight: 1.3 }}>
            The daily Riftbound card guessing game
          </div>
          <div style={{ display: "flex", marginTop: 18, fontSize: 28, color: "#7c8696" }}>
            8 guesses · new card every day · free, no signup
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 36,
              fontSize: 30,
              fontWeight: 700,
              color: HIT,
            }}
          >
            riftcompare.com/riftle
          </div>
        </div>

        {/* Right: the board */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {ROWS.map((row, i) => (
            <div key={i} style={{ display: "flex", marginTop: i === 0 ? 0 : 14 }}>
              {row.map((c, j) => (
                <div
                  key={j}
                  style={{
                    display: "flex",
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    marginLeft: j === 0 ? 0 : 14,
                    background: c ? HIT : MISS,
                    border: c ? "none" : "2px solid #2e3848",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
