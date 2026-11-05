import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, tierMonthlyAmount } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { HubFaq } from "@/components/HubFaq";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CreatorCodeApplyForm } from "@/components/creators/CreatorCodeApplyForm";
import { AFFILIATE_COMMISSION_PERCENT, AFFILIATE_PERCENT_OFF, discountedAmount } from "@/lib/creator-affiliate-code";

// /creators/apply: the creator code programme (2026-10-16, owner: "Create a
// affiliate application page so that Riftbound creators can apply to RiftCompare
// for a code that they can share to their audience… 20% off… 20% commission").
// DECISIONS.md, "Creator codes: 20% off, 20% commission". Static: the form posts
// to /api/creator-codes/apply, and nothing here reads the database.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Riftbound Creator Codes: Earn 20% With RiftCompare",
  description: `Make Riftbound content? Get your own RiftCompare code. Your audience gets ${AFFILIATE_PERCENT_OFF}% off Premium, and you earn ${AFFILIATE_COMMISSION_PERCENT}% of every payment they make.`,
  alternates: pageAlternates("/creators/apply"),
  openGraph: pageOpenGraph({
    title: "Riftbound creator codes on RiftCompare",
    description: `Your audience gets ${AFFILIATE_PERCENT_OFF}% off Premium. You earn ${AFFILIATE_COMMISSION_PERCENT}% of every payment.`,
    url: "/creators/apply",
  }),
};

const FAQS = [
  {
    q: "What does my audience get?",
    a: `${AFFILIATE_PERCENT_OFF}% off RiftCompare Premium, on every payment for as long as they stay subscribed. It works on monthly and annual plans.`,
  },
  {
    q: "What do I earn?",
    a: `${AFFILIATE_COMMISSION_PERCENT}% of every payment a subscriber makes with your code, for as long as they stay subscribed. We record every payment made with your code, so you can see exactly what you have earned, and we agree how you are paid when we send your code.`,
  },
  {
    q: "How do people use my code?",
    a: "Share your link, riftcompare.com/r/YOURCODE: it remembers your code for 30 days and applies it at checkout. People can also type the code on the Premium page or on the checkout page.",
  },
  {
    q: "Who can apply?",
    a: "Anyone who makes Riftbound content: videos, streams, shorts, articles, a Discord community. There is no follower minimum; we look for real Riftbound content and an audience that would find price comparison useful.",
  },
  {
    q: "Can I choose my code?",
    a: "Yes. Suggest one on the form (3 to 20 letters or numbers, usually your creator name). If it is taken we will suggest the closest one.",
  },
];

export default function CreatorCodesPage() {
  const premium = tierMonthlyAmount("premium");
  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs trail={[{ name: "Creators", href: "/creators" }, { name: "Creator codes", href: "/creators/apply" }]} />

      <section className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-gold">For Riftbound creators</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">Get your own RiftCompare code</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
          Your audience gets <strong className="text-white">{AFFILIATE_PERCENT_OFF}% off</strong> Premium. You earn{" "}
          <strong className="text-white">{AFFILIATE_COMMISSION_PERCENT}% of every payment</strong> they make, for as long as they stay subscribed.
        </p>
        <Link href="#apply" className="btn-primary mt-5 inline-flex min-h-11 items-center px-6">
          Apply for a code →
        </Link>
      </section>

      <section className="mt-10 grid gap-3 sm:grid-cols-3" aria-label="How it works">
        {[
          ["1", "Apply", "Tell us about your channel and the code you'd like. A real person reviews every application."],
          ["2", "Share your code", "We email your code and your link, riftcompare.com/r/YOURCODE. Put it in descriptions, overlays and pinned comments."],
          ["3", "Earn every month", `Each payment made with your code earns you ${AFFILIATE_COMMISSION_PERCENT}%. We record every one against your code.`],
        ].map(([n, title, body]) => (
          <div key={n} className="card-surface rounded-2xl border border-ink-700 p-4">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-500/15 text-sm font-black text-brand-400">{n}</span>
            <h2 className="mt-3 text-base font-extrabold text-white">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{body}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-gold/30 bg-gold/[0.06] p-4 text-sm text-slate-300 sm:p-5">
        <h2 className="text-base font-extrabold text-white">What your code is worth to your viewers</h2>
        <p className="mt-1 leading-relaxed">
          Premium is {premium} a month; with your code it is {discountedAmount(premium)}. They get every deal, price and stock alerts,
          the store-by-store plan for their whole list, and no ads. See{" "}
          <Link href="/premium" className="text-gold hover:underline">
            what Premium includes
          </Link>
          .
        </p>
      </section>

      <section id="apply" className="mt-10 scroll-mt-header rounded-3xl border border-brand-500/25 bg-gradient-to-br from-brand-500/10 via-ink-900 to-ink-900 p-6 sm:p-8">
        <h2 className="text-2xl font-extrabold text-white">Apply for your code</h2>
        <p className="mt-1 text-sm text-slate-400">
          We reply by email, usually within a couple of days. Questions?{" "}
          <a href={`mailto:${CONTACT_EMAIL}?subject=Creator%20code`} className="text-gold hover:underline">
            {CONTACT_EMAIL}
          </a>
        </p>
        <div className="mt-5">
          <CreatorCodeApplyForm />
        </div>
      </section>

      <HubFaq faqs={FAQS} heading={`${SITE_NAME} creator codes: FAQ`} className="mt-10" />

      <p className="mt-6 text-center text-xs text-slate-500">
        Want to be listed on our <Link href="/creators" className="hover:underline">creators page</Link> too? That is free and separate.
      </p>
    </div>
  );
}
