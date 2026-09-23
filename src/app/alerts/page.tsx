import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AnswerBox } from "@/components/AnswerBox";
import { AlertsSignupCta } from "@/components/AlertsSignupCta";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

// Watchlists & price alerts had no page of their own. The FEATURE shipped long
// ago — PriceWatchButton on every card tile, PriceAlertModal on the card page,
// the price-alerts cron — but there was nowhere to link the words "set a price
// alert" to, so every article that wanted to mention it either linked to
// /browse (wrong) or didn't link at all. This is that destination: an
// explainer that also happens to be the landing page for "riftbound price
// alert" style queries, which nothing on the site was answering.

export const revalidate = 86400;

const CANONICAL = "/alerts";

export const metadata: Metadata = {
  title: { absolute: "Riftbound Price Alerts & Watchlists | RiftCompare" },
  description:
    "Track any Riftbound card and get emailed the moment its price drops to a new low. How RiftCompare watchlists and price alerts work, what they cost, and how to set one up.",
  alternates: pageAlternates(CANONICAL),
  keywords: [
    "riftbound price alert",
    "riftbound watchlist",
    "track riftbound card prices",
    "riftbound price drop notification",
  ],
  openGraph: pageOpenGraph({
    title: "Riftbound Price Alerts & Watchlists",
    description: "Track any Riftbound card and get emailed the moment its price drops to a new low — free, across every store we track.",
    url: CANONICAL,
  }),
};

const FAQS = [
  {
    q: "How do I set a price alert for a Riftbound card?",
    a: "Open the card's page or its quick view and tap the watch button — there's no price to enter. We remember the lowest live price at the moment you start watching, and email you the first time it drops below that.",
  },
  {
    q: "Do price alerts cost anything?",
    a: "No. Watchlists and price alerts are free and need only an account so we have somewhere to send the notification.",
  },
  {
    q: "Which price triggers the alert?",
    a: "A new low: the lowest live in-stock price across every store tracked for your market, including shipping, falling below the lowest we've ever emailed you for that card. If it stays cheap without dropping further, you'll get at most one reminder every couple of months rather than nothing at all.",
  },
  {
    q: "How often will I actually get emailed?",
    a: "At most once a week, whatever happens to prices in between. Every card you watch is still checked daily, but if you'd already had a price-drop email in the last 7 days, the next one waits and folds any further drops into it instead of sending a separate email for each. First-time watchers aren't affected — your very first alert on a card arrives as soon as it drops.",
  },
  {
    q: "How often are prices checked?",
    a: "Alerts are evaluated after each scheduled price import, so a drop is picked up on the next import rather than instantly. Riftbound reprices over days, not seconds, so that is the right resolution for buying decisions.",
  },
  {
    q: "Can I track cards I already own instead?",
    a: "Yes — that's the portfolio. A watchlist is for cards you want; the portfolio values the cards you have.",
  },
];

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Find the exact printing",
    body: (
      <>
        Search <Link href="/browse" className="text-brand-400 underline">the card database</Link> by collector
        number, not just name — a Signature and a standard print of the same champion are different cards at very
        different prices. The{" "}
        <Link href="/guides/riftbound-variant-glossary" className="text-brand-400 underline">
          variant glossary
        </Link>{" "}
        explains how to tell them apart.
      </>
    ),
  },
  {
    title: "Add it to your watchlist",
    body: <>Tap the watch button on the card tile or card page. The card joins your list with its current lowest price.</>,
  },
  {
    title: "There's no number to set",
    body: (
      <>
        We remember the lowest live price the moment you start watching — that's the baseline, not a target you
        pick. Check{" "}
        <Link href="/movers" className="text-brand-400 underline">
          the daily movers
        </Link>{" "}
        if you want to know whether now is a spike before you start.
      </>
    ),
  },
  {
    title: "Let it come to you",
    body: (
      <>
        You'll be emailed the first time the lowest live total — shipping included — drops below that baseline, and
        at most a reminder every couple of months if it stays cheap without dropping further. Emails are capped at
        once a week either way — further drops in the same week land in that digest instead of a new email. No
        refreshing, no five tabs.
      </>
    ),
  },
];

export default function AlertsPage() {
  const ld = ldJson(
    webPage({
      name: "Riftbound Price Alerts & Watchlists",
      href: CANONICAL,
      description:
        "Track any Riftbound card and get emailed the moment its price drops to a new low, across every store RiftCompare tracks.",
    }),
    faqPage(FAQS)
  );

  return (
    <div className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <Breadcrumbs trail={[{ name: "Price alerts", href: CANONICAL }]} />

      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Riftbound price alerts &amp; watchlists</h1>

      <AnswerBox>
        <p>
          A watchlist is a list of Riftbound cards you want; a price alert is an email the first time one drops to a
          new low since you started watching. Both are free — there's no price to set. The trigger is the lowest
          live in-stock price across every store we track for your market — shipping included — so an alert means
          the card is genuinely buyable at that number, not that one listing looks cheap before postage.
        </p>
      </AnswerBox>

      <h2 className="mt-8 text-xl font-extrabold text-white">How to set one up</h2>
      <ol className="mt-3 space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card-surface flex gap-3 p-4">
            <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-300">
              {i + 1}
            </span>
            <div>
              <div className="font-semibold text-white">{s.title}</div>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="mt-10 text-xl font-extrabold text-white">Watchlist, portfolio or alert?</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-ink-850">
              <th scope="col" className="border-b border-ink-700 px-3 py-2 font-semibold text-white">Feature</th>
              <th scope="col" className="border-b border-ink-700 px-3 py-2 font-semibold text-white">What it's for</th>
              <th scope="col" className="border-b border-ink-700 px-3 py-2 font-semibold text-white">Where</th>
            </tr>
          </thead>
          <tbody>
            <tr className="odd:bg-ink-900/40">
              <td className="border-b border-ink-800 px-3 py-2 font-semibold text-white">Watchlist</td>
              <td className="border-b border-ink-800 px-3 py-2 text-slate-300">Cards you want to buy</td>
              <td className="border-b border-ink-800 px-3 py-2">
                <Link href="/browse" className="text-brand-400 underline">Any card tile</Link>
              </td>
            </tr>
            <tr className="odd:bg-ink-900/40">
              <td className="border-b border-ink-800 px-3 py-2 font-semibold text-white">Price alert</td>
              <td className="border-b border-ink-800 px-3 py-2 text-slate-300">Being emailed when one hits a new low</td>
              <td className="border-b border-ink-800 px-3 py-2 text-slate-300">The watch button — no price to set</td>
            </tr>
            <tr className="odd:bg-ink-900/40">
              <td className="border-b border-ink-800 px-3 py-2 font-semibold text-white">Portfolio</td>
              <td className="border-b border-ink-800 px-3 py-2 text-slate-300">Valuing the cards you already own</td>
              <td className="border-b border-ink-800 px-3 py-2">
                <Link href="/portfolio" className="text-brand-400 underline">/portfolio</Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-extrabold text-white">Frequently asked questions</h2>
      <div className="mt-3 divide-y divide-ink-800 rounded-xl border border-ink-700">
        {FAQS.map((f) => (
          <details key={f.q} className="group">
            <summary className="flex cursor-pointer list-none gap-2 p-4 font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="flex-none self-start text-brand-400 transition-transform group-open:rotate-90" aria-hidden>
                ›
              </span>
              {f.q}
            </summary>
            <p className="px-4 pb-4 pl-9 text-sm leading-relaxed text-slate-300">{f.a}</p>
          </details>
        ))}
      </div>

      <section className="card-surface mt-10 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-bold text-white">Start watching a card</h2>
          <p className="mt-1 text-sm text-slate-400">
            Search the database, tap watch — no price to set. Or see{" "}
            <Link href="/movers" className="text-brand-400 underline">what&apos;s moving today</Link> first.
          </p>
        </div>
        {/* Primary CTA = the account (this page explains the account feature);
            browsing stays one click away as the secondary route. min-w-0, not
            shrink-0 (2026-09-23): shrink-0 held the group at its one-line
            max-content width, so its own flex-wrap never engaged and the page
            was 425px wide on every phone with "Card database →" half
            off-screen. Now the group shrinks to the section and the buttons
            stack; at 1440 the parent's flex-wrap never forces a shrink. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <AlertsSignupCta />
          <Link href="/browse" className="btn-ghost">Card database →</Link>
        </div>
      </section>
    </div>
  );
}
