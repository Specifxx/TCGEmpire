import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";

// Default social-share card for the whole site — the image that unfurls in
// Discord, Slack, iMessage, Facebook and X for every route that doesn't set its
// own (card pages override it with their own art; Riftle has its own).
//
// It used to be a MOCK-UP: three rounded rectangles containing grey placeholder
// bars, drawn to *suggest* a price comparison. Nothing on it was real, so the
// single most-shared image of the product demonstrated nothing the product
// does — it was an illustration of a UI rather than the UI. This renders the
// real thing instead: a genuine card, its genuine art, and the genuine
// competing store prices for it, cheapest highlighted, exactly as the site
// ranks them. Someone seeing this in a chat window learns what the site is for.
//
// runtime = "nodejs" because Prisma cannot run on edge. This is generated once
// at build (a static route), so the query below costs one small read per
// deploy, not per share.
export const runtime = "nodejs";
export const alt = "RiftCompare — Riftbound card prices compared across stores";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#34d17e";

type Row = { name: string; price: string };
type Featured = { name: string; setLine: string; art: string | null; rows: Row[] } | null;

// The market to draw. ONE market, not "the cheapest listings anywhere": the
// first cut of this took the three lowest prices across every country and
// produced a card showing "TCGplayer £0.00 / TCGplayer US$0.05 / TCGplayer
// S$0.10" — the same shop three times, in three currencies, which is a
// currency conversion rather than a price comparison and reads as broken.
const OG_MARKET = "US";
// Below this the card is bulk filler. The first cut ordered by listing count,
// which selects for commons that every shop stocks — it picked a five-cent
// card, and "$0.05" as the hero number undersells the product badly.
const MIN_INTERESTING_CENTS = 500;

// One card, several real stores in ONE market, cheapest first — the product in
// a single picture. A comparison needs at least two DISTINCT retailers to be a
// comparison, so candidates are scanned until one qualifies rather than
// trusting the first row the database returns.
async function loadFeatured(): Promise<Featured> {
  try {
    const candidates = await prisma.card.findMany({
      where: {
        imageUrl: { not: null },
        lowestPriceCentsUs: { gte: MIN_INTERESTING_CENTS },
        retailerPrices: { some: { inStock: true, country: OG_MARKET } },
      },
      orderBy: { lowestPriceCentsUs: "desc" },
      take: 20,
      select: {
        name: true,
        setCode: true,
        collectorNumber: true,
        imageUrl: true,
        imageThumbUrl: true,
        retailerPrices: {
          where: { inStock: true, country: OG_MARKET },
          orderBy: { priceCents: "asc" },
          select: { retailerName: true, priceCents: true, currency: true },
        },
      },
    });

    for (const card of candidates) {
      // One row per retailer — a store's second listing for the same card is
      // not a competitor, and showing it twice makes the comparison look fake.
      const seen = new Set<string>();
      const rows: Row[] = [];
      for (const p of card.retailerPrices) {
        if (seen.has(p.retailerName)) continue;
        seen.add(p.retailerName);
        rows.push({ name: p.retailerName, price: formatMoney(p.priceCents, p.currency) });
        if (rows.length === 3) break;
      }
      if (rows.length < 2) continue;
      return {
        name: card.name,
        setLine: `${card.setCode} · ${card.collectorNumber}`,
        art: card.imageUrl ?? card.imageThumbUrl,
        rows,
      };
    }
    return null;
  } catch {
    // A build with no database reachable still needs to produce an image, so
    // the caller falls back to the brand-only composition below.
    return null;
  }
}

export default async function OgImage() {
  const featured = await loadFeatured();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #0b0f17 0%, #101826 55%, #0c2018 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* ── Left: wordmark + pitch ─────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 470 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 78,
                height: 78,
                // Without this the flex parent squeezes the tile to a sliver
                // once the text beside it is wide enough — the logo rendered as
                // a green bar with no "R" in it.
                flexShrink: 0,
                borderRadius: 18,
                background: GREEN,
                color: "#06130c",
                fontSize: 52,
                fontWeight: 800,
                marginRight: 22,
              }}
            >
              R
            </div>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 800, letterSpacing: -2 }}>
              <span style={{ color: "#ffffff" }}>Rift</span>
              <span style={{ color: GREEN }}>Compare</span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 26,
              fontSize: 38,
              color: "#e6ebf2",
              lineHeight: 1.25,
              fontWeight: 700,
            }}
          >
            Riftbound card prices, compared
          </div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 26, color: "#8b95a5" }}>
            Every card · every store · cheapest first
          </div>
          {/* No emoji here on purpose: ImageResponse has no emoji font unless one
              is fetched, so flags would render as blank gaps.
              SIX markets — this line read "Australia · New Zealand · United
              States · United Kingdom" long after Singapore and Canada shipped,
              so the most-shared image of the site was advertising two thirds of
              its coverage. Abbreviated because six full country names wrap to
              three lines at this width. */}
          <div style={{ display: "flex", marginTop: 26, fontSize: 25, color: "#7c8696" }}>
            AU · NZ · US · UK · Singapore · Canada
          </div>
        </div>

        {/* ── Right: a REAL comparison, or brand-only if the DB was unreachable ── */}
        {featured ? (
          <div style={{ display: "flex", alignItems: "center" }}>
            {featured.art && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={featured.art}
                alt=""
                width={196}
                height={274}
                style={{
                  width: 196,
                  height: 274,
                  borderRadius: 16,
                  objectFit: "cover",
                  border: "2px solid #243047",
                  marginRight: 22,
                }}
              />
            )}
            <div style={{ display: "flex", flexDirection: "column", width: 300 }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 25,
                  fontWeight: 700,
                  color: "#ffffff",
                  marginBottom: 2,
                }}
              >
                {featured.name.length > 24 ? `${featured.name.slice(0, 23)}…` : featured.name}
              </div>
              <div style={{ display: "flex", fontSize: 19, color: "#7c8696", marginBottom: 16 }}>
                {featured.setLine}
              </div>
              {featured.rows.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: i === 0 ? 0 : 12,
                    padding: "14px 18px",
                    borderRadius: 14,
                    background: i === 0 ? "rgba(52,209,126,0.14)" : "#141b28",
                    border: i === 0 ? `3px solid ${GREEN}` : "2px solid #243047",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      maxWidth: 172,
                    }}
                  >
                    <div style={{ display: "flex", fontSize: 20, color: "#cdd5e0" }}>
                      {r.name.length > 17 ? `${r.name.slice(0, 16)}…` : r.name}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      fontSize: 24,
                      fontWeight: 800,
                      color: i === 0 ? GREEN : "#8b95a5",
                    }}
                  >
                    {r.price}
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", marginTop: 14, fontSize: 19, color: "#7c8696" }}>
                Live prices · updated daily
              </div>
            </div>
          </div>
        ) : null}
      </div>
    ),
    size,
  );
}
