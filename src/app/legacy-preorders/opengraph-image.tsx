import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The share card for /legacy-preorders (2026-10-25). Same frame as
// /radiance-preorders' image, but text only: no Legacy card has been revealed,
// so there is no card art of ours to fan out, and the image needs no network
// and no database. Static, so it is prerendered once per build (CURRENT-STATE,
// "Share images"). No price and no live count: every platform caches it.
export const runtime = "nodejs";
export const alt = "Riftbound Legacy pre-order prices: booster boxes, Vault Bundles and Champion Decks compared across every store";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GOLD = "#f5c451";
const BRAND = "#f29733"; // lib/brand.ts ORANGE_LIGHT (2026-10-16 rebrand)

function font(): ArrayBuffer {
  const buf = readFileSync(join(process.cwd(), "assets", "fonts", "Inter-ExtraBold.ttf"));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

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
          padding: "56px 68px",
          background: "radial-gradient(circle at 78% 45%, #3a2a0e 0%, #151a26 42%, #0b0f17 100%)",
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 14,
              background: BRAND,
              color: "#1e3043",
              fontSize: 34,
              fontWeight: 800,
              marginRight: 14,
            }}
          >
            R
          </div>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 800, letterSpacing: -1 }}>
            <span style={{ color: "#ffffff" }}>Rift</span>
            <span style={{ color: BRAND }}>Compare</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "8px 18px",
              borderRadius: 999,
              background: "rgba(245,196,81,0.16)",
              border: `2px solid ${GOLD}`,
              color: GOLD,
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: 2,
            }}
          >
            PRE-ORDER · SET 6
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 22 }}>
            <span style={{ fontSize: 96, fontWeight: 800, color: "#ffffff", letterSpacing: -3, lineHeight: 1 }}>Legacy</span>
            <span style={{ fontSize: 60, fontWeight: 800, color: GOLD, letterSpacing: -2, lineHeight: 1.1 }}>
              pre-order prices
            </span>
          </div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 30, color: "#c9d1dc", lineHeight: 1.3 }}>
            Booster boxes, Vault Bundles and Champion Decks at every store we track, side by side.
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          {["AU", "US", "UK", "CA", "EU", "SG"].map((m) => (
            <div
              key={m}
              style={{
                display: "flex",
                padding: "8px 16px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.07)",
                color: "#e6ebf2",
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              {m}
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", marginLeft: 8, color: BRAND, fontSize: 24, fontWeight: 800 }}>
            Daily
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Inter", data: font(), weight: 800, style: "normal" }] },
  );
}
