import React from "react";
import { formatMoney } from "@/lib/format";
import { cardImageForOg } from "@/lib/card-image-url";
import { hotListName, type RisingSnapshotPick } from "@/lib/rising-snapshot";

// The Hot 40 share image's composition, as a pure function of the frozen data.
//
// SEPARATE FROM THE ROUTE ON PURPOSE. A Next image route may only export the
// handful of names Next recognises (default, alt, size, contentType, runtime…),
// so a helper exported from opengraph-image.tsx is rejected by `next build`
// even though `tsc` accepts it — the same trap that moved the /gallery title
// builders into lib/gallery-seo.ts. Keeping the composition here also means it
// can be rendered and LOOKED AT without a database: scripts/render-hot40-og.tsx
// draws it from a fixture, which is how the layout was checked before it
// shipped rather than after.
export const HOT40_SIZE = { width: 1200, height: 630 };

const GREEN = "#34d17e";
const ROSE = "#fb7185";

/** "+8.2%" / "−1.4%" — the sign is explicit so a reader never has to infer it. */
function delta(v: number): string {
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;
}

/** Satori has no ellipsis, so long names are cut here rather than overflowing. */
function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

// cardImageForOg, NOT cardImageSrc: the mirror is WebP and satori cannot
// decode it — see that helper's comment. Null means "draw the placeholder".
const artOf = (p: RisingSnapshotPick | undefined): string | null =>
  p ? cardImageForOg({ imageThumbUrl: p.imageThumbUrl }) : null;

/** One of the two runner-up rows: rank, art, name, 7-day move. */
function Runner({ p, rank }: { p: RisingSnapshotPick; rank: number }) {
  const up = p.trend7 >= 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ display: "flex", width: 22, fontSize: 24, fontWeight: 800, color: "#64748b" }}>{String(rank)}</div>
      {artOf(p) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artOf(p)!} alt="" aria-hidden="true" width={40} height={56} style={{ width: 40, height: 56, borderRadius: 5, objectFit: "cover" }} />
      ) : (
        <div style={{ display: "flex", width: 40, height: 56, borderRadius: 5, background: "rgba(148,163,184,0.12)" }} />
      )}
      <div style={{ display: "flex", flex: 1, fontSize: 26, fontWeight: 600, color: "#cbd5e1" }}>
        {clip(p.displayName, 24)}
      </div>
      <div style={{ display: "flex", fontSize: 26, fontWeight: 800, color: up ? GREEN : ROSE }}>{delta(p.trend7)}</div>
    </div>
  );
}


/**
 * The whole 1200x630 frame. `picks` is the frozen snapshot's list (may be
 * empty), `dateLabel` the already-formatted freeze date (null when unknown).
 */
export function Hot40Image({ picks, dateLabel }: { picks: RisingSnapshotPick[]; dateLabel: string | null }) {
  const top = picks[0];
  const runners = picks.slice(1, 3);
  const name = picks.length > 0 ? hotListName(picks.length) : "RiftCompare Hot 40";
  const art = artOf(top);
  const up = (top?.trend7 ?? 0) >= 0;

  return (

  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "48px 60px",
      background: "linear-gradient(135deg, #0b0f17 0%, #101826 55%, #0c2018 100%)",
      fontFamily: "sans-serif",
    }}
  >
    {/* ── Left: the list's name, its leader, then the runners-up ─────── */}
    <div style={{ display: "flex", flexDirection: "column", width: 700 }}>
      <div style={{ display: "flex", fontSize: 28, fontWeight: 800, color: GREEN, letterSpacing: -0.5 }}>{name}</div>

      {top ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: 9,
                background: GREEN,
                color: "#06210f",
                fontSize: 24,
                fontWeight: 900,
              }}
            >
              1
            </div>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: "#ffffff", lineHeight: 1.05 }}>
              {clip(top.displayName, 26)}
            </div>
          </div>

          {/* #1's numbers: price, the 7-day move, and the 30-day move. */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>
            {top.priceCents != null && (
              <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#e2e8f0" }}>
                {formatMoney(top.priceCents, top.currency)}
              </div>
            )}
            <div
              style={{
                display: "flex",
                padding: "5px 13px",
                borderRadius: 999,
                background: up ? "rgba(52,209,126,0.14)" : "rgba(251,113,133,0.14)",
                color: up ? GREEN : ROSE,
                fontSize: 26,
                fontWeight: 800,
              }}
            >
              {`${delta(top.trend7)} 7d`}
            </div>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: "#94a3b8" }}>
              {`${delta(top.trend30)} 30d`}
            </div>
          </div>

          {runners.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                marginTop: 22,
                paddingTop: 20,
                borderTop: "1px solid rgba(148,163,184,0.18)",
              }}
            >
              {runners.map((p, i) => (
                <Runner key={p.id} p={p} rank={i + 2} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", marginTop: 18, fontSize: 38, fontWeight: 700, color: "#e2e8f0" }}>
          Riftbound cards ranked by demand and price-timing signals
        </div>
      )}

      <div style={{ display: "flex", marginTop: 24, fontSize: 19, color: "#64748b" }}>
        {dateLabel ? `Frozen ${dateLabel} · riftcompare.com` : "riftcompare.com"}
      </div>
    </div>

    {/* ── Right: #1's own art, still the biggest thing in the frame. ─── */}
    {art ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={art} alt="" aria-hidden="true" width={335} height={468} style={{ width: 335, height: 468, borderRadius: 18, objectFit: "cover" }} />
    ) : (
      <div style={{ display: "flex", width: 335, height: 468, borderRadius: 18, background: "rgba(148,163,184,0.10)" }} />
    )}
  </div>
  );
}
