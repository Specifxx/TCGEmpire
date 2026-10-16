import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { setBySlug, showsAsNew } from "@/lib/constants";

// Per-set share card: set name + code + a real card count, so a shared
// /sets/<slug> link unfurls with something specific to that set rather than
// the sitewide brand-only default (src/app/opengraph-image.tsx), which every
// set page fell back to before this file existed. One route covers every
// set via the [set] segment — not Radiance-specific.
export const runtime = "nodejs"; // Prisma needs the Node runtime
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "RiftCompare — Riftbound set card list & prices";

const BRAND = "#f29733"; // lib/brand.ts ORANGE_LIGHT (2026-10-16 rebrand)

export default async function Image({ params }: { params: { set: string } }) {
  const set = setBySlug(params.set);
  const cardCount = set
    ? await prisma.card.count({ where: { setCode: set.code } }).catch(() => null)
    : null;

  const name = set?.name ?? "Riftbound";
  // A pre-release set whose `newFrom` day has come says "New set" (lib/constants.ts showsAsNew).
  const status = set?.comingSoon ? (showsAsNew(set) ? "New set" : "Coming soon") : cardCount ? `${cardCount.toLocaleString()} cards tracked` : "Card list & prices";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px",
          background: "linear-gradient(135deg, #04131c 0%, #062436 55%, #013951 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              flexShrink: 0,
              borderRadius: 16,
              background: BRAND,
              color: "#1e3043",
              fontSize: 42,
              fontWeight: 800,
              marginRight: 18,
            }}
          >
            R
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
            <span style={{ color: "#ffffff" }}>Rift</span>
            <span style={{ color: BRAND }}>Compare</span>
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 48, fontSize: 84, fontWeight: 800, color: "#ffffff", letterSpacing: -2 }}>
          Riftbound {name}
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 34, color: BRAND, fontWeight: 700 }}>
          {status}
        </div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 24, color: "#8b95a5" }}>
          Compared across every tracked store · updated daily
        </div>
      </div>
    ),
    size,
  );
}
