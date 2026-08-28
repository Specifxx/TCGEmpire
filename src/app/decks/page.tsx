import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { resolveAllDecks, META_DECKS, META_UPDATED, type ResolvedDeck } from "@/lib/meta-decks";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { DomainBadge } from "@/components/Badge";
import { TierBadge } from "@/components/TierBadge";
import { DecksMetaTable, type DeckTableRow } from "@/components/DecksMetaTable";
import { formatMoney } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, COUNTRY_LIST } from "@/lib/country";
import { SITE_URL } from "@/lib/site";
import { cardImageAlt } from "@/lib/image-alt";
import { cardHref } from "@/lib/card-url";
import { deckItemListLd, deckFaqLd, deckFaq, cheapestDeck, bestWinRateDeck } from "@/lib/deck-jsonld";
import { deckGroupPath, liveDeckGroups, seedsInGroup, deckCostVerdict } from "@/lib/deck-groups";
import {
  avgEnergyCost,
  deckProvenance,
  domainPairings,
  domainPresence,
  energyCurve,
  hubCostSummary,
  metaStaples,
  stapleMovers,
  tierCounts,
} from "@/lib/deck-hub-stats";
import { getPriceMovers } from "@/lib/price-history";
import { pageAlternates } from "@/lib/seo";

export const revalidate = 86400;

export const metadata: Metadata = {
  // 44 chars — stays under 60 with the layout's " — RiftCompare" suffix (the
  // limit the deck detail pages step their titles down to).
  title: "Riftbound Meta Tier List, Decks & Build Cost",
  description:
    "The Riftbound Vendetta metagame on one board: real top-finishing decklists ranked by tier, metashare and win rate, every list priced live across stores.",
  alternates: pageAlternates("/decks"),
  openGraph: {
    type: "website",
    url: `${SITE_URL}/decks`,
    title: "Riftbound Meta Tier List, Decks & Build Cost",
    description:
      "Every top-finishing Vendetta decklist ranked and priced live — tiers, metashare, win rates, staples and what each deck costs to build in your own market.",
    // Every market reads THIS url — the region comes from a cookie, not the path
    // (see lib/get-country.ts). og:locale:alternate is therefore a statement about
    // who the one page serves, not a claim that six localised URLs exist. NO
    // hreflang here for the same reason: alternates would have to point at URLs
    // that don't exist, which is worse than declaring none.
    locale: "en_US",
    alternateLocale: COUNTRY_LIST.map((c) => c.locale.replace("-", "_")).filter((l) => l !== "en_US"),
  },
};

// The metagame these lists come from. The lists, tiers and metashare figures all
// live in prisma/meta-decks.json — update that file, never this component.
const SET_LABEL = "Vendetta";

const TIER_BLURB: Record<string, string> = {
  "1": "Expected top-cut performer and a genuine contender to win a high-stakes event.",
  "2": "Top 16/32 contenders — a win or two short of the top table, but consistently there.",
  "3": "Competitive with an experienced pilot, and where the budget and breakout picks sit.",
};

function longDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Legend names carry a " - Starter" suffix on the starter-deck printings —
 *  part of the product name in our data, not of what anyone calls the champion. */
function stripStarter(name: string): string {
  return name.replace(/\s*-\s*Starter$/i, "");
}

export default async function DecksPage() {
  const country = getCountry();
  const info = COUNTRIES[country];
  // This page reads the country cookie (per-market build costs) so it renders
  // per-request; bound its heavy all-decks pricing to ~2/day (per import) by
  // caching behind CONTENT_TAG, which the daily import clears. 24h TTL fallback.
  // "decks-all-v2": key bumped when energyCost joined the resolver's select —
  // must stay in lockstep with lib/deck-group-data.ts, which shares this cache.
  const decks = await unstable_cache(() => resolveAllDecks(country), ["decks-all-v2", country], {
    revalidate: 86400,
    tags: [CONTENT_TAG],
  })();
  const beginner = decks.filter((d) => d.category === "beginner");
  const meta = decks.filter((d) => d.category !== "beginner");
  const tiers = ["1", "2", "3"].map((t) => ({ tier: t, decks: meta.filter((d) => d.tier === t) }));
  const untiered = meta.filter((d) => !["1", "2", "3"].includes(d.tier));

  // ── Derived metagame statistics — in-memory arithmetic over the lists the ──
  // ── page already loaded, no extra queries (see lib/deck-hub-stats.ts). ─────
  const costs = hubCostSummary(meta);
  const tierTally = tierCounts(meta);
  const combinedShare = meta.reduce((n, d) => n + (d.metaSharePct ?? 0), 0);
  const totalTop8s = meta.reduce((n, d) => n + (d.top8s ?? 0), 0);
  const staples = metaStaples(meta).slice(0, 18);
  const domains = domainPresence(meta);
  const pairings = domainPairings(meta);
  const provenance = deckProvenance(meta);

  // Cards the resolver already matched, keyed loosely by input name — lets the
  // staples table link and price without a second query, and never invents a
  // price for a staple the resolver couldn't match.
  const resolvedByName = new Map<string, ResolvedDeck["items"][number]["card"]>();
  for (const d of meta) {
    for (const it of d.items) if (it.card && !resolvedByName.has(it.inputName)) resolvedByName.set(it.inputName, it.card);
  }

  // This week's real price movers, filtered to cards these lists actually play.
  // getPriceMovers is already week-cached per market and shared with the
  // homepage/movers page, so this adds no history-DB egress; on any failure the
  // band simply doesn't render — a missing section beats a 500 over a nicety.
  let metaMovers: ReturnType<typeof stapleMovers<Awaited<ReturnType<typeof getPriceMovers>>["spiking"][number]>> = [];
  try {
    const movers = await getPriceMovers(country, 50);
    metaMovers = stapleMovers(meta, [...movers.spiking, ...movers.plummeting], 6);
  } catch (e) {
    console.error("/decks: price movers unavailable, omitting the band:", e);
  }

  // Rows for the sortable metagame board. Costs pass deckCostVerdict — an
  // unpublishable total reaches the client as null, never as a number.
  const tableRows: DeckTableRow[] = meta.map((d) => {
    const verdict = deckCostVerdict(d);
    const curve = energyCurve(d);
    return {
      slug: d.slug,
      name: d.name,
      legend: stripStarter(d.legend),
      tier: d.tier,
      archetype: d.archetype,
      domains: d.domains,
      metaSharePct: d.metaSharePct ?? null,
      winRatePct: d.winRatePct ?? null,
      top8s: d.top8s ?? null,
      totalCents: verdict.ok ? verdict.totalCents : null,
      pricedCards: d.pricedCards,
      priceableCards: d.priceableCards,
      avgEnergy: avgEnergyCost(d),
      // Publish the curve only when it describes most of the deck — same
      // two-thirds floor avgEnergyCost holds itself to.
      curve: curve.known > 0 && curve.known / (curve.known + curve.unknown) >= 2 / 3 ? curve.buckets.map((b) => b.count) : [],
      imageThumbUrl: d.legendCard?.imageThumbUrl ?? d.legendCard?.imageUrl ?? d.imageUrl,
    };
  });

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Meta Decks", item: `${SITE_URL}/decks` },
    ],
  };
  const ldOpts = { siteUrl: SITE_URL, setLabel: SET_LABEL, metaUpdated: META_UPDATED, info };
  const itemListLd = deckItemListLd(decks, ldOpts);
  const faqLd = deckFaqLd(decks, ldOpts);
  const faqs = deckFaq(decks, ldOpts);
  const cheapest = cheapestDeck(decks);
  const bestWr = bestWinRateDeck(decks);
  // Static seed data — no DB call, so the band renders even if pricing degrades.
  const live = liveDeckGroups();
  const archetypeGroups = live.filter((g) => g.axis === "archetype");
  const domainGroups = live.filter((g) => g.axis === "domain");

  const maxDomainCount = Math.max(...domains.map((d) => d.deckCount), 1);
  const maxCost = costs.dearest?.totalCents ?? 1;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
    <div className="flex flex-col gap-10">
      <div>
        <span className="chip bg-brand-500 text-[10px] font-extrabold uppercase tracking-wide text-ink-950">
          {SET_LABEL} metagame
        </span>
        <h1 className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">
          Riftbound Meta Tier List &amp; Top Decks
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          The {SET_LABEL} metagame on one board: real top-finishing decklists from the Riftbound Online Series,
          Haven Online Challenger Series, Runes League Invitational and the rest of the post-release circuit —
          ranked by tier, metashare and win rate, then priced live across {info.adjective} stores. Every list is
          card-for-card as its pilot registered it, so the build cost next to each deck is the cost of the real
          thing, not an approximation.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          The {SET_LABEL} metagame is the set of decks winning Riftbound events since {SET_LABEL} released on
          31 July 2026. Because Riftbound doesn&apos;t rotate, it isn&apos;t only new cards: the strongest
          lists mix {SET_LABEL} printings into proven Origins, Spirit Forged and Unleashed shells, which is
          why several Unleashed-era legends still sit near the top. A deck&apos;s tier here reflects how it
          actually converts — metashare, win rate and top-8 finishes — not how it looks on paper.
        </p>
        {META_UPDATED && (
          <p className="mt-2 text-xs text-slate-500">
            Meta last updated{" "}
            <time dateTime={META_UPDATED} className="font-bold text-slate-400">
              {longDate(META_UPDATED)}
            </time>
            . Tier placement, metashare and win rates track the{" "}
            <a
              href="https://riftdecks.com/legends"
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-brand-400 underline hover:text-brand-300"
            >
              riftDecks.com
            </a>{" "}
            {SET_LABEL} breakdown, which moves daily. Prices are RiftCompare&apos;s own, live.
          </p>
        )}
      </div>

      {/* At-a-glance figures. Every number below is derived from the same deck
          list the board renders — nothing is quoted that the page can't show. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Decks tracked" value={String(meta.length)} />
        <Stat
          label="Field covered"
          value={combinedShare > 0 ? `${combinedShare}%` : "—"}
          sub="combined metashare"
        />
        <Stat label="Top-8 finishes" value={totalTop8s > 0 ? String(totalTop8s) : "—"} sub="across these lists" />
        <Stat
          label="Cheapest build"
          value={costs.cheapest ? formatMoney(costs.cheapest.totalCents, info.currency) : "—"}
          accent
        />
        <Stat
          label="Average build"
          value={costs.avgCents != null ? formatMoney(costs.avgCents, info.currency) : "—"}
          sub={costs.costed.length ? `${costs.costed.length} priced lists` : undefined}
        />
        <Stat
          label="Priciest build"
          value={costs.dearest ? formatMoney(costs.dearest.totalCents, info.currency) : "—"}
        />
      </div>

      {/* ── The metagame board ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-extrabold text-white">The {SET_LABEL} metagame board</h2>
        <p className="mb-4 mt-1 max-w-3xl text-sm text-slate-400">
          Every tracked deck as one sortable row — filter by tier or domain, or re-rank the field by metashare,
          win rate, top-8 finishes, average energy cost or what it costs to build today. Build cost is each
          card&apos;s cheapest in-stock {info.adjective} price and excludes the 12-card rune base.
        </p>
        <DecksMetaTable rows={tableRows} currency={info.currency} />
        <p className="mt-2 text-[11px] text-slate-600">
          {tierTally.map((t, i) => (
            <span key={t.tier}>
              {i > 0 && " · "}
              Tier {t.tier}: {t.count} {t.count === 1 ? "deck" : "decks"}
            </span>
          ))}
          {" · "}Win rate and metashare are tournament statistics from the {SET_LABEL} circuit, not ratings.
          Avg. cost and the curve are computed from each list&apos;s printed energy costs.
        </p>
      </section>

      {/* High-intent shortcuts: "cheapest/budget X deck" and "best win rate X deck"
          are two of the highest-volume long-tail queries in this niche, and both
          answers are already in the data. Prices render in the resolved market. */}
      {(cheapest || bestWr || costs.cheapestTopTier || costs.bestBudget) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cheapest && (
            <Link
              href={`/decks/${cheapest.slug}`}
              className="card-surface flex flex-col gap-1 p-4 transition-colors hover:border-ink-600"
            >
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Budget pick</div>
              <div className="font-bold text-white">{cheapest.name}</div>
              <p className="text-xs text-slate-400">
                The cheapest list here to assemble —{" "}
                <strong className="text-accent">{formatMoney(cheapest.totalCents, info.currency)}</strong> at
                today&apos;s {info.adjective} prices, and still a {cheapest.winRatePct}% win rate.
              </p>
            </Link>
          )}
          {bestWr && (
            <Link
              href={`/decks/${bestWr.slug}`}
              className="card-surface flex flex-col gap-1 p-4 transition-colors hover:border-ink-600"
            >
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Highest win rate</div>
              <div className="font-bold text-white">{bestWr.name}</div>
              <p className="text-xs text-slate-400">
                <strong className="text-accent">{bestWr.winRatePct}%</strong> across {bestWr.top8s} top-8
                finishes — the best conversion rate in the current {SET_LABEL} field.
              </p>
            </Link>
          )}
          {costs.cheapestTopTier && costs.cheapestTopTier.deck.slug !== cheapest?.slug && (
            <Link
              href={`/decks/${costs.cheapestTopTier.deck.slug}`}
              className="card-surface flex flex-col gap-1 p-4 transition-colors hover:border-ink-600"
            >
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                Cheapest top-table seat
              </div>
              <div className="font-bold text-white">{costs.cheapestTopTier.deck.name}</div>
              <p className="text-xs text-slate-400">
                The least expensive tier-{costs.cheapestTopTier.deck.tier} list —{" "}
                <strong className="text-accent">{formatMoney(costs.cheapestTopTier.totalCents, info.currency)}</strong>{" "}
                to sit where the title contenders sit.
              </p>
            </Link>
          )}
          {costs.bestBudget &&
            costs.bestBudget.deck.slug !== cheapest?.slug &&
            costs.bestBudget.deck.slug !== bestWr?.slug && (
              <Link
                href={`/decks/${costs.bestBudget.deck.slug}`}
                className="card-surface flex flex-col gap-1 p-4 transition-colors hover:border-ink-600"
              >
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                  Budget that converts
                </div>
                <div className="font-bold text-white">{costs.bestBudget.deck.name}</div>
                <p className="text-xs text-slate-400">
                  Cheapest list winning more than it loses —{" "}
                  <strong className="text-accent">{formatMoney(costs.bestBudget.totalCents, info.currency)}</strong> at a{" "}
                  {costs.bestBudget.deck.winRatePct}% win rate.
                </p>
              </Link>
            )}
        </div>
      )}

      {/* ── What the meta costs to build ───────────────────────────────────── */}
      {costs.costed.length >= 2 && (
        <section>
          <h2 className="text-xl font-extrabold text-white">What the meta costs to build</h2>
          <p className="mb-4 mt-1 max-w-3xl text-sm text-slate-400">
            The whole field priced side by side, cheapest first — the view a deck-stats site can&apos;t give you.
            Each figure is the cheapest way to assemble that exact 56-card list from in-stock {info.adjective}{" "}
            listings today; a list too thinly stocked to stand behind a number is left off rather than guessed at.
          </p>
          <div className="card-surface flex flex-col gap-3 p-4">
            {costs.costed.map(({ deck, totalCents }) => (
              <div key={deck.slug} className="flex items-center gap-3">
                <Link
                  href={`/decks/${deck.slug}`}
                  className="w-40 shrink-0 truncate text-sm font-semibold text-white hover:text-brand-300 sm:w-56"
                >
                  {deck.name}
                </Link>
                <div className="hidden shrink-0 sm:block">
                  <TierBadge tier={deck.tier} />
                </div>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className="h-full rounded-full bg-brand-500/70"
                    style={{ width: `${Math.max(3, (totalCents / maxCost) * 100)}%` }}
                  />
                </div>
                <div className="num w-20 shrink-0 text-right text-sm font-bold text-accent">
                  {formatMoney(totalCents, info.currency)}
                </div>
              </div>
            ))}
            <p className="border-t border-ink-800 pt-2 text-[11px] text-slate-600">
              Cheapest in-stock price per card, main deck + legend, runes excluded, may span multiple stores.
              Every deck page runs a postage-aware cheapest-cart optimiser on top of these singles prices.
            </p>
          </div>
        </section>
      )}

      {/* ── Domains ────────────────────────────────────────────────────────── */}
      {domains.length > 0 && (
        <section>
          <h2 className="text-xl font-extrabold text-white">The meta by domain</h2>
          <p className="mb-4 mt-1 max-w-3xl text-sm text-slate-400">
            Every competitive Riftbound list pairs two domains, so the field reads twice here — once for each
            half of its pairing. Combined metashare adds up each domain&apos;s decks&apos; share of the wider
            tournament field.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card-surface flex flex-col gap-3 p-4">
              {domains.map((d) => (
                <div key={d.domain} className="flex items-center gap-3">
                  <div className="w-24 shrink-0">
                    <DomainBadge domain={d.domain} href={`/decks/domain/${d.domain.toLowerCase()}`} />
                  </div>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-800">
                    <div
                      className="h-full rounded-full bg-brand-500/70"
                      style={{ width: `${(d.deckCount / maxDomainCount) * 100}%` }}
                    />
                  </div>
                  <div className="num w-32 shrink-0 text-right text-xs text-slate-400">
                    {d.deckCount} {d.deckCount === 1 ? "deck" : "decks"}
                    {d.metaSharePct != null && <span className="text-slate-500"> · {d.metaSharePct}% share</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="card-surface p-4">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                Registered pairings
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {pairings.map((p) => (
                  <li key={p.domains.join("+")} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="flex items-center gap-1">
                      {p.domains.map((dom) => (
                        <DomainBadge key={dom} domain={dom} />
                      ))}
                    </span>
                    <span className="num text-xs text-slate-400">
                      {p.count} {p.count === 1 ? "list" : "lists"}
                      {p.metaSharePct != null && <span className="text-slate-500"> · {p.metaSharePct}% combined share</span>}
                    </span>
                    <span className="min-w-0 truncate text-xs text-slate-500">
                      {p.decks.map((x, i) => (
                        <span key={x.slug}>
                          {i > 0 && ", "}
                          <Link href={`/decks/${x.slug}`} className="hover:text-brand-300">
                            {x.name.split(",")[0]}
                          </Link>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-ink-800 pt-2 text-[11px] text-slate-600">
                Each domain link opens that domain&apos;s deck shelf, priced; the{" "}
                <Link href="/domains" className="underline hover:text-slate-400">
                  domain hubs
                </Link>{" "}
                price every card in the domain.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Rules change — constructed side decks went 8 → 10 on 24 July 2026, so a full
          tournament list is now 66 cards, not 64. Stated once here because every deck
          page below shows a side-deck count. */}
      <section className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
        <h2 className="text-sm font-extrabold text-white">Rules update — side decks are now 10 cards</h2>
        <p className="mt-1 text-sm text-slate-400">
          Riftbound&apos;s July 2026 tournament rules update raised the constructed side deck from 8 cards to{" "}
          <strong className="text-slate-200">10</strong>, effective 24 July 2026. A full tournament list is now{" "}
          <strong className="text-slate-200">66 cards</strong> — 40 main deck, 12 runes, 3 battlefields and a
          legend (56), plus 10 in the side deck. Runes, Legends and Battlefields still can&apos;t be
          sideboarded, and the 3-copy limit counts your main deck and side deck together. Every list below is a
          post-change 66.{" "}
          <Link href="/guides/how-a-riftbound-deck-is-built" className="text-brand-400 underline hover:text-brand-300">
            How a Riftbound deck is built →
          </Link>
        </p>
        {/* Same 24 July 2026 rules wave, and the one place it changes what a reader
            below can legally play: the Constructed 2v2 ban list. Called out here
            because a tier-2 list on this very page is built on the only Legend it
            bans, and nothing else on /decks mentions format legality at all.
            The card and its 2v2-only status come from the CURATED, Riot-sourced
            list in /guides/riftbound-banlist-explained — deliberately not from
            prisma/riftbound-cards.json's `is_banned` flag, which predates this wave
            and still reads false for this exact printing. */}
        <p className="mt-2 border-t border-ink-800 pt-2 text-sm text-slate-400">
          The same update opened a separate{" "}
          <strong className="text-slate-200">Constructed 2v2 ban list</strong>: the whole Standard banlist plus{" "}
          <strong className="text-slate-200">Master Yi, Wuju Bladesman</strong>, which is banned in 2v2 only and
          stays legal in 1v1 Standard — so the Master Yi list below is a 1v1 deck. Every other deck here is legal
          in both.{" "}
          <Link href="/guides/riftbound-banlist-explained" className="text-brand-400 underline hover:text-brand-300">
            Every banned card →
          </Link>
        </p>
      </section>

      {tiers.map(({ tier, decks: tierDecks }) =>
        tierDecks.length === 0 ? null : (
          <div key={tier}>
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-xl font-extrabold text-white">Tier {tier}</h2>
              <p className="text-sm text-slate-500">{TIER_BLURB[tier]}</p>
            </div>
            <DeckGrid decks={tierDecks} currency={info.currency} />
          </div>
        )
      )}

      {untiered.length > 0 && (
        <div>
          <h2 className="mb-4 text-xl font-extrabold text-white">Also seeing play</h2>
          <DeckGrid decks={untiered} currency={info.currency} />
        </div>
      )}

      {/* ── Staples ────────────────────────────────────────────────────────── */}
      {staples.length > 0 && (
        <section>
          <h2 className="text-xl font-extrabold text-white">The staples of the {SET_LABEL} meta</h2>
          <p className="mb-4 mt-1 max-w-3xl text-sm text-slate-400">
            The cards the field agrees on — every card below is main-decked by at least two of the {meta.length}{" "}
            tracked lists. These are the pickups that keep their slot whichever deck you land on, which makes
            them the safest cards to buy first and the first prices to move when results post. Runes and
            side-deck cards excluded.
          </p>
          <div className="card-surface overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 font-semibold">Card</th>
                  <th className="px-3 py-2.5 font-semibold">Played in</th>
                  <th className="px-3 py-2.5 font-semibold">Copies</th>
                  <th className="px-3 py-2.5 font-semibold">Cheapest</th>
                  <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Playset</th>
                  <th className="hidden px-3 py-2.5 font-semibold lg:table-cell">Decks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {staples.map((s) => {
                  const card = resolvedByName.get(s.name) ?? null;
                  const price = card?.lowestPriceCents ?? null;
                  return (
                    <tr key={s.name} className="transition-colors hover:bg-ink-850/60">
                      <td className="px-3 py-2">
                        {card ? (
                          <Link href={cardHref(card)} className="flex items-center gap-2.5 font-semibold text-white hover:text-brand-300">
                            {card.imageThumbUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={card.imageThumbUrl}
                                alt={cardImageAlt(card)}
                                width={30}
                                height={40}
                                loading="lazy"
                                className="h-10 w-[30px] shrink-0 rounded object-cover ring-1 ring-ink-700"
                              />
                            ) : (
                              <span className="h-10 w-[30px] shrink-0 rounded bg-ink-800" />
                            )}
                            <span className="min-w-0">
                              <span className="block truncate">{s.name}</span>
                              <span className="block text-[11px] font-normal text-slate-500">
                                {card.type} · {card.rarity}
                              </span>
                            </span>
                          </Link>
                        ) : (
                          <span className="font-semibold text-slate-400">{s.name}</span>
                        )}
                      </td>
                      <td className="num px-3 py-2 text-slate-300">
                        {s.deckCount} of {meta.length}
                      </td>
                      <td className="num px-3 py-2 text-slate-400">up to {s.typicalQty}</td>
                      <td className="num px-3 py-2 text-slate-300">
                        {price != null && price > 0 ? formatMoney(price, info.currency) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="num hidden px-3 py-2 text-slate-400 md:table-cell">
                        {price != null && price > 0 ? formatMoney(price * s.typicalQty, info.currency) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="hidden max-w-[220px] truncate px-3 py-2 text-xs text-slate-500 lg:table-cell">
                        {s.decks.map((d, i) => (
                          <span key={d.slug}>
                            {i > 0 && ", "}
                            <Link href={`/decks/${d.slug}`} className="hover:text-brand-300">
                              {d.name.split(",")[0]}
                            </Link>
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            &ldquo;Playset&rdquo; is the cheapest price × the highest copy-count any list runs. Each card links to
            its full store-by-store comparison.
          </p>
        </section>
      )}

      {/* ── Meta staples on the move — real tracked price changes only ─────── */}
      {metaMovers.length > 0 && (
        <section>
          <h2 className="text-xl font-extrabold text-white">Meta staples on the move</h2>
          <p className="mb-4 mt-1 max-w-3xl text-sm text-slate-400">
            Cards from the lists above whose cheapest {info.adjective} price genuinely moved this week, from our
            tracked price history. When a staple spikes, the decks that run it get dearer to build — worth
            watching if one of these lists is on your shopping list.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {metaMovers.map(({ mover, decks: playedIn }) => (
              <Link
                key={mover.card.id}
                href={cardHref(mover.card)}
                className="card-surface flex items-center gap-3 p-3 transition-colors hover:border-ink-600"
              >
                {mover.card.imageThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mover.card.imageThumbUrl}
                    alt={cardImageAlt(mover.card)}
                    width={36}
                    height={48}
                    loading="lazy"
                    className="h-12 w-9 shrink-0 rounded object-cover ring-1 ring-ink-700"
                  />
                ) : (
                  <span className="h-12 w-9 shrink-0 rounded bg-ink-800" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white">{mover.card.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">
                    in {playedIn.length} meta {playedIn.length === 1 ? "deck" : "decks"} —{" "}
                    {playedIn.map((d) => d.name.split(",")[0]).join(", ")}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block text-sm font-bold text-accent">
                    {formatMoney(mover.nowCents, info.currency)}
                  </span>
                  <span className={`num block text-xs font-semibold ${mover.pct > 0 ? "text-down" : "text-up"}`}>
                    {mover.pct > 0 ? "▲" : "▼"} {Math.abs(mover.pct)}%
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Week-on-week change in the cheapest tracked {info.adjective} price. Rising is red — it costs a buyer
            more. Full market view on the{" "}
            <Link href="/movers" className="underline hover:text-slate-400">
              movers page
            </Link>
            .
          </p>
        </section>
      )}

      {/* ── Where the lists come from ──────────────────────────────────────── */}
      {provenance.length > 0 && (
        <section>
          <h2 className="text-xl font-extrabold text-white">Where these lists finished</h2>
          <p className="mb-4 mt-1 max-w-3xl text-sm text-slate-400">
            Every deck on this page is a real registered list with a real finish — no &ldquo;theorycrafted&rdquo;
            builds. This is the paper trail: the pilot, the placement and the event each list was taken from.
          </p>
          <div className="card-surface overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 font-semibold">Finish</th>
                  <th className="px-3 py-2.5 font-semibold">Pilot</th>
                  <th className="px-3 py-2.5 font-semibold">Deck</th>
                  <th className="px-3 py-2.5 font-semibold">Event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {provenance.map((p) => (
                  <tr key={p.slug} className="transition-colors hover:bg-ink-850/60">
                    <td className="num px-3 py-2 font-bold text-slate-200">{p.placement}</td>
                    <td className="px-3 py-2 text-slate-300">{p.player}</td>
                    <td className="px-3 py-2">
                      <Link href={`/decks/${p.slug}`} className="font-semibold text-white hover:text-brand-300">
                        {p.deckName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {p.sourceUrl ? (
                        <a
                          href={p.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="hover:text-brand-300"
                        >
                          {p.event} ↗
                        </a>
                      ) : (
                        p.event
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Browse band for the programmatic archetype/domain landing pages.
          An indexable page nothing links to is one Google finds late and trusts
          little, and this hub is by far the strongest internal link available to
          them — every group is one click from here. Groups with no real deck are
          absent (they 404), and single-deck groups are listed but carry their own
          noindex, so this band never advertises a page we're hiding. */}
      {(archetypeGroups.length > 0 || domainGroups.length > 0) && (
        <section>
          <h2 className="text-xl font-extrabold text-white">Browse decks by archetype &amp; domain</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Every list above, cut the two ways people actually search — by what the deck is trying to do, and by
            the domains it plays. Each page prices its whole shelf live and shows the cheapest cart to buy one
            right now.
          </p>
          {archetypeGroups.length > 0 && (
            <div className="mt-4">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Archetypes</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {archetypeGroups.map((g) => (
                  <Link
                    key={g.slug}
                    href={deckGroupPath(g)}
                    className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500"
                  >
                    {g.name} decks <span className="num text-slate-500">({seedsInGroup(g).length})</span> →
                  </Link>
                ))}
              </div>
            </div>
          )}
          {domainGroups.length > 0 && (
            <div className="mt-4">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Domains</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {domainGroups.map((g) => (
                  <Link
                    key={g.slug}
                    href={deckGroupPath(g)}
                    className="chip border border-ink-700 px-3 py-1.5 text-sm transition-colors hover:border-brand-500"
                  >
                    {g.name} decks <span className="num text-slate-500">({seedsInGroup(g).length})</span> →
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Secondary: the archetype guide. Demoted below the real lists now that a
          genuine Vendetta tournament scene exists — it's a build primer, not the
          headline it was during spoiler season. */}
      <section className="overflow-hidden rounded-2xl border border-brand-500/50 bg-gradient-to-br from-brand-500/15 via-ink-900 to-ink-900 p-6">
        <h2 className="text-lg font-extrabold text-white sm:text-xl">New to {SET_LABEL}? Start with the archetypes</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-300">
          The lists above are tournament results. If you&apos;d rather understand the deckbuilding first, our
          archetype guide breaks {SET_LABEL} down by its three core engines and the domain pairings that
          support them.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { name: "Flow Value", domains: "Fury + Calm" },
            { name: "Burn / Disruption", domains: "Chaos + Order" },
            { name: "Empower Midrange", domains: "Mind + Body" },
          ].map((a) => (
            <div key={a.name} className="rounded-xl border border-ink-700 bg-ink-900/60 p-3">
              <div className="font-bold text-white">{a.name}</div>
              <div className="text-xs text-slate-500">{a.domains}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/guides/best-riftbound-vendetta-decks" className="btn-primary text-sm">See the full archetype guide →</Link>
          <Link
            href="/sets/vendetta"
            className="rounded-md border border-brand-500/40 px-3 py-1.5 text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-500/10"
          >
            Shop Vendetta cards now →
          </Link>
          <Link href="/blog/every-riftbound-vendetta-card-revealed" className="btn-ghost text-sm">Browse revealed cards</Link>
        </div>
      </section>

      {beginner.length > 0 && (
        <div>
          <div className="mb-4">
            <h2 className="text-2xl font-extrabold text-white">Starter Decks for New Players</h2>
            <p className="mt-1 text-sm text-slate-400">
              New to Riftbound? These budget-friendly decks are built mostly from cheap commons
              so you can start playing for as little as possible.
            </p>
          </div>
          <DeckGrid decks={beginner} currency={info.currency} />
        </div>
      )}

      {/* Visible counterpart of the FAQPage JSON-LD above. These must stay in sync:
          marking up an answer that isn't on the page breaks Google's guidelines. */}
      <section>
        <h2 className="mb-3 text-xl font-extrabold text-white">Common questions</h2>
        <div className="flex flex-col gap-3">
          {faqs.map((q) => (
            <div key={q.name} className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
              <h3 className="text-sm font-bold text-white">{q.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{q.acceptedAnswer.text}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-center text-[11px] text-slate-600">
        Decklists are real tournament results and change with the metagame — lists via{" "}
        <a
          href="https://www.riftools.app/decklists"
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="underline hover:text-slate-400"
        >
          riftools.app
        </a>
        , tier and metashare figures from{" "}
        <a
          href="https://riftdecks.com/legends"
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="underline hover:text-slate-400"
        >
          riftDecks.com
        </a>
        . Build cost uses each card&apos;s cheapest in-stock {info.adjective} price, excludes the 12-card rune
        base, and may span multiple stores. Price-change figures come from RiftCompare&apos;s own tracked
        price history.
      </p>
    </div>
    </>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card-surface p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num mt-1 text-lg font-bold ${accent ? "text-accent" : "text-white"}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-600">{sub}</div>}
    </div>
  );
}

function DeckGrid({ decks, currency }: { decks: Awaited<ReturnType<typeof resolveAllDecks>>; currency: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {decks.map((d) => (
          <Link
            key={d.slug}
            href={`/decks/${d.slug}`}
            className="group card-surface flex flex-col overflow-hidden transition-colors hover:border-ink-600"
          >
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
            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-white">{d.name}</h3>
              </div>
              <p className="text-xs text-slate-500">{d.archetype} · {d.legend.replace(/\s*-\s*Starter$/i, "")}</p>
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
              <p className="line-clamp-2 text-xs text-slate-400">{d.description}</p>
              <div className="mt-auto flex items-end justify-between pt-2">
                <div>
                  <div className="text-[11px] text-slate-500">build cost from</div>
                  <div className="num text-lg font-bold text-accent">{formatMoney(d.totalCents, currency)}</div>
                </div>
                <div className="num text-right text-[11px] text-slate-500">
                  {d.pricedCards}/{d.priceableCards} cards priced
                </div>
              </div>
            </div>
          </Link>
        ))}
    </div>
  );
}
