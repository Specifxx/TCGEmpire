import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Riftbound community sites and tools",
  description:
    "The Riftbound sites we use ourselves: card databases, deck builders, tier lists, news and the community directory. Free fan projects, listed with what each is best for.",
  alternates: pageAlternates("/resources"),
};

// ─────────────────────────────────────────────────────────────────────────────
// THE COMMUNITY RESOURCES PAGE (2026-10-26).
// ─────────────────────────────────────────────────────────────────────────────
// A plain, editorial list of the other Riftbound sites, each with one line on
// what it is best for. Two jobs:
//
// 1. Readers. Someone pricing a deck usually also wants a deck list, a tier
//    list or the rules, and none of that is ours to build.
// 2. Outreach (docs/OUTREACH-KIT.md). Riftbound.org listed us on request in
//    October and we had nowhere to return the mention; fan sites also link a
//    page that links them. This is not a link exchange: a site is listed
//    because it is useful, whether or not it links back, and never for money.
//
// Rules: only free, working, Riftbound-specific (or Riftbound-section) sites;
// no stores (they are under /stores, ranked by price, never here); no other
// price-comparison site, because sending price shoppers away from the
// comparison is the one thing this page must not do; one sentence each, from
// what the site itself offers. Static, no database read.
//
// Partner entries (2026-10-28, owner): YesTCG and Rift Atlas linked to us and
// were promised a link back here. YesTCG is a local-store FINDER (which game
// stores near you carry Riftbound), not a store and not an online price
// comparison, so it sits in its own group. A partner entry may carry an
// `anchor`: the link text we agreed with that site, shown in place of the
// plain name, which follows in muted text.
//
// TODO(pending reciprocal links, 2026-10-28): MTGStocks and Riftmana were
// offered a reciprocal link and have not replied. Don't add MTGStocks until
// they do. (RiftMana's guides entry below predates the offer, from the page's
// launch, and stays as an ordinary listing.)

type Resource = { name: string; url: string; what: string; anchor?: string };

const GROUPS: { title: string; items: Resource[] }[] = [
  {
    title: "Official",
    items: [
      {
        name: "Play Riftbound",
        url: "https://playriftbound.com/",
        what: "Riot's own site: announcements, set reveals, rules documents and organised play.",
      },
    ],
  },
  {
    title: "Card databases, deck builders and play online",
    items: [
      {
        name: "Riftbound.org",
        url: "https://riftbound.org/",
        what: "A card database by set, champion and printing, shared decks, a products guide with contents and a pack simulator.",
      },
      {
        name: "Piltover Archive",
        url: "https://piltoverarchive.com/",
        what: "A deck builder that exports to Tabletop Simulator, a card library and community interviews.",
      },
      {
        name: "Riftbound.gg",
        url: "https://riftbound.gg/",
        what: "News, tier lists, a keyword glossary and a deck builder with a collection tracker.",
      },
      {
        name: "Rift Atlas",
        anchor: "Play online on Rift Atlas",
        url: "https://play.riftatlas.com",
        what: "Play and test Riftbound decks online.",
      },
    ],
  },
  {
    title: "Decks, meta and guides",
    items: [
      {
        name: "riftDecks",
        url: "https://riftdecks.com/",
        what: "Tournament decklists and legend pages, for seeing what is winning right now.",
      },
      {
        name: "Mobalytics",
        url: "https://mobalytics.gg/riftbound/tier-list",
        what: "A regularly updated Riftbound tier list with deck guides.",
      },
      {
        name: "RiftMana",
        url: "https://riftmana.com/",
        what: "Guides for new and returning players, including how to play Riftbound online.",
      },
    ],
  },
  {
    title: "Shop finders",
    items: [
      {
        name: "YesTCG",
        anchor: "Find Riftbound card shops near you",
        url: "https://yestcg.com/stores/riftbound",
        what: "Local game stores near you that carry Riftbound, with in-stock prices.",
      },
    ],
  },
  {
    title: "Community",
    items: [
      {
        name: "Rift.Tools",
        url: "https://www.rift.tools/",
        what: "A directory of fan-made Riftbound tools, sorted by what they do. Good for finding anything not listed here.",
      },
      {
        name: "r/riftboundtcg",
        url: "https://www.reddit.com/r/riftboundtcg/",
        what: "The main Riftbound subreddit: pulls, deck help and news as it breaks.",
      },
      {
        name: "League of Legends Wiki",
        url: "https://wiki.leagueoflegends.com/en-us/Riftbound",
        what: "The community wiki's Riftbound section, with card pages and lore links.",
      },
    ],
  },
];

export default function ResourcesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: metadata.title,
    url: `${SITE_URL}/resources`,
    description: metadata.description,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
  };

  return (
    <div className="flex flex-col gap-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div>
        <Breadcrumbs trail={[{ name: "Community resources", href: "/resources" }]} />
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Riftbound community sites and tools</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          {SITE_NAME} does one thing: it compares what Riftbound cards and sealed product cost across stores. For
          everything else, these are the fan sites we use ourselves. None of them paid to be here, and none of them
          is affiliated with us or with Riot Games.
        </p>
      </div>

      {GROUPS.map((g) => (
        <section key={g.title} className="card-surface flex flex-col gap-4 p-6">
          <h2 className="text-lg font-bold text-white">{g.title}</h2>
          <ul className="flex flex-col gap-3">
            {g.items.map((r) => (
              <li key={r.url} className="text-sm leading-relaxed text-slate-400">
                <a href={r.url} target="_blank" rel="noopener" className="font-semibold text-brand-400 hover:underline">
                  {r.anchor ?? r.name}
                </a>
                {r.anchor && !r.anchor.includes(r.name) && <span className="text-slate-500"> ({r.name})</span>}
                {" "}
                <span>{r.what}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="card-surface flex flex-col gap-3 p-6">
        <h2 className="text-lg font-bold text-white">Run a Riftbound site?</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          Tell us through the{" "}
          <Link href="/feedback" className="text-brand-400 hover:underline">
            feedback page
          </Link>{" "}
          and we&rsquo;ll take a look. If price data would help your readers, the free{" "}
          <Link href="/embed" className="text-brand-400 hover:underline">
            widgets
          </Link>{" "}
          put a live card price or a release countdown on any page with one line of HTML.
        </p>
      </section>
    </div>
  );
}
