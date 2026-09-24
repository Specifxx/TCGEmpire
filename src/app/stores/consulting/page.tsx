import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SITE_URL, SITE_NAME, CONTACT_EMAIL } from "@/lib/site";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NavIcon, type NavIconName } from "@/components/NavIcon";
import { ConsultBookingForm } from "@/components/ConsultBookingForm";
import { RETAILER_LIST } from "@/lib/retailers";
import { COUNTRY_LIST } from "@/lib/country";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { formatMoney } from "@/lib/format";
import {
  CONSULT_PRICE_CENTS,
  CONSULT_CURRENCY,
  CONSULT_CURRENCY_DISPLAY,
  CONSULT_DURATION_MIN,
  CONSULT_REPLY_HOURS,
} from "@/lib/consulting";

// Same hourly cadence as /stores: the only server data here is two counts that
// move once a day at most, so there is no reason for a per-request render.
export const revalidate = 3600;

const CANONICAL = "/stores/consulting";
const PRICE_LABEL = formatMoney(CONSULT_PRICE_CENTS, CONSULT_CURRENCY_DISPLAY);

export const metadata: Metadata = {
  title: { absolute: `Riftbound Pricing Consulting for Stores — ${SITE_NAME}` },
  description: `A ${CONSULT_DURATION_MIN}-minute one-to-one session on where your store actually sits in the Riftbound market: what you're priced wrong on, what to stock, and what the demand data says. ${PRICE_LABEL} ${CONSULT_CURRENCY_DISPLAY}, invoice included.`,
  alternates: pageAlternates(CANONICAL),
  keywords: [
    "riftbound store pricing",
    "tcg store consulting",
    "card shop pricing strategy",
    "riftbound wholesale pricing",
  ],
  openGraph: pageOpenGraph({
    title: `Riftbound pricing consulting for stores — ${SITE_NAME}`,
    description: `One hour, one-to-one, on where your store sits in the Riftbound market. ${PRICE_LABEL} ${CONSULT_CURRENCY_DISPLAY}.`,
    url: CANONICAL,
  }),
};

// What the hour actually covers. Every line here is something the data this
// site already collects can genuinely answer — nothing is aspirational, because
// a store that turns up expecting the fourth bullet and doesn't get it is a
// refund and a bad word in a small industry.
const AGENDA: { icon: NavIconName; title: string; body: string }[] = [
  {
    icon: "chart",
    title: "Where your prices actually sit",
    body: "Your live listings against every other tracked store in your market, card by card: what you're beaten on, by how much, and what you're leaving on the table by being far cheaper than you need to be.",
  },
  {
    icon: "deals",
    title: "What's worth stocking next",
    body: "What people search for and open on RiftCompare that nobody in your market stocks well — demand we can see and you currently can't.",
  },
  {
    icon: "prices",
    title: "How to price the stuff that doesn't move",
    body: "The dead stock question, answered against real market data: which slow sellers are priced wrong, and which ones the whole market is slow on so it isn't you.",
  },
  {
    icon: "collection",
    title: "Sealed, singles, or both",
    body: "Where your margin actually is across sealed product and singles for the sets currently in print, and what the price history says about holding versus moving it now.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Who am I actually talking to?",
    a: `The person who built and runs ${SITE_NAME}. Not a sales team, not an account manager — one call, one person, with the same data the site runs on open in front of both of us.`,
  },
  {
    q: "Do I get an invoice?",
    a: `Yes. Payment goes through Stripe and a numbered tax invoice is generated automatically — you'll get a link to download the PDF in your confirmation email. You can enter your ABN, GST or VAT number during checkout and it prints on the invoice.`,
  },
  {
    q: "What if it isn't useful?",
    a: `If you're 15 minutes in and it isn't worth your time, say so on the call and we'll refund the whole thing, no argument. This is a new service and a bad session is worth less to us than the refund.`,
  },
  {
    q: "Do I need to send you my inventory?",
    a: `No. If we already track your store, your live listings are in the comparison and we'll pull them before the call. If we don't track you yet, tell us during booking and we'll look at adding your store first — that part is free.`,
  },
  {
    q: "Is this the same as the free repricing report?",
    a: `No — the report is a live page that shows you the gaps. The session is an hour of working through what to do about them, plus the demand and sealed data that isn't in the report at all. If you only want the report, take the free one; it's genuinely free.`,
  },
  {
    q: "Will you tell my competitors what I'm doing?",
    a: `Never. The comparison only ever shows the public prices anyone can already see on your website. Nothing you say on a call goes anywhere, and we don't change how any store ranks in the comparison for money — that neutrality is the only reason the site is worth anything to shoppers.`,
  },
];

export default async function StoreConsultingPage() {
  // Same trusted key set /stores counts against, so the two pages can never
  // quote different sizes for the same comparison.
  const validRetailerKeys = RETAILER_LIST.map((r) => r.key);
  const [listings, stores] = await Promise.all([
    prisma.retailerPrice
      .count({ where: { inStock: true, retailer: { in: validRetailerKeys } } })
      .catch(() => 0),
    Promise.resolve(RETAILER_LIST.length),
  ]);

  const ld = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${SITE_NAME} store consulting`,
    serviceType: "Retail pricing consultation",
    description: `A ${CONSULT_DURATION_MIN}-minute one-to-one pricing and stocking consultation for stores selling Riftbound, using live market comparison data.`,
    provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    areaServed: COUNTRY_LIST.map((c) => c.label),
    offers: {
      "@type": "Offer",
      price: (CONSULT_PRICE_CENTS / 100).toFixed(2),
      priceCurrency: CONSULT_CURRENCY.toUpperCase(),
      url: `${SITE_URL}${CANONICAL}`,
      availability: "https://schema.org/InStock",
    },
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs
        trail={[
          { name: "Stores", href: "/stores" },
          { name: "Consulting", href: CANONICAL },
        ]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([ld, faqLd]) }} />

      {/* Hero */}
      <div className="card-surface overflow-hidden">
        <div className="bg-gradient-to-br from-brand-600/25 via-ink-850 to-gold/15 px-6 py-10 text-center">
          <span className="chip mb-3 inline-flex bg-gold/15 font-bold uppercase tracking-wide text-gold">
            For stores · paid
          </span>
          <h1 className="mx-auto max-w-xl font-display text-3xl font-extrabold text-white">
            An hour on where your store actually sits in the Riftbound market
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
            We compare {listings.toLocaleString()} live listings across {stores} stores every day and send
            shoppers to the cheapest one. Book a session and we&apos;ll point all of that at your shop:
            what you&apos;re priced wrong on, what you should be stocking, and what the demand data says —
            with the numbers on screen, not a slide deck.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <a href="#book" className="btn-primary">
              Book a session — {PRICE_LABEL} →
            </a>
            <span className="text-xs text-slate-400">
              {CONSULT_DURATION_MIN} minutes · {CONSULT_CURRENCY_DISPLAY} · tax invoice included
            </span>
          </div>
        </div>
      </div>

      {/* What the hour covers */}
      <h2 className="mb-3 mt-8 text-lg font-extrabold text-white">What we cover</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {AGENDA.map((a) => (
          <div key={a.title} className="card-surface p-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-brand-400">
              <NavIcon name={a.icon} className="h-5 w-5" />
            </span>
            <h3 className="mt-2 text-sm font-bold text-white">{a.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{a.body}</p>
          </div>
        ))}
      </div>

      {/* Honesty block — what this is not. */}
      <div className="card-surface mt-6 border-l-2 border-ink-600 p-5">
        <h2 className="font-bold text-white">What this isn&apos;t</h2>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-400">
          <li>
            <span className="font-semibold text-slate-200">Not a promised uplift.</span> Nobody can honestly
            predict what repricing does to your sales, and a consultant who quotes you a number is selling
            you something else.
          </li>
          <li>
            <span className="font-semibold text-slate-200">Not paid placement.</span> Booking a session
            changes nothing about how your store ranks in the public comparison. Ever.
          </li>
          <li>
            <span className="font-semibold text-slate-200">Not a subscription.</span> One session, one
            payment. Book another when it&apos;s useful, not on a renewal date.
          </li>
        </ul>
      </div>

      {/* How it runs */}
      <div className="card-surface mt-6 p-5">
        <h2 className="font-bold text-white">How it runs</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-400">
          <li>Book and pay below — Stripe, card, about a minute.</li>
          <li>
            We email you within {CONSULT_REPLY_HOURS} hours with times, and pull your store&apos;s live
            position before we talk. Nothing for you to prepare.
          </li>
          <li>
            The call: {CONSULT_DURATION_MIN} minutes, video, screen shared. Bring whatever you&apos;re stuck
            on.
          </li>
          <li>
            Afterwards you keep the working notes, and your private repricing report stays live at{" "}
            <Link href="/stores/report" className="text-brand-400 hover:underline">
              /stores/report
            </Link>
            .
          </li>
        </ol>
      </div>

      {/* The form. The #book anchor sits on this card, not the <form>, with the
          header-aware scroll margin (2026-09-23): on the form it landed the
          heading, the price line and the first field row under the sticky
          header at every width. */}
      <div id="book" className="card-surface mt-6 scroll-mt-header p-5 sm:p-6">
        <h2 className="text-lg font-extrabold text-white">Book your session</h2>
        <p className="mb-4 mt-1 text-sm text-slate-400">
          {PRICE_LABEL} {CONSULT_CURRENCY_DISPLAY}, paid up front. No account needed.
        </p>
        <ConsultBookingForm priceLabel={PRICE_LABEL} />
      </div>

      {/* FAQ */}
      <h2 className="mb-3 mt-8 text-lg font-extrabold text-white">Questions stores actually ask</h2>
      <div className="divide-y divide-ink-800 rounded-xl border border-ink-700">
        {FAQ.map((f) => (
          <details key={f.q} className="group">
            <summary className="flex cursor-pointer list-none gap-2 p-4 font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
              <span
                className="flex-none self-start text-brand-400 transition-transform duration-base group-open:rotate-90"
                aria-hidden
              >
                ›
              </span>
              {f.q}
            </summary>
            <p className="px-4 pb-4 pl-9 text-sm leading-relaxed text-slate-300">{f.a}</p>
          </details>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-slate-500">
        Not ready to book?{" "}
        <Link href="/stores" className="text-brand-400 hover:underline">
          The free repricing report
        </Link>{" "}
        is still the best place to start — or just email{" "}
        <a href={`mailto:${CONTACT_EMAIL}?subject=Store%20consulting`} className="text-brand-400 hover:underline">
          {CONTACT_EMAIL}
        </a>{" "}
        and ask.
      </p>
    </div>
  );
}
