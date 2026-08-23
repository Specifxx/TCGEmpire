import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubFaq } from "@/components/HubFaq";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Free Riftbound TCG Tools & Calculators | RiftCompare" },
  description:
    "Every RiftCompare tool in one place: box EV, deck and trade calculators, Best Basket free with an account, plus Premium's Deal Finder and value screeners.",
  alternates: pageAlternates("/tools"),
  keywords: [
    "riftbound tools",
    "riftbound tcg calculator",
    "riftbound card value calculator",
    "riftbound box ev",
  ],
  openGraph: pageOpenGraph({
    title: "Free Riftbound TCG Tools & Calculators",
    description: "Box EV, deck and trade calculators — Best Basket free with an account, plus Premium's Deal Finder & value screeners.",
    url: "/tools",
  }),
};

// The questions this hub should own in an answer engine. Kept next to the tool
// list so a new tool and its answer move together.
const FAQS = [
  {
    q: "Are the RiftCompare tools free?",
    // Deliberately does NOT say "unlock the full …" — that exact phrase is one of
    // the paywall markers scripts/adsense-audit.ts scans for, and this page merely
    // DESCRIBES the tiers rather than gating anything, so it was being reported as
    // a paywalled indexable page on the strength of its own FAQ copy. Reworded
    // rather than removing the marker, which still needs to catch a real paywall.
    a: "Most of them; a few ask you to be signed in or to be Premium. The box EV calculator, deck builder, trade calculator and sealed prices need no account at all. Best Basket is free with any account — no Premium needed. The Deal Finder, value finder and rising-cards screeners show their single best result free, with the complete list included in Premium — the bulk pricer is also part of Premium.",
  },
  {
    q: "What does the Deal Finder do?",
    a: "It compares the same Riftbound card's live price across every tracked store and region and surfaces where the gap is large enough to matter — including cards worth more on eBay than in stores, the cheapest place to buy a given card all-in, and cards priced meaningfully cheaper in another tracked market. Premium members get the complete list; everyone else sees the single best result.",
  },
  {
    q: "Do I need an account to use RiftCompare tools?",
    a: "Not for most of them. Browsing, comparing prices and running the calculators need no account. A free account adds watchlists, price alerts, portfolio tracking and Best Basket. The bulk pricer — the other list tool — is part of Premium.",
  },
  {
    q: "Which Riftbound tool should I use to buy a whole decklist?",
    a: "Best Basket. It solves for the cheapest combination of stores for one wantlist including shipping, which is almost always cheaper than buying each card from whoever is individually cheapest.",
  },
  {
    q: "Is a Riftbound booster box worth opening?",
    a: "Use the box EV calculator: it compares a sealed box's live price against the expected value of its pulls at current singles prices. As a rule, buying the singles you actually want is cheaper than opening product for them.",
  },
];

interface Tool {
  href: string;
  emoji: string;
  title: string;
  desc: string;
  badge?: string;
}
interface ToolGroup {
  label: string;
  tools: Tool[];
}

const GROUPS: ToolGroup[] = [
  {
    label: "Buying & value",
    tools: [
      {
        href: "/tools/value-finder",
        emoji: "🔎",
        title: "Value finder",
        desc: "Surface the cards trading below their fair value right now — the best buys on the board.",
        badge: "Premium",
      },
      {
        href: "/tools/rising",
        emoji: "🚀",
        title: "Rising cards",
        desc: "Cards ranked by demand and price-timing signals — high or rising interest that hasn't re-rated yet.",
        badge: "Premium",
      },
      {
        href: "/tools/deal-finder",
        emoji: "💱",
        title: "Deal Finder",
        desc: "Spot cards that are cheaper in one place than another — including another market entirely — and cards worth more if you resell them.",
        badge: "Premium",
      },
      {
        href: "/tools/best-basket",
        emoji: "🧺",
        title: "Best basket",
        desc: "Building a want-list? Find the cheapest single-store (or split) basket to buy it all.",
        badge: "Account",
      },
      {
        href: "/bulk-pricer",
        emoji: "📋",
        title: "Bulk pricer",
        desc: "Paste a whole want-list, trade pile or collection and price every card at once with a running total.",
        badge: "Premium",
      },
      {
        href: "/tools/condition-calculator",
        emoji: "🩹",
        title: "Condition calculator",
        desc: "Estimate how a card's value shifts between NM, LP, MP, HP and DMG — the same scale your portfolio uses.",
        badge: "Premium",
      },
    ],
  },
  {
    label: "Sealed & boxes",
    tools: [
      {
        href: "/tools/box-ev",
        emoji: "🎲",
        title: "Box EV calculator",
        desc: "Is ripping a booster box worth it? Compare a box's price against the expected pull value.",
      },
      {
        href: "/sealed",
        emoji: "📦",
        title: "Sealed prices",
        desc: "Booster boxes, packs, Proving Grounds and bundles priced across stores — with an in-stock-at-MSRP flag.",
      },
    ],
  },
  {
    label: "Decks & trading",
    tools: [
      {
        href: "/decks",
        emoji: "🏆",
        title: "Meta decks + deck cart",
        desc: "Browse the current meta decks — each one prices the cheapest cart to build it across stores.",
        badge: "New",
      },
      {
        href: "/deck",
        emoji: "🛠️",
        title: "Deck builder",
        desc: "Build a deck and price every card across stores as you go.",
      },
      {
        href: "/trade",
        emoji: "🔁",
        title: "Trade calculator",
        desc: "Value both sides of a card trade fairly before you commit.",
      },
    ],
  },
];

export default function ToolsHubPage() {
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "RiftCompare Tools & Calculators",
    url: `${SITE_URL}/tools`,
    itemListElement: GROUPS.flatMap((g) => g.tools).map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.title,
      url: `${SITE_URL}${t.href}`,
    })),
  };

  const ld = ldJson(
    // Ties this hub to the site-level Organization/WebSite graph in app/layout.tsx
    // — without it the ItemList is an island and none of the entity signals on
    // that graph propagate here.
    webPage({
      name: "Riftbound TCG Tools & Calculators",
      href: "/tools",
      description: "Every RiftCompare tool and calculator for Riftbound TCG buyers, sellers and collectors.",
      type: "CollectionPage",
    }),
    itemListLd,
    faqPage(FAQS)
  );

  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      {/* Was a visible-only breadcrumb with no BreadcrumbList markup behind it —
          the exact split <Breadcrumbs> exists to close. */}
      <Breadcrumbs trail={[{ name: "Tools", href: "/tools" }]} />

      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Tools &amp; calculators</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        Every RiftCompare tool in one place. Price-check a card, work out whether a box is worth ripping, and build
        decks for less — most need no sign-up at all. A free account adds watchlists, price alerts and Best
        Basket, and the pro screeners (<span className="text-gold">Premium</span>) go deeper for keen buyers and
        collectors.
      </p>

      {GROUPS.map((group) => (
        <section key={group.label} className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{group.label}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.tools.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="card-surface group flex gap-3 p-4 transition-colors hover:border-ink-600"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink-800 text-xl" aria-hidden>
                  {t.emoji}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white group-hover:text-brand-300">{t.title}</h3>
                    {t.badge && (
                      <span
                        className={`chip text-[10px] font-semibold ${
                          t.badge === "Premium"
                            ? "bg-gold/20 text-gold"
                            : t.badge === "Account"
                              ? "bg-ink-700 text-slate-300"
                              : "bg-brand-500/15 text-brand-300"
                        }`}
                        title={t.badge === "Account" ? "Free — needs a RiftCompare account" : undefined}
                      >
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{t.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <HubFaq faqs={FAQS} />
    </div>
  );
}
