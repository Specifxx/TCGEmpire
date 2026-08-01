import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { NewsletterSignup } from "@/components/NewsletterSignup";

// Timely + indexable. Revalidate hourly so the wording stays fresh.
export const revalidate = 3600;

// POST-LAUNCH (31 Jul 2026). This page used to be a live countdown to the street
// date. That date has passed, so the countdown, the "releases in" heading and the
// "singles are already trading early" framing were all stale — and worse, the
// server-rendered HTML (what Google indexes) still read as pre-launch even though
// the client-side timer swapped itself to an "it's here" state on mount.
//
// The URL is deliberately KEPT rather than redirected: "riftbound vendetta release
// date" is one of the highest-volume queries in this niche, and "is Vendetta out
// yet" is still a real question people ask. The page now answers it in the past
// tense and sends them to live prices. ~35 internal links point here.
const RELEASE = { label: "31 July 2026", iso: "2026-07-31" };

export const metadata: Metadata = {
  title: { absolute: "Riftbound Vendetta Release Date — Out Now (31 July 2026) | RiftCompare" },
  description:
    "Riftbound: Vendetta released worldwide on 31 July 2026 and is out now. Every card in the set with live prices compared across stores in Australia, New Zealand, the US, the UK, Singapore and Canada.",
  alternates: { canonical: "/vendetta-countdown" },
  openGraph: {
    title: "Riftbound Vendetta Is Out Now — Released 31 July 2026",
    description: "Vendetta released 31 July 2026. See every card in the set with live prices compared across every store.",
    url: `${SITE_URL}/vendetta-countdown`,
    images: [{ url: `${SITE_URL}/vendetta-hero.png`, width: 1200, height: 480 }],
  },
};

const LINKS = [
  { href: "/sets/vendetta", label: "Every Vendetta card, with live prices" },
  { href: "/guides/riftbound-vendetta-card-list", label: "Full card list" },
  { href: "/blog/riftbound-vendetta-chase-cards-so-far", label: "Chase cards, tier by tier" },
  { href: "/blog/riftbound-vendetta-everything-you-need-to-know", label: "Everything you need to know" },
  { href: "/blog/riftbound-vendetta-new-mechanics-flow-burn-empower", label: "New mechanics: Flow, Burn & Empower" },
  { href: "/guides/best-riftbound-vendetta-decks", label: "Best decks & archetypes" },
  { href: "/guides/riftbound-vendetta-overnumbers-explained", label: "Overnumbers & chase cards" },
  { href: "/guides/riftbound-vendetta-crystal-rose-cards", label: "Crystal Rose alt-arts: all 6 cards, priced" },
];

// Owns the release-intent long-tail ("is Vendetta out yet", "when did Vendetta
// release", "what's in Vendetta") and earns an FAQ rich result. Answers are
// grounded in confirmed facts and written in the past tense now that it's shipped.
const FAQS = [
  {
    q: "Is Riftbound: Vendetta out yet?",
    a: "Yes. Riftbound: Vendetta released worldwide on 31 July 2026 and is available now. In-store Pre-Rift launch events ran from 24 July 2026 ahead of the full retail release.",
  },
  {
    q: "When did Riftbound: Vendetta release?",
    a: "31 July 2026, worldwide. In-store Pre-Rift launch events ran from 24 July 2026, so some singles were trading days ahead of the official street date.",
  },
  {
    q: "What's new in Vendetta?",
    a: "Vendetta adds new champion Legends, three new mechanics — Flow (play from your trash), Burn (send cards to the trash) and Empower (upgrade a card in play) — new card types (Unit-Gear and Decrees), and two-player Showdown Decks so two people can open one box and battle straight away.",
  },
  {
    q: "Where can I buy Vendetta cards cheapest?",
    a: "RiftCompare compares live Vendetta prices across stores in Australia, New Zealand, the US, the UK, Singapore and Canada, ranked by total delivered cost including postage. Open any card on the Vendetta set page to see every store's current price side by side.",
  },
  {
    q: "How many cards are in Riftbound: Vendetta?",
    a: "The main set is 166 cards, plus Showcase alternate-art printings, Overnumbered chase cards, runes and promos on top of that base numbering.",
  },
  {
    q: "What are the Pre-Rift deck-building rules?",
    a: "Pre-Rift events are Sealed, not Constructed — you build your deck entirely from the packs you open at the event, with no outside cards. Sealed decks have a 25-card minimum, no 3-copy cap on cards you've opened, and can draw from up to three domains (a Legend or Signature card covers two of those three).",
  },
];

export default function VendettaCountdownPage() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* FAQPage only. The Event schema that used to sit here described a release
          that has now happened — Google's Event rich results are for upcoming
          events, so a permanently-past one is noise rather than a signal. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />

      {/* Banner */}
      <div className="overflow-hidden rounded-2xl border border-ink-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vendetta-hero.png" alt="Riftbound: Vendetta — out now" className="w-full" />
      </div>

      <div className="mt-6 text-center">
        <span className="chip inline-flex bg-brand-500/15 text-[11px] font-bold uppercase tracking-wider text-brand-300">
          Out now — released {RELEASE.label}
        </span>
        <h1 className="mt-3 font-display text-3xl font-extrabold text-white sm:text-4xl">
          Riftbound: Vendetta is out now
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
          Vendetta released worldwide on <strong className="text-white">{RELEASE.label}</strong>. Every card in the set is
          live on RiftCompare with prices compared across every store we track — in your own market&apos;s currency, ranked
          by what you&apos;d actually pay delivered.
        </p>
      </div>

      <Link
        href="/sets/vendetta"
        className="mx-auto mt-5 flex max-w-xl items-center justify-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-center text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-500/15"
      >
        🔥 See every Vendetta card and its live price →
      </Link>

      <div className="mx-auto mt-6 grid max-w-xl gap-2 sm:grid-cols-3">
        <Link href="/sets/vendetta" className="card-surface p-3 text-center text-sm font-semibold text-white transition-colors hover:border-brand-500">
          166-card set
          <span className="mt-0.5 block text-xs font-normal text-slate-500">browse them all</span>
        </Link>
        <Link href="/blog/riftbound-vendetta-chase-cards-so-far" className="card-surface p-3 text-center text-sm font-semibold text-white transition-colors hover:border-brand-500">
          Chase cards
          <span className="mt-0.5 block text-xs font-normal text-slate-500">tier by tier</span>
        </Link>
        <Link href="/movers" className="card-surface p-3 text-center text-sm font-semibold text-white transition-colors hover:border-brand-500">
          Price movers
          <span className="mt-0.5 block text-xs font-normal text-slate-500">what&apos;s climbing</span>
        </Link>
      </div>

      {/* Still the highest-intent capture on the page — just no longer a
          "launch day" reminder, since launch day has been and gone. */}
      <div className="mx-auto mt-8 max-w-md">
        <NewsletterSignup
          siteName={SITE_NAME}
          source="countdown"
          variant="card"
          heading="🔔 Get price drops in your inbox"
          cta="Send me Vendetta price alerts"
          done="✓ You're set — we'll email you when Vendetta prices move."
        />
      </div>

      <p className="mx-auto mt-6 max-w-xl text-center text-sm leading-relaxed text-slate-400">
        Riftbound: Vendetta — Set 4 for Riftbound: League of Legends TCG — launched on{" "}
        <strong className="text-white">{RELEASE.label}</strong> with new champion Legends, three new mechanics (Flow, Burn
        &amp; Empower), new card types and two-player Showdown Decks. We compare every card&apos;s price across stores in
        Australia, New Zealand, the US, the UK, Singapore and Canada, so you never overpay.
      </p>

      {/* Everything else about the set */}
      <div className="mt-8">
        <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-slate-500">More on Vendetta</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="card-surface px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-brand-500 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Visible FAQ — mirrors the FAQPage schema above, as Google requires. */}
      <div className="mt-10">
        <h2 className="mb-3 text-lg font-extrabold text-white">Vendetta release FAQ</h2>
        <div className="card-surface divide-y divide-ink-800 overflow-hidden">
          {FAQS.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-200 hover:text-white">
                {f.q}
                <span className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden>▾</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
