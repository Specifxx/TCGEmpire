import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The share card for /radiance-preorders (2026-10-15, owner: "it needs to have a
// very, very nice thumbnail" for the Reddit post). Reddit, Discord and X unfurl
// this image. Static: three Radiance cards already in public/ are read from disk
// at build and inlined, so generating it needs no network and no database. It
// carries no price and no live count, because a share image is cached by every
// platform that fetches it and would go stale; "every store, compared daily" is
// true for as long as the page exists.
export const runtime = "nodejs";
export const alt = "Riftbound Radiance pre-order prices: booster boxes, packs and bundles compared across every store";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GOLD = "#f5c451";
const GREEN = "#34d17e";
const CARDS = [
  "heartsteel-ksante-courageous.jpg",
  "ekko-boy-who-shattered-time.jpg",
  "seraphine-starry-eyed-songstress.jpg",
];

// Inter ExtraBold (SIL Open Font License), committed so the build needs no font
// fetch: ImageResponse's bundled font is regular weight only, which made the
// headline read thin.
function font(): ArrayBuffer {
  const buf = readFileSync(join(process.cwd(), "assets", "fonts", "Inter-ExtraBold.ttf"));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function art(file: string): string {
  const buf = readFileSync(join(process.cwd(), "public", "radiance-spoilers", file));
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

export default function OgImage() {
  const arts = CARDS.map(art);
  // Drawn left, right, then middle, so the raised middle card sits on top.
  const order = [0, 2, 1];
  // A fan: left and right cards tilted out, the middle one raised.
  const pose = [
    { left: 20, top: 70, rotate: -9 },
    { left: 150, top: 20, rotate: 0 },
    { left: 280, top: 70, rotate: 9 },
  ];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "radial-gradient(circle at 78% 45%, #3a2a0e 0%, #151a26 42%, #0b0f17 100%)",
          fontFamily: "Inter",
        }}
      >
        {/* Left: the words */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 660,
            padding: "56px 0 56px 68px",
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
                background: GREEN,
                color: "#06130c",
                fontSize: 34,
                fontWeight: 800,
                marginRight: 14,
              }}
            >
              R
            </div>
            <div style={{ display: "flex", fontSize: 38, fontWeight: 800, letterSpacing: -1 }}>
              <span style={{ color: "#ffffff" }}>Rift</span>
              <span style={{ color: GREEN }}>Compare</span>
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
              OUT 23 OCTOBER 2026
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 22 }}>
              <span style={{ fontSize: 78, fontWeight: 800, color: "#ffffff", letterSpacing: -3, lineHeight: 1 }}>
                Radiance
              </span>
              <span style={{ fontSize: 56, fontWeight: 800, color: GOLD, letterSpacing: -2, lineHeight: 1.1 }}>
                pre-order prices
              </span>
            </div>
            <div style={{ display: "flex", marginTop: 22, fontSize: 30, color: "#c9d1dc", lineHeight: 1.3 }}>
              Booster boxes, packs and bundles at every store we track, side by side.
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
            <div style={{ display: "flex", alignItems: "center", marginLeft: 8, color: GREEN, fontSize: 24, fontWeight: 800 }}>
              Daily
            </div>
          </div>
        </div>

        {/* Right: the cards */}
        <div style={{ display: "flex", position: "relative", width: 540, height: 630 }}>
          {order.map((i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={CARDS[i]}
              src={arts[i]}
              alt=""
              width={220}
              height={308}
              style={{
                position: "absolute",
                left: pose[i].left,
                top: 120 + pose[i].top,
                transform: `rotate(${pose[i].rotate}deg)`,
                borderRadius: 14,
                boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
                border: i === 1 ? `3px solid ${GOLD}` : "3px solid rgba(255,255,255,0.12)",
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Inter", data: font(), weight: 800, style: "normal" }] },
  );
}
