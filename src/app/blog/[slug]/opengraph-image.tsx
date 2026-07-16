import { ImageResponse } from "next/og";
import { getBlogPost } from "@/lib/posts";

// Market reports live in the DB, so we need the Node runtime for Prisma.
export const runtime = "nodejs";
export const alt = "RiftCompare Blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#34d17e";

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
            "linear-gradient(135deg, #0b0f17 0%, #101826 55%, #0c2018 100%)",
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
              background: GREEN,
              color: "#06130c",
              fontSize: 34,
              fontWeight: 800,
              marginRight: 18,
            }}
          >
            R
          </div>
          <div
            style={{
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
              background: "rgba(52,209,126,0.15)",
              border: `2px solid ${GREEN}`,
              color: GREEN,
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
