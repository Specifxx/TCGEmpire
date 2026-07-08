import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { CountdownTimer } from "@/components/CountdownTimer";

// Timely + indexable. Revalidate hourly so any server-rendered date wording stays
// fresh; the live ticking numbers are client-side.
export const revalidate = 3600;

const RELEASE = { y: 2026, m: 7, d: 31, label: "31 July 2026", iso: "2026-07-31" };

export const metadata: Metadata = {
  title: { absolute: "Riftbound Vendetta Release Countdown — 31 July 2026 | RiftCompare" },
  description:
    "Live countdown to Riftbound: Vendetta — the new League of Legends TCG set releases 31 July 2026. See exactly how long until it drops, plus the new mechanics, decks and everything you need to know.",
  alternates: { canonical: "/vendetta-countdown" },
  openGraph: {
    title: "Riftbound Vendetta Release Countdown — 31 July 2026",
    description: "How long until Riftbound: Vendetta drops? Live countdown to the 31 July 2026 release.",
    url: `${SITE_URL}/vendetta-countdown`,
    images: [{ url: `${SITE_URL}/vendetta-hero.png`, width: 1200, height: 480 }],
  },
};

const LINKS = [
  { href: "/blog/riftbound-vendetta-everything-you-need-to-know", label: "Everything you need to know" },
  { href: "/blog/riftbound-vendetta-new-mechanics-flow-burn-empower", label: "New mechanics: Flow, Burn & Empower" },
  { href: "/guides/best-riftbound-vendetta-decks", label: "Best decks & archetypes" },
  { href: "/sets/vendetta", label: "Vendetta set page" },
];

export default function VendettaCountdownPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
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
          }),
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

      <div className="mt-6">
        <CountdownTimer y={RELEASE.y} m={RELEASE.m} d={RELEASE.d} href="/sets/vendetta" />
      </div>

      <p className="mx-auto mt-6 max-w-xl text-center text-sm leading-relaxed text-slate-400">
        Riftbound: Vendetta — the next set for Riftbound: League of Legends TCG — drops{" "}
        <strong className="text-white">{RELEASE.label}</strong>, with new champions, three new mechanics (Flow, Burn &amp;
        Empower), new card types and two-player Showdown Decks. In-store Pre-Rift events run from 24 July. The moment it
        lands, we&apos;ll compare every card&apos;s price across AU, NZ, US &amp; UK stores so you never overpay.
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
    </div>
  );
}
