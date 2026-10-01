import { ImageResponse } from "next/og";

// The share card for every /pokemon page without its own image (the product and
// set pages pass their product image instead), so a Pokémon link never unfurls
// with the site default's Riftbound card. Static: no data, no font or emoji
// fetches, generated once at build.
export const alt = "Pokémon sealed prices on RiftCompare";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const RED = "#e5484d";
const KINDS = ["Booster boxes", "Elite Trainer Boxes", "Booster bundles", "Collections"];

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
          background: "linear-gradient(135deg, #0b0f17 0%, #151a26 60%, #2a1016 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              width: 64,
              height: 64,
              borderRadius: 32,
              border: "6px solid #0b0f17",
              background: `linear-gradient(180deg, ${RED} 50%, #ffffff 50%)`,
              marginRight: 22,
            }}
          />
          <div style={{ display: "flex", fontSize: 40, fontWeight: 800, color: "#ffffff" }}>RiftCompare</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: "#ffffff", letterSpacing: -2 }}>Pokémon sealed prices</div>
          <div style={{ display: "flex", fontSize: 32, color: "#a3acbb", marginTop: 12 }}>
            TCGplayer and eBay, compared in your market. Updated daily.
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {KINDS.map((k) => (
            <div
              key={k}
              style={{
                display: "flex",
                padding: "14px 22px",
                borderRadius: 14,
                border: `2px solid ${RED}66`,
                background: `${RED}1f`,
                color: "#ffffff",
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              {k}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
