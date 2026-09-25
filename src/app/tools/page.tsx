import type { Metadata } from "next";
import Link from "next/link";
import { premiumPlusEnabled } from "@/lib/premium";
import { SITE_URL } from "@/lib/site";

// The badge on the two "full list" tools (Deal Finder, Rising Cards) — Plus
// once it's configured; dark (Plus unconfigured), they read exactly as they
// did before the split. Best Basket's per-store plan is always Premium.
const LIST_BADGE = premiumPlusEnabled() ? "Plus" : "Premium";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubFaq } from "@/components/HubFaq";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Free Riftbound TCG Tools & Calculators | RiftCompare" },
  description:
    "Every RiftCompare tool in one place: box EV, deck and list pricing and trade calculators free for everyone, plus Deal Finder, Rising Cards and Best Basket for buying a whole list for less.",
  alternates: pageAlternates("/tools"),
  keywords: [
    "riftbound tools",
    "riftbound tcg calculator",
    "riftbound card value calculator",
    "riftbound box ev",
  ],
  openGraph: pageOpenGraph({
    title: "Free Riftbound TCG Tools & Calculators",
    description: "Box EV, deck and list pricing and trade calculators free for everyone, plus Deal Finder, Rising Cards and Best Basket.",
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
    //
    // THE REAL ACCESS, stated per level (2026-09-25). This used to promise
    // "their single best result free", which stopped being true on 09-22: a
    // signed-out visitor sees nothing, a free account the top 3. Emitted as
    // FAQPage JSON-LD too, so a wrong answer here is a wrong rich result.
    a: `Most of them. The box EV calculator, deck builder and list pricer, trade calculator and sealed prices need no account at all. Deal Finder and Rising Cards show nothing when you're signed out, the top 3 with a free account, and every row with ${LIST_BADGE}, which is also ad-free. Best Basket shows your own list's delivered total with a free account; the store-by-store plan is part of Premium.`,
  },
  {
    q: "What does the Deal Finder do?",
    a: `It lists every Riftbound card a real store or eBay is selling for less than TCGplayer's US market price, converted into your currency and ranked by how far below it is. You can filter by store or switch to eBay only, and with ${LIST_BADGE} narrow it to only the cards on your watchlist or in your binder. Signed out it shows nothing, a free account sees the top 3, and ${LIST_BADGE} shows every row.`,
  },
  {
    q: "Do I need an account to use RiftCompare tools?",
    a:
      LIST_BADGE === "Plus"
        ? "Not for most of them. Browsing, comparing prices and running the calculators need no account. A free account adds a watchlist with weekly new-low alerts, portfolio tracking, the top 3 of Deal Finder and Rising Cards, and your own Best Basket total. Plus adds every row of both lists, target-price alerts and an ad-free site; Premium adds Best Basket's store-by-store plan and Buy this list."
        : "Not for most of them. Browsing, comparing prices and running the calculators need no account. A free account adds a watchlist with weekly new-low alerts, portfolio tracking, the top 3 of Deal Finder and Rising Cards, and your own Best Basket total. Premium adds every row of both lists, target-price alerts, an ad-free site, Best Basket's store-by-store plan and Buy this list.",
  },
  {
    q: "Which Riftbound tool should I use to buy a whole decklist?",
    a: "Best Basket. It searches store combinations for the lowest total including postage, and with Premium shows the best one-store and two-store orders beside it. Any signed-in account sees its own delivered total, and can skip the copies it already owns; Premium shows which store to buy each card from.",
  },
  {
    q: "Is a Riftbound booster box worth opening?",
    a: "Use the box EV calculator: it compares a sealed box's live price against the expected value of its pulls at current singles prices. As a rule, buying the singles you actually want is cheaper than opening product for them.",
  },
];

interface Tool {
  href: string;
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
    // THE 2026-09-25 LINEUP. Value Finder, Demand Finder, Rising Sealed, the
    // Condition Calculator and the Bulk Pricer left the product and 301 to the
    // free pages that carry their useful part (next.config.js), so they are
    // not listed; the Bulk Pricer's list pricing is the deck builder's now.
    label: "Buying & value",
    tools: [
      {
        href: "/tools/deal-finder",
        title: "Deal Finder",
        desc: "Every card cheaper than TCGplayer's market price at a real store, with an eBay-only view — or narrowed to only the cards you watch or own.",
        badge: LIST_BADGE,
      },
      {
        href: "/tools/rising",
        title: "Rising Cards",
        desc: "Cards with high or rising demand whose price hasn't moved up yet, each with the reason it ranks.",
        badge: LIST_BADGE,
      },
      {
        href: "/tools/best-basket",
        title: "Best Basket",
        desc: "Buying a whole list? The cheapest delivered order across your country's stores, postage included — see your total free with an account.",
        badge: "Premium",
      },
    ],
  },
  {
    label: "Sealed & boxes",
    tools: [
      {
        href: "/tools/box-ev",
        title: "Box EV calculator",
        desc: "Is ripping a booster box worth it? Compare a box's price against the expected pull value.",
      },
      {
        href: "/sealed",
        title: "Sealed prices",
        desc: "Booster boxes, packs, Proving Grounds and bundles priced across stores — with an in-stock-at-MSRP flag.",
      },
    ],
  },
  {
    label: "Decks, trading & selling",
    tools: [
      {
        href: "/deck",
        title: "Deck builder & list pricer",
        desc: "Build a deck, or paste any card list, and price every card across stores as you go.",
      },
      {
        href: "/trade",
        title: "Trade calculator",
        desc: "Value both sides of a card trade fairly before you commit.",
      },
      // Free and signed-out in the lineup spec, in the nav and in core.xml —
      // and missing from this index until the QA pass (2026-09-25).
      {
        href: "/tools/selling-fees",
        title: "Selling fee calculator",
        desc: "What you actually keep selling a card on TCGplayer or eBay, after commission, processing and postage.",
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
      description: "Every RiftCompare tool and calculator for Riftbound TCG players, buyers and collectors.",
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
        Every RiftCompare tool in one place. Price-check a card, work out whether a box is worth ripping, and build or
        price decks for less — most need no sign-up at all. A free account adds watchlists, price alerts and the top 3
        of each deal list; {LIST_BADGE === "Plus" ? <>Plus shows every deal with no ads, and </> : null}
        <span className="text-gold">Premium</span> works out the cheapest way to buy a whole want-list.
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
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white group-hover:text-brand-300">{t.title}</h3>
                    {t.badge && (
                      <span
                        className={`chip text-[10px] font-semibold ${
                          t.badge === "Premium"
                            ? "bg-gold/20 text-gold"
                            : t.badge === "Plus"
                              ? "bg-slate-500/20 text-slate-300"
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
