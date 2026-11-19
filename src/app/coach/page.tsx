import type { Metadata } from "next";
import Link from "next/link";
import { CoachForm } from "@/components/coach/CoachForm";
import { COACH_CAP, COACH_FOUNDER_PRICE, COACH_PRICE } from "@/lib/coach";

// Deck Coach: a two-week concierge test (lib/coach.ts, DECISIONS.md "Deck Coach test",
// 2026-11-19). Hidden on purpose: noindex, out of the sitemap, linked from no menu.
// Static; nothing on it reads the request or the database.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Deck Coach (free test): get your Riftbound deck reviewed",
  description: "Paste your Riftbound deck, your budget and your next event. We send back the upgrades worth buying, priced at the cheapest store.",
  robots: { index: false, follow: false },
};

// The Radiance ban list, effective 23 Nov 2026 (playriftbound.com announcement, 13 Nov 2026).
const BANNED: [string, string][] = [
  ["Riven, Broken Blade", "riven-broken-blade-rad-043-167"],
  ["Zhonya's Hourglass", "zhonya-s-hourglass-ogn-077-298"],
  ["Stellacorn Herder", "stellacorn-herder-sfd-048-221"],
  ["Nocturne, Horrifying", "nocturne-horrifying-ogn-194-298"],
  ["Rhasa the Sunderer", "rhasa-the-sunderer-ogn-195-298"],
  ["Brynhir Thundersong", "brynhir-thundersong-ogn-026-298"],
  ["Dazzling Aurora", "dazzling-aurora-ogn-160-298"],
  ["Baited Hook", "baited-hook-ogn-242-298"],
  ["Emperor's Dais (battlefield)", "emperor-s-dais-sfd-207-221"],
  ["Star Spring (battlefield)", "star-spring-unl-215-219"],
];

const YOU_GET = [
  ["Ban check", "Anything in your list that stops being legal on 23 Nov, and what replaces it."],
  ["3 upgrades worth buying", "The swaps that change the most games, each priced at the cheapest store we track in your market."],
  ["Your bad matchups", "The decks your list struggles against right now, and what to side in."],
  ["A version under your budget", "Keeps the deck's plan, drops the cards you don't need."],
];

export default function CoachPage() {
  return (
    <div className="mx-auto max-w-2xl px-1">
      <div className="mb-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gold">
          Free during the test · first {COACH_CAP} decks
        </span>
        <h1 className="mt-3 text-2xl font-extrabold text-white sm:text-3xl">Get your Riftbound deck reviewed</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-400">
          Paste your deck, tell us your budget and your next event. Within two days you get a short report by email:
          what to upgrade, what it costs at the cheapest store, and what beats you.
        </p>
      </div>

      <div className="card-surface mb-5 p-5">
        <h2 className="mb-3 text-base font-bold text-white">What the report covers</h2>
        <ul className="space-y-2 text-sm text-slate-300">
          {YOU_GET.map(([t, d]) => (
            <li key={t}>
              <strong className="text-white">{t}.</strong> {d}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Written by the RiftCompare team with AI help, and checked against our live store prices. Prices are never made up:
          every card we suggest links to its price page.
        </p>
      </div>

      <CoachForm />

      <div className="card-surface mt-5 p-5">
        <h2 className="mb-2 text-base font-bold text-white">The 23 November bans</h2>
        <p className="mb-3 text-sm text-slate-400">
          From 23 Nov these are banned in Standard and 2v2 Constructed. If your deck runs any of them, send it in and we&apos;ll
          suggest the replacements.
        </p>
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
          {BANNED.map(([name, slug]) => (
            <li key={slug}>
              <Link href={`/card/${slug}`} prefetch={false} className="text-brand-400 hover:underline">
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-5 text-center text-xs text-slate-500">
        We&apos;re testing whether players want this as a paid tool ({COACH_PRICE} a month, {COACH_FOUNDER_PRICE} for founders). Nothing
        is charged now, and your deck is never published.
      </p>
    </div>
  );
}
