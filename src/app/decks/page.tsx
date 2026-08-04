import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { resolveAllDecks, META_DECKS, META_UPDATED } from "@/lib/meta-decks";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { DomainBadge } from "@/components/Badge";
import { TierBadge } from "@/components/TierBadge";
import { formatMoney } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { SITE_URL } from "@/lib/site";
import { cardImageAlt } from "@/lib/image-alt";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Riftbound Top Meta Decks & Build Cost",
  description:
    "Real top-finishing Riftbound Vendetta decklists, each priced live across stores. See what it costs to build a deck and where to buy every card.",
  alternates: { canonical: "/decks" },
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

export default async function DecksPage() {
  const country = getCountry();
  const info = COUNTRIES[country];
  // This page reads the country cookie (per-market build costs) so it renders
  // per-request; bound its heavy all-decks pricing to ~2/day (per import) by
  // caching behind CONTENT_TAG, which the daily import clears. 24h TTL fallback.
  const decks = await unstable_cache(() => resolveAllDecks(country), ["decks-all", country], {
    revalidate: 86400,
    tags: [CONTENT_TAG],
  })();
  const beginner = decks.filter((d) => d.category === "beginner");
  const meta = decks.filter((d) => d.category !== "beginner");
  const tiers = ["1", "2", "3"].map((t) => ({ tier: t, decks: meta.filter((d) => d.tier === t) }));
  const untiered = meta.filter((d) => !["1", "2", "3"].includes(d.tier));

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Meta Decks", item: `${SITE_URL}/decks` },
    ],
  };
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Riftbound ${SET_LABEL} Top Meta Decks`,
    url: `${SITE_URL}/decks`,
      // Edges back to the site-level graph in app/layout.tsx. Without them this
      // node is an island and the Organization/WebSite entity signals — sameAs,
      // areaServed, knowsAbout — don't propagate to the page.
      isPartOf: { "@id": `${SITE_URL}/#website` },
      publisher: { "@id": `${SITE_URL}/#org` },
    itemListElement: META_DECKS.map((d, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: d.name,
      url: `${SITE_URL}/decks/${d.slug}`,
      description: d.description,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
    <div className="flex flex-col gap-10">
      <div>
        <span className="chip bg-brand-500 text-[10px] font-extrabold uppercase tracking-wide text-ink-950">
          {SET_LABEL} metagame
        </span>
        <h1 className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">Top Meta Decks</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Real top-finishing decklists from the {SET_LABEL} metagame — the Riftbound Online Series, Haven
          Online Challenger Series, Runes League Invitational and the rest of the post-release circuit. Every
          list is card-for-card as its pilot registered it, priced live across {info.adjective} stores so you
          can see what it costs to build and where to buy each card.
        </p>
        {META_UPDATED && (
          <p className="mt-2 text-xs text-slate-500">
            Meta last updated <strong className="text-slate-400">{longDate(META_UPDATED)}</strong>. Tier
            placement, metashare and win rates track the{" "}
            <a
              href="https://riftdecks.com/legends"
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-brand-400 underline hover:text-brand-300"
            >
              riftDecks.com
            </a>{" "}
            {SET_LABEL} breakdown, which moves daily.
          </p>
        )}
      </div>

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
        base, and may span multiple stores.
      </p>
    </div>
    </>
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
