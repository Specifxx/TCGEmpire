import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RadianceCountdownTimer } from "@/components/RadianceCountdownTimer";

// Revalidate hourly so the day count stays honest without a per-request render.
export const revalidate = 3600;

// ── Radiance (Set 5) release countdown ───────────────────────────────────────
// Replaces the Vendetta countdown, which was retired once that set shipped (its
// URL 301s to /sets/vendetta — see next.config.js).
//
// EVERY FACT HERE IS SOURCED. Riot published a product/set rundown through 2027
// on 4 August 2026; those figures are written up in
// /blog/riftbound-2027-set-roadmap and reused here rather than re-derived, so the
// two pages cannot drift. Nothing about card lists, chase cards or prices is
// claimed, because none of that is announced yet — that is exactly the invented
// detail this repo has been careful never to publish.
//
// THE COUNTDOWN IS SERVER-COMPUTED, deliberately. The Vendetta page shipped a
// client-side timer that swapped to an "it's here" state on mount while the
// server-rendered HTML — the thing Google actually indexes — still read as
// pre-launch. Computing from the release date at render time means the HTML a
// crawler sees and the HTML a visitor sees are the same, and the hourly
// revalidate keeps it current.
// RELEASE.iso IS AN ASSUMED TIME, NOT A CONFIRMED ONE — flagged explicitly,
// unlike every other fact on this page (see the header note above). Riot has
// announced the DATE (23 October 2026) but has never published an exact hour
// for a Riftbound street date; researched against Vendetta's 31 Jul 2026
// launch and found the same thing there — a physical TCG's in-store
// availability is set by each retailer/distributor, not a single global
// clock-hour the way a digital unlock would be. Absent a confirmed hour, this
// assumes 12:00 AM Pacific Time (Riot's own home time zone, and the
// convention most digital-adjacent product/storefront drops use) — 07:00 UTC
// on 23 Oct 2026, since PDT (UTC-7) is still in effect that date (DST doesn't
// end until 1 Nov 2026). If Riot publishes a real hour, replace this value;
// until then, this is a labelled best-guess, not a fact — the same standard
// the rest of this page holds every other figure to.
const RELEASE = { label: "23 October 2026", iso: "2026-10-23T07:00:00.000Z" };
const SET_NUMBER = 5;
const CARD_COUNT_APPROX = 180;
const CHAMPIONS = ["Seraphine", "Evelynn", "Ekko", "Ziggs", "Jarvan IV"];

/** True once the (assumed) release moment has actually passed. */
function isReleased(): boolean {
  return Date.now() >= new Date(RELEASE.iso).getTime();
}

export const metadata: Metadata = {
  title: { absolute: "Riftbound Radiance Release Date — 23 October 2026 | RiftCompare" },
  description:
    "Riftbound: Radiance (Set 5) releases 23 October 2026 with around 180 cards and five new champion Legends. Release date, what's confirmed, and live prices the day it drops.",
  keywords: [
    "Riftbound Radiance",
    "Riftbound Radiance release date",
    "Riftbound Set 5",
    "when does Riftbound Radiance release",
    "Riftbound Radiance cards",
  ],
  alternates: pageAlternates("/radiance-countdown"),
  openGraph: {
    title: "Riftbound Radiance — Releases 23 October 2026",
    description: "Set 5 lands 23 October 2026 with ~180 cards. Live prices from every store the moment it drops.",
    url: `${SITE_URL}/radiance-countdown`,
  },
};

const LINKS = [
  { href: "/sets/radiance", label: "Radiance set page — prices land here on release" },
  { href: "/blog/riftbound-2027-set-roadmap", label: "The full 2027 set roadmap" },
  { href: "/sets/vendetta", label: "Vendetta — the current set, priced" },
  { href: "/browse", label: "Every Riftbound card in the database" },
  { href: "/sealed", label: "Sealed products & booster boxes" },
  { href: "/tools/box-ev", label: "Box EV calculator — is a box worth it?" },
];

// Release-intent long tail ("when does Radiance come out", "what's in Radiance").
// Answers stay inside what Riot has actually announced; where something is not
// known, the answer says so rather than guessing.
const FAQS = [
  {
    q: "When does Riftbound: Radiance release?",
    a: "23 October 2026. Radiance is the fifth Riftbound set, announced in Riot's product rundown on 4 August 2026.",
  },
  {
    q: "How many cards are in Radiance?",
    a: "Around 180 cards — a step up from Vendetta's 166. The exact final count, including alternate-art and chase printings on top of the base numbering, has not been published yet.",
  },
  {
    q: "Which champions are in Radiance?",
    a: `Five champion Legends are confirmed: ${CHAMPIONS.join(", ")}. The full card list has not been revealed.`,
  },
  {
    q: "Can I pre-order Radiance yet?",
    a: "Yes — tracked stores are already taking pre-orders on Radiance booster boxes, the Radiance Vault, Showdown Decks and event kits, and their opening prices differ a lot. Our Radiance pre-order page compares every one of them in your currency, cheapest first, so you can see the real spread rather than taking the first price you find.",
  },
  {
    q: "What comes after Radiance?",
    a: "Legacy (Set 6) on 29 January 2027 — roughly 346 cards, the largest set announced so far and the first built specifically for draft — followed by The Reckoning on 30 April 2027.",
  },
  {
    q: "Where will Radiance cards be cheapest?",
    a: "RiftCompare compares live prices across stores in Australia, the US, the UK, Singapore and Canada, ranked by total delivered cost including postage. Radiance cards appear on the set page with real prices as soon as stores list them.",
  },
];

export default function RadianceCountdownPage() {
  const released = isReleased();

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs trail={[{ name: "Radiance release date", href: "/radiance-countdown" }]} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQS.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
            // A real, dated, upcoming product release — the one situation where
            // Event markup is honest. It is dropped the moment the date passes
            // (see `released` below); a past-dated Event is exactly the stale
            // markup the Vendetta page had to have removed.
            ...(released
              ? []
              : [
                  {
                    "@context": "https://schema.org",
                    "@type": "Event",
                    name: "Riftbound: Radiance release",
                    startDate: RELEASE.iso,
                    eventStatus: "https://schema.org/EventScheduled",
                    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
                    location: {
                      "@type": "VirtualLocation",
                      url: `${SITE_URL}/radiance-countdown`,
                    },
                    description: `Riftbound: Radiance, Set ${SET_NUMBER} of Riftbound: League of Legends TCG, releases on ${RELEASE.label}.`,
                    organizer: { "@type": "Organization", name: "Riot Games" },
                  },
                ]),
          ]),
        }}
      />

      <div className="mt-6 text-center">
        <span className="chip inline-flex bg-brand-500/15 text-[11px] font-bold uppercase tracking-wider text-brand-300">
          {released ? `Out now — released ${RELEASE.label}` : `Set ${SET_NUMBER} · ${RELEASE.label}`}
        </span>
        <h1 className="mt-3 font-display text-3xl font-extrabold text-white sm:text-4xl">
          {released ? "Riftbound: Radiance is out now" : "Riftbound: Radiance releases 23 October 2026"}
        </h1>

        {!released && <RadianceCountdownTimer targetIso={RELEASE.iso} />}

        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
          {released ? (
            <>
              Radiance released on <strong className="text-white">{RELEASE.label}</strong>. Every card is live on
              RiftCompare with prices compared across every store we track.
            </>
          ) : (
            <>
              <strong className="text-white">Radiance</strong> is Set {SET_NUMBER} for Riftbound: League of Legends TCG —
              around {CARD_COUNT_APPROX} cards, with {CHAMPIONS.length} new champion Legends. RiftCompare will compare
              every card&apos;s price across every store we track from the day it lands.
            </>
          )}
        </p>
      </div>

      <Link
        href="/sets/radiance"
        className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-center text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-500/15"
      >
        ✨ Radiance set page — prices land here on release →
      </Link>

      <div className="mx-auto mt-6 grid max-w-xl gap-2 sm:grid-cols-3">
        <div className="card-surface p-3 text-center text-sm font-semibold text-white">
          ~{CARD_COUNT_APPROX} cards
          <span className="mt-0.5 block text-xs font-normal text-slate-500">up from Vendetta&apos;s 166</span>
        </div>
        <div className="card-surface p-3 text-center text-sm font-semibold text-white">
          {CHAMPIONS.length} new Legends
          <span className="mt-0.5 block text-xs font-normal text-slate-500">Seraphine, Evelynn, Ekko…</span>
        </div>
        {/* Points at the pre-order comparison, not /sealed. This tile promised
            "compare pre-orders" while the importer was still dropping every
            unreleased-set listing, so /sealed could never show one. */}
        <Link href="/radiance-preorders" className="card-surface p-3 text-center text-sm font-semibold text-white transition-colors hover:border-brand-500">
          Pre-order prices
          <span className="mt-0.5 block text-xs font-normal text-slate-500">compare every store</span>
        </Link>
      </div>

      <div className="mx-auto mt-8 max-w-md">
        <NewsletterSignup
          siteName={SITE_NAME}
          source="countdown"
          variant="card"
          heading="🔔 Know the moment Radiance prices go live"
          cta="Email me when Radiance drops"
          done="✓ You're set — we'll email you when Radiance lands."
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-extrabold text-white">What&apos;s confirmed so far</h2>
        <div className="card-surface p-5 text-sm leading-relaxed text-slate-400">
          <p>
            Riot published its product and set rundown on <strong className="text-slate-200">4 August 2026</strong>,
            putting the Riftbound calendar about fifteen months ahead. Radiance is the near-term release:{" "}
            <strong className="text-slate-200">{RELEASE.label}</strong>, roughly {CARD_COUNT_APPROX} cards, with{" "}
            {CHAMPIONS.slice(0, -1).join(", ")} and {CHAMPIONS[CHAMPIONS.length - 1]} joining as champion Legends.
          </p>
          <p className="mt-3">
            The full card list, the set&apos;s mechanics and its chase-card structure{" "}
            <strong className="text-slate-200">have not been announced</strong>. We&apos;ll list them here as Riot reveals
            them — and this page will never show a card, a price or a spoiler we can&apos;t source. For everything
            scheduled after Radiance, see the{" "}
            <Link href="/blog/riftbound-2027-set-roadmap" className="text-brand-300 underline-offset-2 hover:underline">
              2027 set roadmap
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-slate-500">
          While you wait
        </h2>
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
        <h2 className="mb-3 text-lg font-extrabold text-white">Radiance release FAQ</h2>
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
