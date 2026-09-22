import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { cardImageSrc } from "@/lib/card-image-url";
import { formatMoney } from "@/lib/format";
import { hotListName, snapshotDateLabel, type RisingSnapshotData } from "@/lib/rising-snapshot";

// The unfurl for a shared Hot 40 link (owner, 2026-09-22: "the link that we
// generate should have a better thumbnail with the card at #1 featured").
//
// Before this the route had no opengraph-image, so every forwarded link fell
// through to the site-wide default — the same generic card in Discord, iMessage
// and X whichever snapshot you sent. A share link whose picture never changes
// looks like a link to the site rather than to a list, which is most of the
// reason a forwarded one gets ignored.
//
// So: the #1 card's own art, at size, next to its real numbers. Everything drawn
// here is read off the FROZEN `data` column — the same values the page shows —
// so the picture and the page can never disagree, and an old link keeps
// unfurling with the card that actually led it rather than today's leader.
//
// runtime = "nodejs" because Prisma cannot run on edge, matching the other two
// data-backed OG routes (app/opengraph-image.tsx, blog/[slug]).
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "RiftCompare Hot 40 — Riftbound cards ranked by demand and price-timing signals";

const GREEN = "#34d17e";
const ROSE = "#fb7185";

export default async function Image({ params }: { params: { token: string } }) {
  const snap = await prisma.risingSnapshot
    .findUnique({ where: { token: params.token }, select: { data: true, createdAt: true } })
    .catch(() => null);

  const data = (snap?.data ?? null) as RisingSnapshotData | null;
  const picks = data?.picks ?? [];
  const top = picks[0];
  // A brand-only composition is the fallback for a missing token, an empty run
  // or a database blip — an unfurl must still produce an image, never a 500.
  const name = picks.length > 0 ? hotListName(picks.length) : "RiftCompare Hot 40";
  const art = top ? cardImageSrc({ imageThumbUrl: top.imageThumbUrl }, { full: true, absolute: true }) : null;
  const dateLabel = snap ? snapshotDateLabel(new Date(snap.createdAt)) : null;
  const up = (top?.trend7 ?? 0) >= 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "56px 64px",
          background: "linear-gradient(135deg, #0b0f17 0%, #101826 55%, #0c2018 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* ── Left: the list's name, then the card that leads it ─────────── */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 660 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 800,
                color: GREEN,
                letterSpacing: -0.5,
              }}
            >
              {name}
            </div>
          </div>

          {top ? (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 46,
                    height: 46,
                    borderRadius: 10,
                    background: GREEN,
                    color: "#06210f",
                    fontSize: 26,
                    fontWeight: 900,
                  }}
                >
                  1
                </div>
                <div style={{ display: "flex", fontSize: 20, color: "#94a3b8" }}>
                  {`${top.setCode} · ${top.collectorNumber}`}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  marginTop: 14,
                  fontSize: top.displayName.length > 28 ? 52 : 64,
                  fontWeight: 800,
                  color: "#ffffff",
                  lineHeight: 1.05,
                }}
              >
                {top.displayName}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 22 }}>
                {top.priceCents != null && (
                  <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#e2e8f0" }}>
                    {formatMoney(top.priceCents, top.currency)}
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    padding: "6px 14px",
                    borderRadius: 999,
                    background: up ? "rgba(52,209,126,0.14)" : "rgba(251,113,133,0.14)",
                    color: up ? GREEN : ROSE,
                    fontSize: 28,
                    fontWeight: 800,
                  }}
                >
                  {`${up ? "+" : "−"}${Math.abs(top.trend7).toFixed(1)}% 7d`}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", marginTop: 20, fontSize: 40, fontWeight: 700, color: "#e2e8f0" }}>
              Riftbound cards ranked by demand and price-timing signals
            </div>
          )}

          <div style={{ display: "flex", marginTop: 30, fontSize: 20, color: "#64748b" }}>
            {dateLabel ? `Frozen ${dateLabel} · riftcompare.com` : "riftcompare.com"}
          </div>
        </div>

        {/* ── Right: the card itself. The whole point of the change. ─────── */}
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art}
            alt=""
            width={340}
            height={475}
            style={{ width: 340, height: 475, borderRadius: 18, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: 340,
              height: 475,
              borderRadius: 18,
              background: "rgba(148,163,184,0.10)",
            }}
          />
        )}
      </div>
    ),
    size,
  );
}
