import { ImageResponse } from "next/og";
import { getBlogPost } from "@/lib/posts";

// Market reports live in the DB, so we need the Node runtime for Prisma.
export const runtime = "nodejs";
export const alt = "RiftCompare Blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND = "#f29733"; // lib/brand.ts ORANGE_LIGHT (2026-10-16 rebrand)

export default async function Image({ params }: { params: { slug: string } }) {
  const a = await getBlogPost(params.slug);
  const title = a?.title ?? "RiftCompare Blog";
  const excerpt = a?.excerpt
    ? a.excerpt.length > 120
      ? a.excerpt.slice(0, 117) + "..."
      : a.excerpt
    : "";
  const date = a?.date
    ? new Date(a.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

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
          background:
            "linear-gradient(135deg, #04131c 0%, #062436 55%, #013951 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top: brand + badge */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 14,
              background: BRAND,
              color: "#1e3043",
              fontSize: 34,
              fontWeight: 800,
              marginRight: 18,
            }}
          >
            R
          </div>
          <div
            style={{
              display: "flex",
              color: "#e2e8f0",
              fontSize: 28,
              fontWeight: 700,
              marginRight: 24,
            }}
          >
            RiftCompare
          </div>
          <div
            style={{
              display: "flex",
              padding: "6px 18px",
              borderRadius: 999,
              background: "rgba(239,125,0,0.15)",
              border: `2px solid ${BRAND}`,
              color: BRAND,
              fontSize: 22,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            Blog
          </div>
        </div>

        {/* Middle: title + excerpt */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", marginTop: 20 }}>
          <div
            style={{
              display: "flex",
              color: "#ffffff",
              fontSize: title.length > 45 ? 52 : 64,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -1,
            }}
          >
            {title}
          </div>
          {excerpt && (
            <div
              style={{
                display: "flex",
                color: "#94a3b8",
                fontSize: 28,
                lineHeight: 1.4,
                marginTop: 20,
                maxWidth: 900,
              }}
            >
              {excerpt}
            </div>
          )}
        </div>

        {/* Bottom: date */}
        {date && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                color: "#64748b",
                fontSize: 24,
                fontWeight: 600,
              }}
            >
              {date}
            </div>
          </div>
        )}
      </div>
    ),
    size,
  );
}
