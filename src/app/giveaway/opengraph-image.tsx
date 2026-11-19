import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// /giveaway's share card (owner, 2026-11-19: "the link thumbnail should be really nice"). The prize itself, from the
// site's own card-art copy (assets/og/giveaway-mf-captain.jpg, made from public/card-art), so the image needs no
// network and no database and is prerendered once per build. No live count: every platform caches the image.
// Text stays inside x 60-1140, nothing essential below ~560 (Reddit and X overlay the domain there).
export const runtime = "nodejs";
export const alt = "Free Riftbound giveaway: win a Miss Fortune, Captain Showcase alternate art from Origins. Worldwide, closes 14 December 2026.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GOLD = "#f5c451";
const BRAND = "#f29733";

function file(...p: string[]): Buffer {
  return readFileSync(join(process.cwd(), ...p));
}

export default function OgImage() {
  const fontBuf = file("assets", "fonts", "Inter-ExtraBold.ttf");
  const font = fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength) as ArrayBuffer;
  const art = `data:image/jpeg;base64,${file("assets", "og", "giveaway-mf-captain.jpg").toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "radial-gradient(circle at 80% 50%, #5a2a10 0%, #24161a 38%, #0b0f17 100%)",
          fontFamily: "Inter",
          padding: "52px 64px 72px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 700 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 50,
                height: 50,
                borderRadius: 14,
                background: BRAND,
                color: "#1e3043",
                fontSize: 32,
                fontWeight: 800,
                marginRight: 14,
              }}
            >
              R
            </div>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>
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
              FREE GIVEAWAY · WORLDWIDE
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 22, color: "#ffffff", lineHeight: 1.02, letterSpacing: -2 }}>
              <span style={{ fontSize: 58, color: "#cbd5e1" }}>Win</span>
              <span style={{ fontSize: 84 }}>Miss Fortune,</span>
              <span style={{ fontSize: 84 }}>Captain</span>
            </div>
            <div style={{ display: "flex", marginTop: 18, fontSize: 30, color: GOLD }}>Origins Showcase alternate art</div>
          </div>

          <div style={{ display: "flex", fontSize: 26, color: "#cbd5e1" }}>Free entry · shipping on us · closes 14 Dec</div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              display: "flex",
              borderRadius: 22,
              padding: 6,
              background: `linear-gradient(160deg, ${GOLD} 0%, ${BRAND} 100%)`,
              boxShadow: "0 0 80px rgba(245,151,51,0.55)",
              transform: "rotate(4deg)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={art} width={340} height={475} style={{ borderRadius: 17 }} />
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Inter", data: font, weight: 800, style: "normal" }] },
  );
}
