import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { resolveAllDecks, META_DECKS } from "@/lib/meta-decks";
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
    "Ready-made Riftbound decklists, each priced live across stores. See what it costs to build a deck and where to buy every card.",
  alternates: { canonical: "/decks" },
};

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
    name: "Riftbound Top Meta Decks",
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
      {/* Vendetta spotlight — the Vendetta metagame is live as of the 31 July 2026
          release, so this now reports what has ACTUALLY been winning (real events,
          real placings) instead of the pre-release "no scene yet" framing. We still
          don't publish priced Vendetta "meta" lists: card-by-card lists for these
          finishes aren't in our data yet, and inventing them would fake the one
          thing this page is for. Archetype blueprints stay clearly labelled as such. */}
      <section className="overflow-hidden rounded-2xl border border-brand-500/50 bg-gradient-to-br from-brand-500/15 via-ink-900 to-ink-900 p-6">
        <span className="chip bg-brand-500 text-[10px] font-extrabold uppercase tracking-wide text-ink-950">Vendetta meta · week one</span>
        <h2 className="mt-2 text-xl font-extrabold text-white sm:text-2xl">What&apos;s actually winning with Vendetta</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-300">
          Vendetta released 31 July 2026 and the first events are in. The early field still looks a lot like
          Unleashed — established legends adapting with a handful of new cards, rather than new Vendetta
          legends taking over.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            {
              name: "Nasus, Curator of the Sands",
              note: "First Vendetta legend to win a tournament — a 47-player event, on a list far leaner on late-game bombs than the theorycrafts predicted.",
            },
            {
              name: "Diana, Scorn of the Moon",
              note: "Won Sideways Showdown: CN vs World (25 July) off an innovative points engine — the standout new-set build so far.",
            },
            {
              name: "Unleashed shells, lightly updated",
              note: "Azir took the largest event yet on a list running only three Vendetta cards; Annie won on an Unleashed list with a single new sideboard card.",
            },
          ].map((a) => (
            <div key={a.name} className="rounded-xl border border-ink-700 bg-ink-900/60 p-3">
              <div className="font-bold text-white">{a.name}</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-400">{a.note}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 max-w-2xl text-xs text-slate-500">
          We publish a full priced list only when we have it card-for-card. These Vendetta finishes aren&apos;t in
          our decklist data yet, so they&apos;re reported here as results — follow them through to{" "}
          <a
            href="https://riftdecks.com/legends"
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-brand-400 underline hover:text-brand-300"
          >
            riftDecks.com
          </a>{" "}
          for the lists themselves.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/guides/best-riftbound-vendetta-decks" className="btn-primary text-sm">Vendetta archetype blueprints →</Link>
          <Link
            href="/sets/vendetta"
            className="rounded-md border border-brand-500/40 px-3 py-1.5 text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-500/10"
          >
            Shop Vendetta cards now →
          </Link>
          <Link href="/blog/every-riftbound-vendetta-card-revealed" className="btn-ghost text-sm">Browse revealed cards</Link>
        </div>
      </section>

      {/* Rules change — constructed side decks went 8 → 10 on 24 July 2026, so a full
          tournament list is now 66 cards, not 64. Stated once here because every deck
          page below shows a side-deck count. */}
      <section className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
        <h2 className="text-sm font-extrabold text-white">Rules update — side decks are now 10 cards</h2>
        <p className="mt-1 text-sm text-slate-400">
          Riftbound&apos;s July 2026 tournament rules update raised the constructed side deck from 8 cards to{" "}
          <strong className="text-slate-200">10</strong>, effective 24 July 2026. A full tournament list is now{" "}
          <strong className="text-slate-200">66 cards</strong> — 40 main deck, 12 runes, 3 battlefields and a
          legend (56), plus up to 10 in the side deck. Runes, Legends and Battlefields still can&apos;t be
          sideboarded, and the 3-copy limit counts your main deck and side deck together.{" "}
          <Link href="/guides/how-a-riftbound-deck-is-built" className="text-brand-400 underline hover:text-brand-300">
            How a Riftbound deck is built →
          </Link>
        </p>
      </section>

      <div>
        <div className="mb-4">
          <h1 className="text-2xl font-extrabold text-white">Top Meta Decks</h1>
          <p className="mt-1 text-sm text-slate-400">
            Real top-finishing tournament decklists sourced from{" "}
            <a
              href="https://riftdecks.com/legends"
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-brand-400 underline hover:text-brand-300"
            >
              riftDecks.com
            </a>{" "}
            — each priced live across {info.adjective} stores so you can see what it costs to build and
            where to buy every card.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            These are Unleashed-era lists, and Unleashed cards remain fully legal — Riftbound doesn&apos;t
            rotate. Post-Vendetta, riftDecks has <strong className="text-slate-400">Irelia, Blade Dancer</strong> still
            leading the field at roughly a 10% metashare, followed by{" "}
            <strong className="text-slate-400">Kennen, Heart of the Tempest</strong> and{" "}
            <strong className="text-slate-400">Master Yi, Wuju Bladesman</strong>; Calm/Chaos is the top domain
            pairing at about 12%. Side decks below were legal 8-card builds at the time they were played —
            the 10-card limit only came in on 24 July 2026.
          </p>
        </div>
        <DeckGrid decks={meta} currency={info.currency} />
      </div>

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
        Decklists are real tournament results sourced from{" "}
        <a
          href="https://riftdecks.com/legends"
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="underline hover:text-slate-400"
        >
          riftDecks.com
        </a>{" "}
        and change with the metagame. Build cost uses each card&apos;s cheapest in-stock {info.adjective}{" "}
        price and may span multiple stores.
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
                <h2 className="font-bold text-white">{d.name}</h2>
              </div>
              <p className="text-xs text-slate-500">{d.archetype} · {d.legend.replace(/\s*-\s*Starter$/i, "")}</p>
              <div className="flex flex-wrap gap-1">
                {d.domains.map((dom) => (
                  <DomainBadge key={dom} domain={dom} />
                ))}
              </div>
              <p className="line-clamp-2 text-xs text-slate-400">{d.description}</p>
              <div className="mt-auto flex items-end justify-between pt-2">
                <div>
                  <div className="text-[11px] text-slate-500">build cost from</div>
                  <div className="num text-lg font-bold text-accent">{formatMoney(d.totalCents, currency)}</div>
                </div>
                <div className="num text-right text-[11px] text-slate-500">
                  {d.pricedCards}/{d.totalCards} cards priced
                </div>
              </div>
            </div>
          </Link>
        ))}
    </div>
  );
}
