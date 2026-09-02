import { ImageResponse } from "next/og";
import { getMarketIndex } from "@/lib/market-index";

// Share card for the RiftCompare Index: the live level + 7-day move, so a shared
// /market link unfurls as a market snapshot. Best-effort — falls back to a generic
// card if the index can't be read.
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "The RiftCompare Index — the Riftbound market in one number";

export default async function Image() {
  let level: string | null = null;
  let d7: number | null = null;
  try {
    const index = await getMarketIndex();
    if (index) {
      level = index.latest.toFixed(1);
      d7 = index.d7;
    }
  } catch {
    /* generic fallback below */
  }
  const up = d7 != null && d7 > 0;
  const flat = d7 == null || d7 === 0;
  const deltaColor = flat ? "#94a3b8" : up ? "#34d17e" : "#f87171";
  // ASCII ONLY. This used to render "▲ +2.4%" / "▼ 2.4%" / "■ 0%" (U+25B2 /
  // U+25BC / U+25A0, the Geometric Shapes block). Satori's built-in font has no
  // glyph for those, so @vercel/og fell back to fetching one from Google Fonts
  // at build time — which answers 400 for that request and logged
  // "Failed to load dynamic font for ▲" on every deploy. The direction is
  // already carried by deltaColor (green/red/grey), so a +/- sign says the same
  // thing with no network dependency and no missing-glyph tofu.
  // The "·" and "—" used in the other OG routes are fine: both are in the
  // standard Latin set the embedded font covers.
  const deltaText = d7 == null ? "" : `${up ? "+" : d7 < 0 ? "-" : ""}${Math.abs(d7)}% (7d)`;
  const accent = "#34d17e";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #0b0f17 0%, #101826 55%, #0c2018 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 60,
              height: 60,
              borderRadius: 15,
              background: accent,
              color: "#06130c",
              fontSize: 38,
              fontWeight: 800,
              marginRight: 18,
            }}
          >
            R
          </div>
          <div style={{ color: "#e2e8f0", fontSize: 30, fontWeight: 700 }}>RiftCompare</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#94a3b8", fontSize: 34, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>
            The RiftCompare Index
          </div>
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 10 }}>
            <div style={{ color: "#ffffff", fontSize: 150, fontWeight: 800, lineHeight: 1, letterSpacing: -4 }}>{level ?? "—"}</div>
            {deltaText ? <div style={{ color: deltaColor, fontSize: 46, fontWeight: 700, marginLeft: 28 }}>{deltaText}</div> : null}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ color: "#cbd5e1", fontSize: 30, fontWeight: 500, maxWidth: 820 }}>
            The Riftbound singles market in one number — updated weekly.
          </div>
          <div style={{ color: accent, fontSize: 26, fontWeight: 700 }}>riftcompare.com/market</div>
        </div>
      </div>
    ),
    size
  );
}
