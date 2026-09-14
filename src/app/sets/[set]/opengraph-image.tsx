import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { setBySlug } from "@/lib/constants";

// Per-set share card: set name + code + a real card count, so a shared
// /sets/<slug> link unfurls with something specific to that set rather than
// the sitewide brand-only default (src/app/opengraph-image.tsx), which every
// set page fell back to before this file existed. One route covers every
// set via the [set] segment — not Radiance-specific.
export const runtime = "nodejs"; // Prisma needs the Node runtime
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "RiftCompare — Riftbound set card list & prices";

const GREEN = "#34d17e";

export default async function Image({ params }: { params: { set: string } }) {
  const set = setBySlug(params.set);
  const cardCount = set
    ? await prisma.card.count({ where: { setCode: set.code } }).catch(() => null)
    : null;

  const name = set?.name ?? "Riftbound";
  const status = set?.comingSoon ? "Coming soon" : cardCount ? `${cardCount.toLocaleString()} cards tracked` : "Card list & prices";

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
              width: 64,
              height: 64,
              flexShrink: 0,
              borderRadius: 16,
              background: GREEN,
              color: "#06130c",
              fontSize: 42,
              fontWeight: 800,
              marginRight: 18,
            }}
          >
            R
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
            <span style={{ color: "#ffffff" }}>Rift</span>
            <span style={{ color: GREEN }}>Compare</span>
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 48, fontSize: 84, fontWeight: 800, color: "#ffffff", letterSpacing: -2 }}>
          Riftbound {name}
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 34, color: GREEN, fontWeight: 700 }}>
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
