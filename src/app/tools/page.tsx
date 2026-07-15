import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Free Riftbound TCG Tools & Calculators | RiftCompare" },
  description:
    "Every RiftCompare tool in one place: selling-fee (net proceeds) calculator, should-I-grade EV calculator, box EV, deck cost and trade calculators, plus the Premium Deal Finder and value screeners.",
  alternates: { canonical: "/tools" },
  keywords: [
    "riftbound tools",
    "riftbound tcg calculator",
    "riftbound card value calculator",
    "riftbound selling fee calculator",
    "riftbound box ev",
  ],
  openGraph: {
    title: "Free Riftbound TCG Tools & Calculators",
    description: "Net proceeds, grading EV, box EV, best basket, deck and trade calculators — plus the Premium Deal Finder & value screeners.",
    url: `${SITE_URL}/tools`,
  },
};

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
        href: "/tools/arbitrage",
        emoji: "💱",
        title: "Deal Finder",
        desc: "Spot cards that are cheaper in one place than another — and cards worth more if you resell them.",
        badge: "Premium",
      },
      {
        href: "/tools/best-basket",
        emoji: "🧺",
        title: "Best basket",
        desc: "Building a want-list? Find the cheapest single-store (or split) basket to buy it all.",
      },
    ],
  },
  {
    label: "Selling & grading",
    tools: [
      {
        href: "/tools/net-proceeds",
        emoji: "💵",
        title: "Net-proceeds calculator",
        desc: "Enter a sale price and see what you actually pocket after eBay / TCGplayer fees, postage and optional grading.",
        badge: "New",
      },
      {
        href: "/tools/grade-ev",
        emoji: "🎯",
        title: "Should I grade it?",
        desc: "Weigh a raw card's value against PSA 10/9 odds and grading cost to see if submitting it pays off.",
        badge: "New",
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
      {
        href: "/proxy",
        emoji: "🖨️",
        title: "Proxy printer",
        desc: "Generate print-ready proxy sheets for playtesting before you buy the real cards.",
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

  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <span className="text-slate-300">Tools</span>
      </nav>

      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Tools &amp; calculators</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        Every RiftCompare tool in one place — most are free, no sign-up. Price-check a card, see what you&apos;d
        actually pocket after fees, work out whether a box or a grade pays off, and build decks for less. The two
        pro screeners (<span className="text-gold">Premium</span>) go deeper for keen buyers and collectors.
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
                          t.badge === "Premium" ? "bg-gold/20 text-gold" : "bg-brand-500/15 text-brand-300"
                        }`}
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
    </div>
  );
}
