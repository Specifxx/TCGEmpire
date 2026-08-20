import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { MARKETPLACE_PUBLIC } from "@/lib/marketplace";
import { setByCode } from "@/lib/constants";

// Google Merchant Center product feed — RSS 2.0 with the g: namespace, one
// item per ACTIVE marketplace listing. Registered in Merchant Center as a
// scheduled fetch (one registration per target country/currency, all hitting
// this route with ?country=). Public by design: Merchant Center fetches an
// unauthenticated URL; robots.ts already permits non-/api paths.
//
// Pre-launch (MARKETPLACE_PUBLIC unset) this serves an EMPTY but valid channel
// rather than a 404, so the feed URL can be registered ahead of launch and
// simply starts carrying items the moment the flag flips.
//
// Always computed fresh (no ISR): Merchant Center only pulls this on its own
// daily schedule, so the cost of a live query is negligible, and it removes a
// real feed/site mismatch window — a listing that sells out or gets
// price-edited between ISR refreshes used to still show as in_stock at the
// old price here for up to an hour after the live /card page had already
// updated (revalidateCardPage() busts that page instantly on every listing
// mutation; this route had no equivalent). Matches the same
// force-dynamic + always-query-live-data pattern /marketplace/page.tsx
// already uses for the same "never show a stale price" reason.
export const dynamic = "force-dynamic";

const FEED_COUNTRIES = new Set(["AU", "US", "UK", "SG", "CA"]);

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// NM sells as "new" (mint, unplayed); every played grade maps to Google's
// "used" — consistent with the card page's schema.org itemCondition mapping.
const gCondition = (condition: string) => (condition === "NM" ? "new" : "used");

const CONDITION_LABEL: Record<string, string> = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const countryParam = (url.searchParams.get("country") ?? "AU").toUpperCase();
  const country = FEED_COUNTRIES.has(countryParam) ? countryParam : "AU";

  const listings = MARKETPLACE_PUBLIC
    ? await prisma.marketplaceListing
        .findMany({
          where: { status: "ACTIVE", quantity: { gt: 0 }, country },
          select: {
            id: true,
            priceCents: true,
            currency: true,
            condition: true,
            isFoil: true,
            card: { select: { id: true, name: true, slug: true, setCode: true, collectorNumber: true, imageUrl: true } },
            seller: { select: { displayName: true, sellerProfile: { select: { shopName: true } } } },
          },
          orderBy: { createdAt: "desc" },
          take: 5000,
        })
        .catch(() => [])
    : [];

  const items = listings
    // image_link is required by Merchant Center — skip cards without art.
    .filter((l) => l.card.imageUrl?.startsWith("http"))
    .map((l) => {
      const setName = setByCode(l.card.setCode)?.name ?? l.card.setCode;
      const condLabel = CONDITION_LABEL[l.condition] ?? l.condition;
      const title = `${l.card.name} — ${setName} ${l.card.collectorNumber} (${condLabel}${l.isFoil ? " Foil" : ""}) Riftbound TCG`;
      const shop = l.seller.sellerProfile?.shopName ?? l.seller.displayName;
      const link = `${SITE_URL}/card/${l.card.slug ?? l.card.id}?listing=${l.id}&utm_source=google&utm_medium=shopping`;
      const description =
        `${l.card.name} single from Riftbound: ${setName} (${l.card.setCode} ${l.card.collectorNumber}), ` +
        `${condLabel}${l.isFoil ? ", foil" : ""}. Sold by ${shop} on RiftCompare — payment held in escrow until delivery.`;
      return `  <item>
    <g:id>${esc(l.id)}</g:id>
    <g:title>${esc(title)}</g:title>
    <g:description>${esc(description)}</g:description>
    <g:link>${esc(link)}</g:link>
    <g:image_link>${esc(l.card.imageUrl!)}</g:image_link>
    <g:price>${(l.priceCents / 100).toFixed(2)} ${esc(l.currency)}</g:price>
    <g:availability>in_stock</g:availability>
    <g:condition>${gCondition(l.condition)}</g:condition>
    <g:identifier_exists>false</g:identifier_exists>
    <g:brand>Riftbound</g:brand>
    <g:google_product_category>Arts &amp; Entertainment &gt; Hobbies &amp; Creative Arts &gt; Collectibles &gt; Collectible Trading Cards</g:google_product_category>
    <g:product_type>${esc(`Riftbound > ${setName} > Singles`)}</g:product_type>
  </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>RiftCompare Marketplace — Riftbound singles (${esc(country)})</title>
  <link>${SITE_URL}/marketplace</link>
  <description>Riftbound TCG singles from verified sellers on the RiftCompare Marketplace.</description>
${items}
</channel>
</rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
