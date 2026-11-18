import { ImageResponse } from "next/og";
import { getPriceMovers } from "@/lib/price-history";
import { DEFAULT_COUNTRY } from "@/lib/country";

// /movers' share image (owner, 2026-11-18: "we need more shareable artefacts"): this week's four biggest risers and
// three biggest drops, the same lists and basis the page shows, text only (the 2026-11-08 Vercel cost cap: no card
// art) and cached a day like the page. ASCII signs only (see market/opengraph-image.tsx: satori has no glyph for the
// triangle arrows). Falls back to a plain card when the lists are empty or can't be read.
export const runtime = "nodejs";
export const revalidate = 86400;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Riftbound price movers this week on RiftCompare: the biggest risers and drops";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}...` : s);
const usd = (c: number) => (c >= 100_000 ? `$${Math.round(c / 100).toLocaleString("en-US")}` : `$${(c / 100).toFixed(2)}`);
const pct = (p: number) => `${p > 0 ? "+" : p < 0 ? "-" : ""}${Math.abs(p).toFixed(1)}%`;

type Row = { id: string; name: string; cents: number; pct: number };

function Line({ r }: { r: Row }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", fontSize: 30, marginTop: 10 }}>
      <div style={{ display: "flex", width: 150, fontWeight: 800, color: r.pct >= 0 ? "#34d17e" : "#f87171" }}>{pct(r.pct)}</div>
      <div style={{ display: "flex", flex: 1, color: "#f1f5f9" }}>{clip(r.name, 40)}</div>
      <div style={{ display: "flex", color: "#cbd5e1" }}>{usd(r.cents)}</div>
    </div>
  );
}

export default async function Image() {
  let up: Row[] = [];
  let down: Row[] = [];
  try {
    const m = await getPriceMovers(DEFAULT_COUNTRY, 5, { preSwitch: true });
    const row = (x: (typeof m.spiking)[number]): Row => ({ id: x.card.id, name: x.card.name, cents: x.nowCents, pct: x.pct });
    up = m.spiking.slice(0, 4).map(row);
    down = m.plummeting.slice(0, 3).map(row);
  } catch {
    /* plain card below */
  }
  const accent = "#f29733"; // lib/brand.ts ORANGE_LIGHT
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "44px 64px", background: "linear-gradient(135deg, #04131c 0%, #062436 55%, #013951 100%)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 12, background: accent, color: "#1e3043", fontSize: 30, fontWeight: 800, marginRight: 14 }}>R</div>
          <div style={{ display: "flex", color: "#e2e8f0", fontSize: 28, fontWeight: 700 }}>RiftCompare</div>
        </div>
        <div style={{ display: "flex", color: "#ffffff", fontSize: 54, fontWeight: 800, marginTop: 18 }}>Riftbound price movers this week</div>
        {up.length || down.length ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
            {up.map((r) => (
              <Line key={`u${r.id}`} r={r} />
            ))}
            {down.length > 0 && <div style={{ display: "flex", height: 2, background: "rgba(255,255,255,0.14)", marginTop: 14, marginBottom: 4 }} />}
            {down.map((r) => (
              <Line key={`d${r.id}`} r={r} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", color: "#cbd5e1", fontSize: 34, marginTop: 40 }}>The biggest risers and drops in Riftbound card prices, updated daily.</div>
        )}
        <div style={{ display: "flex", marginTop: "auto", color: "#94a3b8", fontSize: 24 }}>7-day change · riftcompare.com/movers</div>
      </div>
    ),
    { ...size, headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
