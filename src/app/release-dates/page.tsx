import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ReleaseCountdownTimer } from "@/components/ReleaseCountdownTimer";
import { CopyPostButton } from "@/components/CopyPostButton";
import {
  RELEASES,
  assumedStreetInstant,
  cardCountLabel,
  latestRelease,
  nextDatedRelease,
  releaseDateLabel,
  releaseHref,
  releaseWhenLabel,
  splitCalendar,
  type ReleaseEntry,
} from "@/lib/release-calendar";

// Revalidate hourly so the day count stays honest without a per-request render.
export const revalidate = 3600;

// ── Riftbound release dates ──────────────────────────────────────────────────
// The permanent home for "when does the next Riftbound set come out". It
// replaces /radiance-countdown, which replaced /vendetta-countdown, which had to
// be retired the day Vendetta shipped — the third time in a row a page named
// after one set would have gone stale on a known date. Nothing here names a set
// in code: every fact is read from lib/release-calendar.ts and split at today's
// date, so on 23 Oct 2026 Radiance moves into the released table, Legacy becomes
// the countdown, and the metadata, the H1, the FAQ and the schema all follow —
// with no edit to this file.
//
// THE COUNTDOWN IS SERVER-COMPUTED, deliberately. The Vendetta page shipped a
// client-side timer that swapped to an "it's here" state on mount while the
// server-rendered HTML — the thing Google actually indexes — still read as
// pre-launch. Computing from the release date at render time means the HTML a
// crawler sees and the HTML a visitor sees are the same, and the hourly
// revalidate keeps it current.
//
// EVERY FACT IS SOURCED, and none of it is re-derived here — see the header
// comment on lib/release-calendar.ts for where each figure comes from. Nothing
// about card lists, chase cards or prices is claimed for an unreleased set,
// because none of that is announced: that is exactly the invented detail this
// repo has been careful never to publish.

/** Title/description track whichever set is next, so the page never lies. */
export function generateMetadata(): Metadata {
  const next = nextDatedRelease();
  const nextLabel = next ? releaseDateLabel(next.date) : null;
  const title = next
    ? `Riftbound Release Dates — ${next.name} on ${nextLabel} | ${SITE_NAME}`
    : `Riftbound Release Dates — Every Set, In Order | ${SITE_NAME}`;
  const description = next
    ? `Riftbound: ${next.name} releases ${nextLabel}${
        next.cards ? ` with ${cardCountLabel(next)}` : ""
      }. Every Riftbound set's release date in order, what's confirmed, and live prices the day it drops.`
    : "Every Riftbound set's release date in order, what's confirmed for each, and live prices from every store we track.";

  return {
    title: { absolute: title },
    description,
    keywords: [
      "Riftbound release dates",
      "Riftbound set release date",
      "next Riftbound set",
      "when does the next Riftbound set release",
      ...(next ? [`Riftbound ${next.name}`, `Riftbound ${next.name} release date`] : []),
    ],
    alternates: pageAlternates("/release-dates"),
    openGraph: {
      title: next ? `Riftbound: ${next.name} — releases ${nextLabel}` : "Riftbound release dates",
      description: next
        ? `${next.name} lands ${nextLabel}. Live prices from every store the moment it drops.`
        : description,
      url: `${SITE_URL}/release-dates`,
    },
  };
}

const LINKS = [
  { href: "/sets", label: "Every set, with card lists and prices" },
  { href: "/blog/riftbound-2027-set-roadmap", label: "The full 2027 set roadmap" },
  { href: "/guides/riftbound-sets-in-order", label: "Every Riftbound set, in release order" },
  { href: "/browse", label: "Every Riftbound card in the database" },
  { href: "/sealed", label: "Sealed products & booster boxes" },
  { href: "/tools/box-ev", label: "Box EV calculator — is a box worth it?" },
];

/**
 * Release-intent long tail ("when does <set> come out", "what's in <set>",
 * "what's after <set>"), built from the calendar rather than written out, so the
 * answers roll forward with it. Where something is not known, the answer says so
 * rather than guessing.
 */
function buildFaqs(now: Date): { q: string; a: string }[] {
  const { released, upcoming } = splitCalendar(now);
  const next = nextDatedRelease(now);
  const latest = latestRelease(now);
  const faqs: { q: string; a: string }[] = [];

  if (next) {
    const when = releaseDateLabel(next.date);
    faqs.push({
      q: `When does Riftbound: ${next.name} release?`,
      a: `${when}. ${next.note}`,
    });
    if (next.cards != null) {
      faqs.push({
        q: `How many cards are in ${next.name}?`,
        a: `${next.approxCards ? "Around " : ""}${next.cards} cards in the base set${
          latest?.cards != null ? ` — ${latest.name}, the current set, has ${latest.cards}` : ""
        }. The exact final count, including alternate-art and chase printings on top of the base numbering, ${
          next.approxCards ? "has not been published yet" : "is confirmed"
        }.`,
      });
    }
    if (next.champions?.length) {
      faqs.push({
        q: `Which champions are in ${next.name}?`,
        a: `${next.champions.length} champion Legends are confirmed: ${next.champions.join(
          ", ",
        )}. The full card list has not been revealed.`,
      });
    }
    if (next.preordersHref) {
      faqs.push({
        q: `Can I pre-order ${next.name} yet?`,
        a: `Yes — tracked stores are already taking pre-orders, and their opening prices differ a lot. Our pre-order page compares every one of them in your currency, cheapest first, so you can see the real spread rather than taking the first price you find.`,
      });
    }
    const after = upcoming.filter((r) => r !== next);
    if (after.length) {
      faqs.push({
        q: `What comes after ${next.name}?`,
        a: after
          .slice(0, 3)
          .map((r) => `${r.name} (${releaseWhenLabel(r)})`)
          .join(", then ") + ".",
      });
    }
  }

  faqs.push({
    q: "How many Riftbound sets have released so far?",
    a: `${released.length}: ${released.map((r) => r.name).join(", ")}.${
      next ? ` ${next.name} is next, on ${releaseDateLabel(next.date)}.` : ""
    }`,
  });

  const undated = released.filter((r) => !r.date);
  // "…the way it later did for <first set with a date>" is read from the
  // calendar, not typed: naming a set here is the same rot this page exists to
  // end, and it would be quietly wrong the moment the first dated set changed.
  const firstDated = RELEASES.find((r) => r.date);
  if (undated.length && firstDated) {
    faqs.push({
      q: "Why don't the older sets have exact release dates?",
      a: `Riot never published street dates for ${undated
        .map((r) => r.name)
        .join(", ")} the way it later did for ${
        firstDated.name
      } and everything after it. We list them in release order — the order every set list and legality note agrees on — rather than inventing dates we can't source.`,
    });
  }

  faqs.push({
    q: "Do Riftbound release dates change?",
    a: "Dates announced a year or more ahead are a plan, not a promise, and Riot's own announcement says as much. Treat the nearest release as firm and anything beyond it as directional — this page tracks Riot's published schedule and updates when that schedule does.",
  });

  return faqs;
}

function CalendarRow({ entry, released }: { entry: ReleaseEntry; released: boolean }) {
  const href = releaseHref(entry);
  const cards = cardCountLabel(entry);
  return (
    <tr className="border-t border-ink-800 align-top">
      <th scope="row" className="px-4 py-3 text-left text-sm font-semibold text-white">
        {href ? (
          <Link href={href} className="text-brand-300 underline-offset-2 hover:underline">
            {entry.name}
          </Link>
        ) : (
          entry.name
        )}
        {!released && (
          <span className="ml-2 chip bg-brand-500/15 text-[10px] font-bold uppercase tracking-wider text-brand-300">
            Upcoming
          </span>
        )}
      </th>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">{releaseWhenLabel(entry)}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">{cards ?? "—"}</td>
      <td className="px-4 py-3 text-sm leading-relaxed text-slate-400">{entry.note}</td>
    </tr>
  );
}

export default function ReleaseDatesPage() {
  const now = new Date();
  const { released, upcoming } = splitCalendar(now);
  const next = nextDatedRelease(now);
  const latest = latestRelease(now);
  const faqs = buildFaqs(now);

  const nextLabel = next ? releaseDateLabel(next.date) : null;
  const nextInstant = next ? assumedStreetInstant(next.date) : null;
  const nextHref = next ? releaseHref(next) : null;
  const upcomingSet = new Set(upcoming);

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs trail={[{ name: "Release dates", href: "/release-dates" }]} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faqs.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
            // A real, dated, upcoming product release — the one situation where
            // Event markup is honest. There is no "drop it once the date passes"
            // branch to forget here, because `next` IS the first release still
            // ahead: the moment one ships it stops being `next` and its Event
            // stops being emitted. A past-dated Event is exactly the stale markup
            // the Vendetta page had to have removed by hand.
            ...(next && nextInstant
              ? [
                  {
                    "@context": "https://schema.org",
                    "@type": "Event",
                    name: `Riftbound: ${next.name} release`,
                    startDate: nextInstant,
                    eventStatus: "https://schema.org/EventScheduled",
                    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
                    location: { "@type": "VirtualLocation", url: `${SITE_URL}/release-dates` },
                    description: `Riftbound: ${next.name}, the next set for Riftbound: League of Legends TCG, releases on ${nextLabel}.`,
                    organizer: { "@type": "Organization", name: "Riot Games" },
                  },
                ]
              : []),
          ]),
        }}
      />

      <div className="mt-6 text-center">
        <span className="chip inline-flex bg-brand-500/15 text-[11px] font-bold uppercase tracking-wider text-brand-300">
          {next ? `Next release · ${nextLabel}` : "Riftbound release calendar"}
        </span>
        <h1 className="mt-3 font-display text-3xl font-extrabold text-white sm:text-4xl">
          {next ? `Riftbound release dates — ${next.name} on ${nextLabel}` : "Riftbound release dates"}
        </h1>

        {nextInstant && <ReleaseCountdownTimer targetIso={nextInstant} />}

        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
          {next ? (
            <>
              <strong className="text-white">{next.name}</strong> is the next Riftbound set
              {next.cards != null ? <> — {cardCountLabel(next)}</> : null}
              {next.champions?.length ? <>, with {next.champions.length} new champion Legends</> : null}.{" "}
              {SITE_NAME} will compare every card&apos;s price across every store we track from the day it lands. Every
              release Riot has announced is listed below.
            </>
          ) : (
            <>
              Every Riftbound set in release order, with the card count for each.
              {latest ? <> The current set is {latest.name}.</> : null} Nothing further is dated yet — this page updates
              the moment Riot announces the next one.
            </>
          )}
        </p>
        {nextInstant && (
          <p className="mx-auto mt-3 max-w-xl text-xs text-slate-500">
            Riot publishes the date, not the hour — the timer assumes midnight Pacific on {nextLabel}.
          </p>
        )}
      </div>

      {next && nextHref && (
        <Link
          href={nextHref}
          className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-center text-sm font-semibold text-brand-300 transition-colors hover:bg-brand-500/15"
        >
          ✨ {next.name} set page — prices land here on release →
        </Link>
      )}

      {next && (
        <div className="mx-auto mt-6 grid max-w-xl gap-2 sm:grid-cols-3">
          <div className="card-surface p-3 text-center text-sm font-semibold text-white">
            {cardCountLabel(next) ?? "Card count TBA"}
            {latest?.cards != null && (
              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                {latest.name}&apos;s is {latest.cards}
              </span>
            )}
          </div>
          <div className="card-surface p-3 text-center text-sm font-semibold text-white">
            {next.champions?.length ? `${next.champions.length} new Legends` : "Champions TBA"}
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              {next.champions?.length ? `${next.champions.slice(0, 3).join(", ")}…` : "not announced yet"}
            </span>
          </div>
          {/* Points at the pre-order comparison, not /sealed — /sealed drops
              unreleased-set listings, so it could never show one. Only rendered
              when the upcoming set actually has a pre-order page. */}
          {next.preordersHref ? (
            <Link
              href={next.preordersHref}
              className="card-surface p-3 text-center text-sm font-semibold text-white transition-colors hover:border-brand-500"
            >
              Pre-order prices
              <span className="mt-0.5 block text-xs font-normal text-slate-500">compare every store</span>
            </Link>
          ) : (
            <Link
              href="/sealed"
              className="card-surface p-3 text-center text-sm font-semibold text-white transition-colors hover:border-brand-500"
            >
              Sealed prices
              <span className="mt-0.5 block text-xs font-normal text-slate-500">compare every store</span>
            </Link>
          )}
        </div>
      )}

      <div className="mx-auto mt-8 max-w-md">
        <NewsletterSignup
          siteName={SITE_NAME}
          source="countdown"
          variant="card"
          heading={next ? `🔔 Know the moment ${next.name} prices go live` : "🔔 Know when the next set is dated"}
          cta={next ? `Email me when ${next.name} drops` : "Email me about the next set"}
          done={
            next
              ? `✓ You're set — we'll email you when ${next.name} lands.`
              : "✓ You're set — we'll email you when the next set is announced."
          }
        />
      </div>

      {/* Take the countdown elsewhere: an iframe embed for another site, and a
          calendar file for a phone or computer — a calendar app already syncs
          across every device its owner uses, which answers "have it on my
          phone AND my computer" without building a separate widget for each.
          Gated on `next` the same as the countdown itself: nothing to embed or
          add to a calendar when no release is dated. Placed right after the
          email signup rather than lower on the page — it's the same "keep me
          posted" intent as the newsletter box above it, just for people who'd
          rather have it on a device or another page than in their inbox. */}
      {next && nextInstant && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-extrabold text-white">Take this countdown with you</h2>
          <div className="card-surface grid gap-5 p-5 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold text-white">📅 Add it to your calendar</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                One tap adds {next.name}&apos;s release date to Apple Calendar, Google Calendar or Outlook — synced to
                every device you already use it on, phone and computer alike.
              </p>
              <a href="/release-dates/calendar" className="btn-primary mt-3 inline-flex text-sm">
                Add {next.name} to calendar
              </a>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">🔗 Embed it on your own site</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                A small, live, ticking countdown — drop it into a blog, a Discord-linked site, or anywhere else that
                takes an <code className="rounded bg-ink-800 px-1 py-0.5">&lt;iframe&gt;</code>. Updates itself; nothing
                to maintain.
              </p>
              <CopyPostButton
                text={`<iframe src="${SITE_URL}/embed/release-countdown" width="320" height="150" style="border:0;border-radius:14px;" loading="lazy" title="Riftbound release countdown"></iframe>`}
                label="Copy embed code"
                copiedHint="Paste it into your site's HTML."
                className="mt-3"
              />
            </div>
          </div>
        </div>
      )}

      <div className="mt-10">
        <h2 className="mb-3 text-lg font-extrabold text-white">Every Riftbound release, in order</h2>
        {/* Capped height with its own scroll, not the page's — the calendar
            only grows (six sets already, and every future one adds a row), so
            fixing this now means the page stops getting taller release after
            release instead of needing a second pass once it's unwieldy. The
            header row is sticky WITHIN that scroll so the column labels don't
            scroll away — bg-ink-900 matches card-surface's own background,
            or the sticky row would show whatever scrolls up through it. Wide
            content still scrolls sideways rather than pushing the page itself
            sideways on a phone (unchanged from before). */}
        <div className="card-surface max-h-80 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-ink-900">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th scope="col" className="px-4 py-3">Set</th>
                <th scope="col" className="px-4 py-3">Release</th>
                <th scope="col" className="px-4 py-3">Cards</th>
                <th scope="col" className="px-4 py-3">What it is</th>
              </tr>
            </thead>
            <tbody>
              {RELEASES.map((entry) => (
                <CalendarRow key={entry.name} entry={entry} released={!upcomingSet.has(entry)} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Card counts are each set&apos;s own printed base total — the denominator on every card in it — not a catalogue
          row count, so Signature, over-numbered and promo printings above that total aren&apos;t included. Dates from
          Riot&apos;s published announcements; a set marked “Date never published” released before Riot began giving
          street dates, and we list it in order rather than guessing one.
        </p>
      </div>

      {next && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-extrabold text-white">What&apos;s confirmed about {next.name}</h2>
          <div className="card-surface p-5 text-sm leading-relaxed text-slate-400">
            <p>
              <strong className="text-slate-200">{next.name}</strong> is dated for{" "}
              <strong className="text-slate-200">{nextLabel}</strong>
              {next.cards != null ? <> at {cardCountLabel(next)}</> : null}
              {next.champions?.length ? (
                <>
                  , with {next.champions.slice(0, -1).join(", ")} and {next.champions[next.champions.length - 1]} joining
                  as champion Legends
                </>
              ) : null}
              . {next.note}
            </p>
            <p className="mt-3">
              The full card list, the set&apos;s mechanics and its chase-card structure{" "}
              <strong className="text-slate-200">have not been announced</strong>. We&apos;ll list them here as Riot
              reveals them — and this page will never show a card, a price or a spoiler we can&apos;t source. For the
              buyer&apos;s-eye view of everything scheduled after it, see the{" "}
              <Link href="/blog/riftbound-2027-set-roadmap" className="text-brand-300 underline-offset-2 hover:underline">
                2027 set roadmap
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-slate-500">
          {next ? "While you wait" : "Meanwhile"}
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
        <h2 className="mb-3 text-lg font-extrabold text-white">Riftbound release date FAQ</h2>
        <div className="card-surface divide-y divide-ink-800 overflow-hidden">
          {faqs.map((f) => (
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
