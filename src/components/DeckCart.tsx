import { buildDeckCart, type DeckCartLine } from "@/lib/deck-basket";
import type { BasketPlan } from "@/lib/basket";
import { formatMoney } from "@/lib/format";
import { type Country } from "@/lib/country";
import { getDisplayCurrency } from "@/lib/get-country";
import { gbpCentsToEur } from "@/lib/fx";
import { OutboundLink } from "@/components/OutboundLink";
import { ebaySearchUrl } from "@/lib/affiliate";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";

// "Build this deck: cheapest whole cart" — the buy list. Runs the landed-cost
// optimiser over every in-stock store listing for the deck's cards and shows
// the cheapest consolidated cart, per store, with direct buy links. Free +
// public (affiliate-monetized). Renders nothing if no cards are buyable yet.
export async function DeckCart({ lines, country }: { lines: DeckCartLine[]; country: Country }) {
  const plan = await buildDeckCart(lines, country);
  return <DeckCartView plan={plan} country={country} />;
}

/**
 * The rendering half, split out so a caller that has ALREADY run the optimiser
 * can show the same table without running it twice. The deck-group landing pages
 * need the plan's own numbers (total, store count) for their FAQ copy and their
 * JSON-LD before the markup is built, and a second buildDeckCart() call for the
 * same deck would double this page's database reads for an identical answer —
 * which the egress rules in lib/db.ts exist to prevent.
 *
 * `heading`/`note` default to the per-deck wording, so <DeckCart> renders
 * byte-identically to before this split.
 */
export function DeckCartView({
  plan,
  country,
  heading = "Build this deck — cheapest cart",
  note,
  className = "mt-6",
}: {
  plan: BasketPlan | null;
  country: Country;
  heading?: string;
  note?: string;
  className?: string;
}) {
  if (!plan || plan.stores.length === 0) return null;

  // A European shopper browsing the UK market (real GBP stores) sees the cart
  // total converted to EUR — a reference, not what they're actually charged.
  const currency = getDisplayCurrency(country);
  const isEurDisplay = country === "UK" && currency === "EUR";
  const fmt = (c: number) => formatMoney(isEurDisplay ? gbpCentsToEur(c) : c, currency);

  return (
    <section className={`card-surface overflow-hidden ${className}`}>
      <div className="border-b border-ink-700 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">{heading}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {note ??
                `${plan.matchedCards} cards priced, bought across ${plan.storeCount} ${
                  plan.storeCount === 1 ? "store" : "stores"
                } to minimise total delivered cost.`}
            </p>
          </div>
          <div className="text-right">
            <div className="num text-2xl font-extrabold text-white">{fmt(plan.totalCents)}</div>
            <div className="text-[11px] text-slate-500">
              {fmt(plan.itemsCents)} cards + {fmt(plan.shippingCents)} postage
            </div>
          </div>
        </div>
        {plan.savedCents > 0 && (
          <p className="mt-2 inline-block rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
            Saves {fmt(plan.savedCents)} vs buying each card from its own cheapest store ({plan.naiveStoreCount} stores, more postage)
          </p>
        )}
      </div>

      <div className="divide-y divide-ink-800">
        {plan.stores.map((s) => (
          <div key={s.key} className="p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white">{s.name}</h3>
              <div className="text-right text-xs text-slate-500">
                <span className="num text-slate-300">{fmt(s.subtotalCents)}</span>
                {" + "}
                {s.freeShipping ? (
                  <span className="text-emerald-400">free postage</span>
                ) : (
                  <span className="num">{fmt(s.shippingCents)} postage</span>
                )}
              </div>
            </div>
            <ul className="space-y-1 text-sm">
              {s.lines.map((l, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <OutboundLink
                    href={l.url}
                    retailer={s.key}
                    country={country}
                    className="min-w-0 truncate text-slate-300 hover:text-brand-400"
                  >
                    {l.qty}× {l.name}
                  </OutboundLink>
                  <span className="num shrink-0 text-slate-500">{fmt(l.unitCents * l.qty)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {plan.unbuyable.length > 0 && (
        <div className="border-t border-ink-800 p-4 text-xs text-slate-500">
          Not in stock at a tracked store right now:{" "}
          {/* Each name is now an eBay search for that card, rather than one
              shared link into /browse. The old copy sent people back to the
              database that had just told them the card was unavailable — a
              circular answer at the highest-intent moment on the page, since
              this reader has a complete decklist, a total, and exactly these
              cards standing between them and buying it. eBay is excluded from
              the cart optimiser on purpose (per-item postage doesn't consolidate
              — see lib/deck-basket), which is precisely why it's the right
              fallback for the lines the optimiser couldn't fill. */}
          {plan.unbuyable.map((u, i) => (
            <span key={i}>
              {i > 0 && ", "}
              {u.qty}×{" "}
              <OutboundLink
                href={ebaySearchUrl(country, `${u.name} Riftbound`, "deck-unbuyable")}
                retailer="ebay_deck"
                country={country}
                className="text-brand-400 hover:underline"
              >
                {u.name}
              </OutboundLink>
            </span>
          ))}
          {" "}— try eBay for the cards no tracked store has right now.
        </div>
      )}
      {/* Every line above is an affiliate-wrapped store link (see lib/deck-basket). */}
      <div className="border-t border-ink-800 px-4 pb-3">
        <AffiliateDisclosure partner="both" tight />
      </div>
    </section>
  );
}
