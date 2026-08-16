import type { Metadata } from "next";
import Link from "next/link";
import { ALL_KEYWORD_NAMES, KEYWORDS, keywordSlug } from "@/lib/keywords";
import { SITE_URL } from "@/lib/site";

// Single-page glossary + hub. riftbound.gg's /glossary (launched 2026-07-18) is one
// page covering every keyword briefly; this page covers the same "one-page intent"
// (every known keyword name, alphabetised reference) while each entry also links
// out to its own deep page — direct answer, worked examples with real card images,
// edge-case rulings and a live "every card with this keyword" list, which a single
// glossary page structurally can't do.
//
// EVERY keyword is now linked (as of 2026-08-12 — see lib/keywords.ts's header for
// the source). The `entry ? … : …` branch below is kept rather than assumed away:
// it's what makes an unlinked name a "Soon" placeholder instead of a broken link if
// ALL_KEYWORD_NAMES ever grows a name before its KEYWORDS entry is written — a
// deliberate future state the data-accuracy rule requires (verify before publishing),
// not a leftover from an earlier, incomplete version of this page.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Riftbound Keywords & Game Actions Glossary | RiftCompare" },
  description:
    "Every Riftbound keyword and game action, in one place — Empower, Flow, Burn and more, each with a quick rules reference, live card prices, and a link to the full guide.",
  alternates: { canonical: "/keywords" },
  openGraph: {
    title: "Riftbound Keywords Glossary | RiftCompare",
    description: "Every Riftbound keyword and game action in one place, with a quick rules reference for the mechanics people search most.",
    url: `${SITE_URL}/keywords`,
  },
};

export default function KeywordsIndexPage() {
  const sorted = [...ALL_KEYWORD_NAMES].sort((a, b) => a.localeCompare(b));

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Keywords", item: `${SITE_URL}/keywords` },
    ],
  };
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Riftbound Keywords & Game Actions Glossary",
    url: `${SITE_URL}/keywords`,
      // Edges back to the site-level graph in app/layout.tsx. Without them this
      // node is an island and the Organization/WebSite entity signals — sameAs,
      // areaServed, knowsAbout — don't propagate to the page.
      isPartOf: { "@id": `${SITE_URL}/#website` },
      publisher: { "@id": `${SITE_URL}/#org` },
  };

  return (
    <div className="flex flex-col gap-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, collectionLd]) }} />

      <div>
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Keywords</span>
        </nav>
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Riftbound keywords &amp; game actions glossary</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Every Riftbound keyword and game action, from Empower and Flow to Tank, Reaction and the
          rest — {KEYWORDS.length} in total, each with a quick rules reference straight from Riot&apos;s
          own Core Rules: a direct answer, every card printed with it (live-priced), and a link out to
          a full guide for the deckbuilding detail.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {sorted.map((name) => {
          const entry = KEYWORDS.find((k) => k.slug === keywordSlug(name));
          return entry ? (
            <Link
              key={name}
              href={`/keywords/${entry.slug}`}
              className="card-surface flex items-center justify-between gap-2 p-3.5 text-sm font-semibold text-white transition-colors hover:border-brand-500 hover:text-brand-300"
            >
              {name}
              <span className="text-xs text-brand-400">→</span>
            </Link>
          ) : (
            <span
              key={name}
              className="flex items-center justify-between gap-2 rounded-xl border border-ink-800 bg-ink-900/40 p-3.5 text-sm font-medium text-slate-600"
              title="Rules writeup pending a verified source"
            >
              {name}
              <span className="text-[10px] uppercase tracking-wide text-slate-700">Soon</span>
            </span>
          );
        })}
      </div>

      {/* Two real, sourced paragraphs rather than a bare link grid. This page was
          measured at 146 unique editorial words with affiliate links on it — four
          short of the 150-word floor, which is the "thin affiliate" shape an
          AdSense reviewer is looking for (scripts/adsense-audit.ts flagged it).
          The fix is content that genuinely helps someone read a card, not filler:
          the keyword/game-action split below is the single most useful thing to
          know before using this glossary, and it comes from the same Core Rules
          sections lib/keywords.ts already cites entry by entry. */}
      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Keywords vs game actions</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Not everything in this glossary works the same way on a card. Riot&apos;s Core Rules split them
          into two groups, and knowing which you&apos;re looking at tells you where to find its rules text.{" "}
          <strong className="text-slate-200">Printed keywords</strong> — Empower, Tank, Flow and the rest —
          appear in brackets on the card itself and are defined in the rules&apos; own Keyword Glossary. They
          are properties the card carries.
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          <strong className="text-slate-200">Game actions</strong> — Buff, Stun, Mighty — read like ordinary
          verbs in a card&apos;s sentence rather than bracketed labels, which is why they are easy to mistake
          for plain English. They are not: each has precise rules text defining exactly what it does, and
          two cards using the same verb do the same thing. That is what makes them worth looking up, and
          every entry below is paraphrased from those rules rather than from how a card happens to read.
        </p>
      </section>

      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Vendetta&apos;s three new mechanics</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Empower, Flow and Burn are the three brand-new keywords introduced in{" "}
          <Link href="/sets/vendetta" className="text-brand-400 hover:underline">Riftbound: Vendetta</Link>.
          They&apos;re designed to combo — Burn fills your trash, Flow spends it, and Empower turns a cheap
          early card into a late-game threat. Read the tutorial-style breakdown of all three in{" "}
          <Link href="/blog/riftbound-vendetta-new-mechanics-flow-burn-empower" className="text-brand-400 hover:underline">
            Vendetta&apos;s new mechanics explained
          </Link>.
        </p>
      </section>
    </div>
  );
}
