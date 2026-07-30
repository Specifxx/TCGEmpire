import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { CountdownTimer } from "@/components/CountdownTimer";
import { NewsletterSignup } from "@/components/NewsletterSignup";

// Timely + indexable. Revalidate hourly so any server-rendered date wording stays
// fresh; the live ticking numbers are client-side.
export const revalidate = 3600;

const RELEASE = { y: 2026, m: 7, d: 31, label: "31 July 2026", iso: "2026-07-31" };

export const metadata: Metadata = {
  title: { absolute: "Riftbound Vendetta Release Countdown — 31 July 2026 | RiftCompare" },
  description:
    "Riftbound: Vendetta singles are already trading early via Pre-Rift launch events, ahead of the 31 July 2026 official street date. Live countdown to full release, plus prices, mechanics and everything you need to know.",
  alternates: { canonical: "/vendetta-countdown" },
  openGraph: {
    title: "Riftbound Vendetta Release Countdown — 31 July 2026",
    description: "How long until Riftbound: Vendetta drops? Live countdown to the 31 July 2026 release.",
    url: `${SITE_URL}/vendetta-countdown`,
    images: [{ url: `${SITE_URL}/vendetta-hero.png`, width: 1200, height: 480 }],
  },
};

const LINKS = [
  { href: "/guides/riftbound-vendetta-card-list", label: "Full card list (confirmed so far)" },
  { href: "/blog/riftbound-vendetta-everything-you-need-to-know", label: "Everything you need to know" },
  { href: "/blog/riftbound-vendetta-new-mechanics-flow-burn-empower", label: "New mechanics: Flow, Burn & Empower" },
  { href: "/guides/best-riftbound-vendetta-decks", label: "Best decks & archetypes" },
  { href: "/guides/riftbound-vendetta-overnumbers-explained", label: "Overnumbers & chase cards" },
  { href: "/guides/riftbound-pre-rift-rules-explained", label: "Pre-Rift rules: how Sealed deck-building works" },
  { href: "/guides/riftbound-vendetta-crystal-rose-cards", label: "Crystal Rose alt-arts: all 6 cards, priced" },
  { href: "/sets/vendetta", label: "Vendetta set page" },
];

// Owns the release-intent long-tail ("what time does Vendetta release", "what's in
// Vendetta") and earns an FAQ rich result. Answers are grounded in confirmed facts.
const FAQS = [
  {
    q: "When does Riftbound: Vendetta release?",
    a: "Riftbound: Vendetta's official worldwide street date is 31 July 2026. In-store Pre-Rift launch events run from 24 July 2026, and singles from those early events are already starting to surface on stores and marketplaces days ahead of the full retail release.",
  },
  {
    q: "What's new in Vendetta?",
    a: "Vendetta adds new champion Legends, three new mechanics — Flow (play from your trash), Burn (send cards to the trash) and Empower (upgrade a card in play) — new card types (Unit-Gear and Decrees), and two-player Showdown Decks so two people can open one box and battle straight away.",
  },
  {
    q: "Where can I buy Vendetta cards cheapest?",
    a: "RiftCompare compares live Vendetta prices across 70+ stores in Australia, New Zealand, the US, the UK, Singapore and Canada, delivered cost included. The moment singles go on sale we surface the cheapest store for every card — check the Vendetta set page on release day.",
  },
  {
    q: "How many days until Vendetta?",
    a: "The live countdown at the top of this page ticks down to release day (31 July 2026) in your own timezone — bookmark it and check back.",
  },
  {
    q: "What are the Pre-Rift deck-building rules?",
    a: "Pre-Rift events are Sealed, not Constructed — you build your deck entirely from the packs you open at the event, with no outside cards. Sealed decks have a 25-card minimum, no 3-copy cap on cards you've opened, and can draw from up to three domains (a Legend or Signature card covers two of those three).",
  },
];

export default function VendettaCountdownPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "Event",
              name: "Riftbound: Vendetta Release",
              startDate: `${RELEASE.iso}T00:00:00+00:00`,
              endDate: `${RELEASE.iso}T23:59:59+00:00`,
              eventStatus: "https://schema.org/EventScheduled",
              eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
              location: { "@type": "VirtualLocation", url: `${SITE_URL}/vendetta-countdown` },
              description: "Global release of Riftbound: Vendetta, the new set for Riftbound: League of Legends TCG.",
              organizer: { "@type": "Organization", name: "Riot Games" },
              image: `${SITE_URL}/vendetta-hero.png`,
              url: `${SITE_URL}/vendetta-countdown`,
            },
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQS.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
          ]),
        }}
      />

      {/* Banner */}
      <div className="overflow-hidden rounded-2xl border border-ink-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vendetta-hero.png" alt="Riftbound: Vendetta releases 31 July 2026" className="w-full" />
      </div>

      <div className="mt-6 text-center">
        <span className="chip inline-flex bg-emerald-500/15 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
          Releases {RELEASE.label}
        </span>
        <h1 className="mt-3 font-display text-3xl font-extrabold text-white sm:text-4xl">Riftbound: Vendetta releases in</h1>
      </div>

      {/* Early-access note: Pre-Rift launch events kicked off 24 July, and singles from
          those early events are already trading days ahead of the official street date
          below — honest both ways: available now, but not yet the full worldwide release. */}
      <Link
        href="/sets/vendetta"
        className="mx-auto mt-5 flex max-w-xl items-center justify-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-center text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-500/15"
      >
        🔥 Vendetta is here early — Pre-Rift singles are already trading. Shop now →
      </Link>

      <div className="mt-6">
        <CountdownTimer y={RELEASE.y} m={RELEASE.m} d={RELEASE.d} href="/sets/vendetta" />
      </div>
      <p className="mx-auto mt-2 max-w-xl text-center text-xs text-slate-500">
        Countdown to the full worldwide street date — 31 July 2026.
      </p>

      {/* Capture the highest-intent timed traffic on the site: release-day reminder. */}
      <div className="mx-auto mt-6 max-w-md">
        <NewsletterSignup
          siteName={SITE_NAME}
          source="countdown"
          variant="card"
          heading="🔔 Get the release-day alert"
          cta="Remind me on launch day"
          done="✓ You're set — we'll email you the moment Vendetta prices go live."
        />
      </div>

      <p className="mx-auto mt-6 max-w-xl text-center text-sm leading-relaxed text-slate-400">
        Riftbound: Vendetta — the next set for Riftbound: League of Legends TCG — has its official worldwide street date on{" "}
        <strong className="text-white">{RELEASE.label}</strong>, with new champions, three new mechanics (Flow, Burn &amp;
        Empower), new card types and two-player Showdown Decks. In-store Pre-Rift events started 24 July, and early singles
        are already trading — we&apos;re comparing every card&apos;s price across AU, NZ, US, UK &amp; Singapore stores as they land,
        so you never overpay.
      </p>

      {/* Read up while you wait */}
      <div className="mt-8">
        <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-slate-500">Get ready while you wait</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="card-surface flex items-center justify-between gap-2 p-4 transition-colors hover:border-brand-500 hover:bg-ink-800"
            >
              <span className="text-sm font-semibold text-white">{l.label}</span>
              <span className="text-brand-400" aria-hidden>→</span>
            </Link>
          ))}
        </div>
      </div>

      {/* FAQ — owns the release-intent long-tail + FAQ rich result (schema above). */}
      <section className="card-surface mt-8 divide-y divide-ink-800 overflow-hidden">
        <h2 className="px-6 py-4 text-lg font-extrabold text-white">Riftbound Vendetta FAQ</h2>
        {FAQS.map((f) => (
          <details key={f.q} className="group px-6 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-200 hover:text-white">
              {f.q}
              <span className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden>▾</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
