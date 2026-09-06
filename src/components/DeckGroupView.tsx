import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { COUNTRIES, type Country } from "@/lib/country";
import { cardHref } from "@/lib/card-url";
import { cardImageAlt } from "@/lib/image-alt";
import { DomainBadge } from "@/components/Badge";
import { TierBadge } from "@/components/TierBadge";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubFaq } from "@/components/HubFaq";
import { DeckCartView } from "@/components/DeckCart";
import { EbayBuyCta } from "@/components/EbayBuyCta";
import type { BasketPlan } from "@/lib/basket";
import type { ResolvedDeck } from "@/lib/meta-decks";
import { championForCardName } from "@/lib/champions";
import { domainSlug } from "@/lib/domains";
import {
  deckCostVerdict,
  deckGroupHeading,
  deckGroupPath,
  groupStaples,
  liveDeckGroups,
  type DeckGroup,
} from "@/lib/deck-groups";
import type { GroupFaqEntry } from "@/lib/deck-group-jsonld";

/**
 * The rendered half of a deck-group landing page. One component for both axes
 * (/decks/archetype/* and /decks/domain/*) so the two templates cannot drift on
 * markup, structure or disclosure — but every word of copy on the page comes
 * from the group's own entry and its own decks, so no two pages read the same.
 *
 * EVERY PRICE ON THIS PAGE PASSES THROUGH deckCostVerdict(). A deck whose cost
 * isn't publishable renders the reason ("not enough live listings yet") instead
 * of a number: on a page whose entire promise is "what does this cost", a
 * plausible-looking wrong figure is worse than an honest gap.
 */
export function DeckGroupView({
  group,
  decks,
  cartPlan,
  cartDeck,
  faqs,
  country,
}: {
  group: DeckGroup;
  decks: ResolvedDeck[];
  cartPlan: BasketPlan | null;
  cartDeck: ResolvedDeck | null;
  faqs: GroupFaqEntry[];
  country: Country;
}) {
  const info = COUNTRIES[country];
  const currency = info.currency;

  const axisLabel = group.axis === "archetype" ? "Archetype" : "Domain";
  const trail = [
    { name: "Meta decks", href: "/decks" },
    { name: `${group.name} ${axisLabel.toLowerCase()}`, href: deckGroupPath(group) },
  ];

  // Costs, filtered through the sanity verdict before anything is rendered.
  const costed = decks
    .map((d) => ({ deck: d, verdict: deckCostVerdict(d) }))
    .filter((x) => x.verdict.ok && x.verdict.totalCents != null);
  const cheapest = costed.length ? costed.reduce((a, b) => (b.verdict.totalCents! < a.verdict.totalCents! ? b : a)) : null;
  const dearest = costed.length ? costed.reduce((a, b) => (b.verdict.totalCents! > a.verdict.totalCents! ? b : a)) : null;

  const tiers = [...new Set(decks.map((d) => d.tier))].sort();
  const legends = decks.map((d) => ({
    deck: d,
    champion: championForCardName(d.legend),
  }));
  const championLinks = [
    ...new Map(
      legends
        .filter((l) => l.champion)
        .map((l) => [l.champion!.slug, l.champion!])
    ).values(),
  ];

  // Domains this group's lists actually play, tallied from the real decks.
  const domainCounts = new Map<string, number>();
  for (const d of decks) for (const dom of d.domains) domainCounts.set(dom, (domainCounts.get(dom) ?? 0) + 1);
  const domainsByCount = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]);

  // What these lists agree on, enriched with whichever resolved card row the
  // deck resolver already fetched — no extra query, and no price invented for a
  // staple we couldn't resolve.
  const resolvedByName = new Map<string, ResolvedDeck["items"][number]["card"]>();
  for (const d of decks) {
    for (const it of d.items) if (it.card && !resolvedByName.has(it.inputName)) resolvedByName.set(it.inputName, it.card);
  }
  const staples = groupStaples(decks).slice(0, 12);

  // liveDeckGroups(), NOT DECK_GROUPS: a group no real deck belongs to 404s, so
  // listing it here would ship a broken internal link on every sibling page —
  // /decks/domain/colorless today, and whichever archetype empties out next.
  const siblings = liveDeckGroups().filter((g) => g.axis === group.axis && g.slug !== group.slug);

  // A searchable card name, in preference order: the cheapest list's legend, the
  // most-shared staple, then the headline deck's legend. Only falls back to the
  // group label when the page has no resolved card at all.
  const ebayQuery =
    stripStarter(cheapest?.deck.legend) ??
    staples[0]?.name ??
    stripStarter(decks[0]?.legend) ??
    `Riftbound ${group.name}`;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Breadcrumbs trail={trail} />
        <span className="chip bg-brand-500 text-[10px] font-extrabold uppercase tracking-wide text-ink-950">
          {axisLabel}
        </span>
        <h1 className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">{deckGroupHeading(group)}</h1>

        <div className="mt-3 max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400">
          <p>
            {decks.length} real tournament {decks.length === 1 ? "list" : "lists"} in the current metagame{" "}
            {group.axis === "archetype" ? (
              <>
                carry the <strong className="text-slate-200">{group.name}</strong> label
              </>
            ) : (
              <>
                play the <strong className="text-slate-200">{group.name}</strong> domain
              </>
            )}
            {tiers.length > 0 && <> — tier {tiers.join(", ")}</>}. Each one below is card-for-card as its pilot
            registered it, priced live across {info.adjective} stores.
          </p>
          <p>{group.summary}</p>
          <p>{group.buyerAngle}</p>
          {domainsByCount.length > 0 && group.axis === "archetype" && (
            <p>
              These lists draw on {domainsByCount.length} {domainsByCount.length === 1 ? "domain" : "domains"} —{" "}
              {domainsByCount.map(([d, n], i) => (
                <span key={d}>
                  {i > 0 && (i === domainsByCount.length - 1 ? " and " : ", ")}
                  <Link href={`/domains/${domainSlug(d)}`} className="text-brand-400 hover:underline">
                    {d}
                  </Link>{" "}
                  ({n})
                </span>
              ))}
              .
            </p>
          )}
        </div>
      </div>

      {/* Headline numbers. Rendered only when a real, in-band, well-covered price
          exists for at least one list — see deckCostVerdict. */}
      {cheapest && dearest && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Lists tracked" value={String(decks.length)} />
          <Stat label="Cheapest to build" value={formatMoney(cheapest.verdict.totalCents!, currency)} accent />
          <Stat label="Most expensive" value={formatMoney(dearest.verdict.totalCents!, currency)} />
          <Stat label="Priced lists" value={`${costed.length}/${decks.length}`} />
        </div>
      )}

      {/* "Cheapest place to buy this deck right now" — the real optimised cart
          for the cheapest list in this group, postage and free-shipping
          thresholds included. Renders nothing if no cart could be assembled. */}
      {cartPlan && cartDeck && (
        <DeckCartView
          plan={cartPlan}
          country={country}
          className="mt-0"
          heading={`Cheapest place to buy a ${group.name} deck right now`}
          note={`${cartDeck.name} — ${cartPlan.matchedCards} cards, bought across ${cartPlan.storeCount} ${
            cartPlan.storeCount === 1 ? "store" : "stores"
          } to minimise total delivered cost in ${info.place}.`}
        />
      )}

      <section>
        <h2 className="mb-1 text-xl font-extrabold text-white">
          Every {group.name} deck, priced
        </h2>
        <p className="mb-4 max-w-3xl text-xs text-slate-500">
          Build cost is each card&apos;s cheapest in-stock {info.adjective} price, excludes the 12-card rune base,
          and may span multiple stores. A list shows &ldquo;not enough listings&rdquo; rather than a total when too
          few of its cards currently have a live price to stand behind the number.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((d) => {
            const verdict = deckCostVerdict(d);
            const champ = championForCardName(d.legend);
            return (
              <div key={d.slug} className="card-surface flex flex-col overflow-hidden">
                <Link href={`/decks/${d.slug}`} className="group block">
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-ink-900">
                    {d.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={d.imageUrl}
                        alt={cardImageAlt({ name: d.legend })}
                        width={640}
                        height={360}
                        className="h-full w-full object-cover object-top"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
                    <div className="absolute left-2 top-2">
                      <TierBadge tier={d.tier} />
                    </div>
                  </div>
                </Link>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <Link href={`/decks/${d.slug}`} className="font-bold text-white hover:text-brand-300">
                    {d.name}
                  </Link>
                  <p className="text-xs text-slate-500">{d.archetype}</p>
                  <div className="flex flex-wrap gap-1">
                    {d.domains.map((dom) => (
                      <DomainBadge key={dom} domain={dom} />
                    ))}
                  </div>
                  {(d.metaSharePct != null || d.winRatePct != null || d.top8s != null) && (
                    <div className="num flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      {d.metaSharePct != null && <span>{d.metaSharePct}% meta</span>}
                      {d.winRatePct != null && (
                        <span className={d.winRatePct >= 50 ? "text-accent" : undefined}>{d.winRatePct}% WR</span>
                      )}
                      {d.top8s != null && <span>{d.top8s} top 8{d.top8s === 1 ? "" : "s"}</span>}
                    </div>
                  )}
                  <p className="line-clamp-3 text-xs text-slate-400">{d.description}</p>
                  {champ && (
                    <Link href={`/champions/${champ.slug}`} className="text-xs text-brand-400 hover:underline">
                      All {champ.name} cards &amp; prices →
                    </Link>
                  )}
                  <div className="mt-auto flex items-end justify-between pt-2">
                    <div>
                      <div className="text-[11px] text-slate-500">build cost from</div>
                      {verdict.ok && verdict.totalCents != null ? (
                        <div className="num text-lg font-bold text-accent">
                          {formatMoney(verdict.totalCents, currency)}
                        </div>
                      ) : (
                        <div className="text-sm font-semibold text-slate-500">not enough listings</div>
                      )}
                    </div>
                    <div className="num text-right text-[11px] text-slate-500">
                      {d.pricedCards}/{d.priceableCards} cards priced
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {staples.length > 0 && (
        <section>
          <h2 className="mb-1 text-xl font-extrabold text-white">
            What every {group.name} list runs
          </h2>
          <p className="mb-4 max-w-3xl text-xs text-slate-500">
            Cards shared by at least two of the {decks.length} lists above — the pieces you buy first, because
            they keep their slot whichever version of the deck you settle on. Runes and side-deck cards excluded.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-3 font-semibold">Card</th>
                  <th className="pb-2 pr-3 font-semibold">Lists</th>
                  <th className="pb-2 pr-3 font-semibold">Copies</th>
                  <th className="pb-2 font-semibold">Cheapest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {staples.map((s) => {
                  const card = resolvedByName.get(s.name) ?? null;
                  const price = card?.lowestPriceCents ?? null;
                  return (
                    <tr key={s.name}>
                      <td className="py-2 pr-3 font-semibold text-white">
                        {card ? (
                          <Link href={cardHref(card)} className="hover:text-brand-300">
                            {card.name}
                          </Link>
                        ) : (
                          s.name
                        )}
                      </td>
                      <td className="num py-2 pr-3 text-slate-400">
                        {s.deckCount} of {decks.length}
                      </td>
                      <td className="num py-2 pr-3 text-slate-400">up to {s.maxQty}</td>
                      <td className="num py-2 text-slate-300">
                        {price != null && price > 0 ? formatMoney(price, currency) : <span className="text-slate-600">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {championLinks.length > 0 && (
        <section>
          <h2 className="mb-1 text-xl font-extrabold text-white">Champions leading these decks</h2>
          <p className="mb-3 max-w-3xl text-xs text-slate-500">
            Each hub lists every printing of every card featuring that champion, priced across stores — the
            cheapest way to find the alternate arts and Signature prints for a list you already play.
          </p>
          <div className="flex flex-wrap gap-2">
            {championLinks.map((c) => (
              <Link
                key={c.slug}
                href={`/champions/${c.slug}`}
                className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500"
              >
                {c.name} cards →
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Buying into {group.name} for less</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          {cheapest ? (
            <>
              The cheapest complete {group.name} list on this page is{" "}
              <Link href={`/decks/${cheapest.deck.slug}`} className="text-brand-400 hover:underline">
                {cheapest.deck.name}
              </Link>{" "}
              at {formatMoney(cheapest.verdict.totalCents!, currency)} in {info.place}. Because postage is charged
              per store, the cheapest set of individual cards is rarely the cheapest order — the{" "}
              <Link href="/tools/best-basket" className="text-brand-400 hover:underline">
                best-basket tool
              </Link>{" "}
              re-solves that for any list you paste in, and every deck page carries its own optimised cart.
            </>
          ) : (
            <>
              None of these lists has enough live listings right now to quote a build cost we&apos;d stand behind.
              Prices appear here as stores restock — in the meantime the{" "}
              <Link href="/browse" className="text-brand-400 hover:underline">
                card database
              </Link>{" "}
              carries every individual card&apos;s live price.
            </>
          )}
        </p>
        {/* The eBay fallback searches a REAL CARD NAME — the legend of the
            cheapest list here, or the most-shared staple — not "Riftbound Aggro",
            which is a label no listing carries and would return junk. The whole
            point of this CTA is the cards no tracked store has in stock, so
            sending someone to an empty result set is worse than not offering it. */}
        <EbayBuyCta
          query={ebayQuery}
          className="mt-4"
        />
      </section>

      <HubFaq faqs={faqs} heading={`Riftbound ${group.name} decks — common questions`} />

      <section className="border-t border-ink-800 pt-6">
        <h2 className="mb-3 text-lg font-bold text-white">
          {group.axis === "archetype" ? "Other archetypes" : "Other domains"}
        </h2>
        <div className="flex flex-wrap gap-2">
          {siblings.map((g) => (
            <Link
              key={g.slug}
              href={deckGroupPath(g)}
              className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500"
            >
              {g.name} decks →
            </Link>
          ))}
          <Link href="/decks" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">
            All meta decks →
          </Link>
          {group.axis === "domain" && (
            <Link
              href={`/domains/${group.slug}`}
              className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500"
            >
              Every {group.name} card, priced →
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

/** Legend names carry a " - Starter" suffix on the starter-deck printings (see
 *  prisma/seed.ts's slugify note); it is part of the product name in our data but
 *  not part of what anyone searches for. */
function stripStarter(name: string | undefined): string | undefined {
  const clean = name?.replace(/\s*-\s*Starter$/i, "").trim();
  return clean || undefined;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card-surface p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num mt-1 text-lg font-bold ${accent ? "text-accent" : "text-white"}`}>{value}</div>
    </div>
  );
}
