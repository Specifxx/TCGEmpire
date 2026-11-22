// The one real deal /premium's test P1 shows to arm B (lib/premium-ab.ts):
// the biggest gap the Deal Finder shows today, a US store price under
// TCGplayer's market price, never eBay. Same loader and filter as the Premium
// email's snippet (loadEmailDeals); getArbitrageVsTcgplayer caches itself, so
// this adds no database read per visit. Any error or no deal: null, and the
// B line is simply not drawn.
import { defaultTcgBuyKeys, getArbitrageVsTcgplayer } from "./arbitrage";
import { cardHref } from "./card-url";
import { formatMoney } from "./format";
import type { PremiumProofDeal } from "@/components/premium/PremiumDealProof";

export async function loadPremiumProofDeal(): Promise<PremiumProofDeal | null> {
  try {
    const buy = defaultTcgBuyKeys("US").filter((k) => !k.startsWith("ebay"));
    const page = await getArbitrageVsTcgplayer("US", { buy, sort: "saving", page: 1, pageSize: 6 });
    const i = page.items.find((x) => !x.buyStore.startsWith("ebay") && x.belowPct >= 1);
    if (!i) return null;
    return {
      name: i.card.name,
      href: cardHref(i.card),
      store: i.buyStoreName,
      price: formatMoney(i.buyCents, "USD"),
      market: formatMoney(i.marketCents, "USD"),
      belowPct: i.belowPct,
    };
  } catch {
    return null;
  }
}
