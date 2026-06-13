import { ImageResponse } from "next/og";

// Generic branded share-card generator. Any feature can point its OG/Twitter image
// at /api/og?t=…&s=…&l=…&b=… to make a shared link unfurl with a custom card
// (Riftle results today; deck cost, pack pulls and collection value can reuse it).
// No emoji — ImageResponse has no emoji font unless one is fetched, so they'd be
// blank gaps; we use plain text + shapes only.
//
// NOTE: this is a route handler, so it may only export HTTP methods + Next route
// config — `size`/`contentType` (the opengraph-image.tsx convention) are NOT valid
// exports here; the dimensions live in a local const instead.
const SIZE = { width: 1200, height: 630 };

const HEX = /^#[0-9a-fA-F]{6}$/;
const clip = (s: string | null, n: number) => (s ?? "").slice(0, n);

export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = clip(searchParams.get("t"), 28) || "RiftCompare";
  const stat = clip(searchParams.get("s"), 16); // big highlighted figure
  const label = clip(searchParams.get("l"), 40); // small line under the stat
  const sub = clip(searchParams.get("b"), 90) || "Riftbound prices, games & tools";
  const accent = HEX.test(searchParams.get("c") ?? "") ? searchParams.get("c")! : "#34d17e";

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
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 16,
              background: accent,
              color: "#06130c",
              fontSize: 40,
              fontWeight: 800,
              marginRight: 20,
            }}
          >
            R
          </div>
          <div style={{ color: "#e2e8f0", fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>RiftCompare</div>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#94a3b8", fontSize: 34, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>
            {title}
          </div>
          {stat ? (
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 8 }}>
              <div style={{ color: accent, fontSize: 150, fontWeight: 800, lineHeight: 1, letterSpacing: -4 }}>{stat}</div>
              {label ? <div style={{ color: "#cbd5e1", fontSize: 40, fontWeight: 600, marginLeft: 28 }}>{label}</div> : null}
            </div>
          ) : (
            label ? <div style={{ color: "#fff", fontSize: 64, fontWeight: 800, marginTop: 10 }}>{label}</div> : null
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ color: "#cbd5e1", fontSize: 30, fontWeight: 500, maxWidth: 820 }}>{sub}</div>
          <div style={{ color: accent, fontSize: 26, fontWeight: 700 }}>riftcompare.com</div>
        </div>
      </div>
    ),
    SIZE
  );
}
