import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { ALL_FALLBACK_RETAILERS, isPreorderSetCode, setByCode } from "@/lib/constants";
import { getSetChecklist } from "@/lib/set-checklist";
import { ownedBySet } from "@/lib/set-owned";
import { cardSearchName } from "@/lib/card-name";
import { cardHref } from "@/lib/card-url";
import { affiliateUrl, ebaySearchUrl, riftboundEbayQuery } from "@/lib/affiliate";
import { pickGapLinks, scanGap, SCAN_GAP_PAGE } from "@/lib/scan/set-gap";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

// GET /api/scan/set-gap?set=OGN&offset=0 — "Complete my set" under the card scanner (DECISIONS.md 2026-11-19 "Complete
// my set after a scan"). The signed-in member's missing cards of ONE set, cheapest first, six at a time, each with its
// eBay search (a tagged link: zero eBay API calls), its TCGplayer row and its cheapest real-store row.
//
// Reads: the set's cached checklist (lib/set-checklist.ts, shared by every reader in a market, called directly, never
// inside another cache), the member's owned map for that one set (lib/set-owned.ts, one narrow groupBy), then ONE
// RetailerPrice read and ONE Card read scoped to the six cards on this page. Per member, uncached, no-store.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: NO_STORE });
  const q = new URL(req.url).searchParams;
  const set = setByCode(q.get("set")?.trim().toUpperCase() ?? "");
  if (!set || isPreorderSetCode(set.code)) return NextResponse.json({ error: "Unknown set" }, { status: 400, headers: NO_STORE });
  const offset = Number(q.get("offset") ?? 0) || 0;
  const country = getCountry();

  try {
    const [cards, owned] = await Promise.all([getSetChecklist(set.code, country), ownedBySet(prisma, user.id, set.code)]);
    const gap = scanGap(cards, owned, { offset, size: SCAN_GAP_PAGE });
    const ids = gap.page.map((c) => c.id);
    const [rows, art] = ids.length
      ? await Promise.all([
          prisma.retailerPrice.findMany({
            where: { cardId: { in: ids }, country, inStock: true, priceCents: { gt: 0 } },
            select: { cardId: true, retailer: true, retailerName: true, url: true, priceCents: true, currency: true, condition: true, inStock: true, derived: true },
            take: 400,
          }),
          prisma.card.findMany({ where: { id: { in: ids } }, select: { id: true, imageThumbUrl: true, imageUrl: true, tags: true } }),
        ])
      : [[], []];
    const links = pickGapLinks(rows, ALL_FALLBACK_RETAILERS);
    const artById = new Map(art.map((a) => [a.id, a]));
    const items = gap.page.map((c) => {
      const l = links.get(c.id);
      const a = artById.get(c.id);
      const query = riftboundEbayQuery(cardSearchName(c.name, { ...c, tags: a?.tags ?? null }));
      return {
        id: c.id,
        name: c.name,
        number: `${c.setCode}-${c.collectorNumber}`,
        rarity: c.rarity,
        image: a?.imageThumbUrl ?? a?.imageUrl ?? null,
        href: cardHref(c),
        minCents: c.minCents,
        stores: c.stores,
        ebayHref: ebaySearchUrl(country, query, "scan-set"),
        tcgplayer: l?.tcgplayer ? { href: affiliateUrl(l.tcgplayer.url, l.tcgplayer.retailer, "/scan"), priceCents: l.tcgplayer.priceCents, currency: l.tcgplayer.currency } : null,
        store: l?.store
          ? {
              key: l.store.retailer,
              name: l.store.retailerName,
              href: affiliateUrl(l.store.url, l.store.retailer, "/scan", { checkout: false }),
              productUrl: l.store.url,
              priceCents: l.store.priceCents,
              currency: l.store.currency,
              condition: l.store.condition,
            }
          : null,
      };
    });
    return NextResponse.json(
      {
        set: { code: set.code, name: set.name, slug: set.slug },
        currency: COUNTRIES[country].currency,
        total: gap.total,
        have: gap.have,
        buyable: gap.buyable,
        costCents: gap.costCents,
        notStocked: gap.notStocked,
        items,
        next: gap.next,
      },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json({ error: "Couldn't load the set just now." }, { status: 500, headers: NO_STORE });
  }
}
