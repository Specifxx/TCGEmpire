import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setBySlug } from "@/lib/constants";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubFaq } from "@/components/HubFaq";
import { PullTracker } from "@/components/PullTracker";
import { getPullSetCards } from "@/lib/pull-tracker-server";
import { getRadianceBoxPrices } from "@/lib/radiance-cta";
import { isPullSet, PULL_SET_SLUGS } from "@/lib/pull-tracker";
import { faqPage, ldJson } from "@/lib/jsonld";

// /tools/pull-tracker/<set> (2026-10-16 growth pass; DECISIONS.md, "Growth:
// meet readers where they are"). Release week is when everyone opens boxes;
// this turns "what did I pull?" into a saved binder and a link worth sharing.
// One cached read of the set's cards (lib/pull-tracker-server.ts) and, for
// Radiance, the box price to pre-fill what was paid. No static prewarming.
export const revalidate = 21600;

export function generateMetadata({ params }: { params: { set: string } }): Metadata {
  const set = setBySlug(params.set);
  if (!set || !isPullSet(set.slug)) return {};
  const title = `${set.name} Pull Tracker: What Is Your Riftbound Box Worth?`;
  const description = `Log what you pulled from a Riftbound ${set.name} booster box or pack and see what it is worth at today's store prices, against what you paid. Free, no sign-up to use.`;
  return {
    title,
    description,
    alternates: pageAlternates(`/tools/pull-tracker/${set.slug}`),
    openGraph: pageOpenGraph({ title, description, url: `/tools/pull-tracker/${set.slug}` }),
  };
}

export default async function PullTrackerPage({ params }: { params: { set: string } }) {
  const set = setBySlug(params.set);
  if (!set || !isPullSet(set.slug)) notFound();
  const [cards, boxPrices] = await Promise.all([getPullSetCards(set.code), set.code === "RAD" ? getRadianceBoxPrices() : Promise.resolve({})]);

  const faqs = [
    {
      q: `How is my ${set.name} box valued?`,
      a: "Each card you log counts at the cheapest in-stock store price in your country, from the stores RiftCompare compares, refreshed twice a day. That is what the card would cost you to buy today. A store buying it from you would pay less, so treat the total as what your pulls would cost to replace.",
    },
    {
      q: "Do I need an account?",
      a: "No. The tracker works without one and remembers your pulls in this browser. A free account lets you save them to your binder, which tracks what your collection is worth as prices move.",
    },
    {
      q: "What does sharing my pulls show?",
      a: "A link with the cards you logged, their value and what you paid, if you entered it. It carries nothing about your account, and anyone who opens it can log their own box.",
    },
    {
      q: "Why do some cards say no price yet?",
      a: `No store we track has that card in stock in your country right now${set.comingSoon ? `, which is usual before ${set.name} singles go on sale` : ""}. It counts as nothing until one does.`,
    },
  ];

  return (
    <div className="container-app space-y-6 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(faqPage(faqs)) }} />
      <Breadcrumbs
        trail={[
          { name: "Tools", href: "/tools" },
          { name: `${set.name} pull tracker`, href: `/tools/pull-tracker/${set.slug}` },
        ]}
      />
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">Free tool</p>
        <h1 className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">What did your {set.name} box pull?</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Tap the cards you pulled and see what they are worth at today&apos;s store prices, against what you paid for the box or packs. Save them to your binder, or
          share the result.
        </p>
        <nav aria-label="Other sets" className="mt-3 flex flex-wrap gap-1.5">
          {PULL_SET_SLUGS.map((s) => {
            const other = setBySlug(s);
            if (!other) return null;
            const on = s === set.slug;
            return (
              <Link
                key={s}
                href={`/tools/pull-tracker/${s}`}
                aria-current={on ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${on ? "bg-gold/15 text-gold ring-gold/40" : "bg-ink-800 text-slate-300 ring-white/10 hover:bg-ink-700"}`}
              >
                {other.name}
              </Link>
            );
          })}
        </nav>
      </header>

      {cards.length ? (
        <PullTracker set={{ slug: set.slug, code: set.code, name: set.name }} cards={cards} boxPriceCents={boxPrices} />
      ) : (
        <p className="card-surface p-6 text-sm text-slate-400">The {set.name} card list is loading into the catalogue; check back shortly.</p>
      )}

      <section className="card-surface p-5 text-sm leading-relaxed text-slate-300">
        <h2 className="text-base font-extrabold text-white">Was it worth opening?</h2>
        <p className="mt-2">
          A booster box is a bet: most of its value sits in a few cards, so two boxes of the same set can be worth wildly different amounts. Logging your own pulls is
          the honest way to see how yours did. For the odds before you open, the{" "}
          <Link href="/tools/box-ev" className="text-brand-300 underline-offset-2 hover:underline">
            box expected value calculator
          </Link>{" "}
          works out what a box of each set returns on average at today&apos;s prices. If you would rather buy the cards you want than chase them,{" "}
          <Link href={`/sets/${set.slug}`} className="text-brand-300 underline-offset-2 hover:underline">
            every {set.name} single is compared across stores here
          </Link>
          .
        </p>
      </section>

      <HubFaq faqs={faqs} />
    </div>
  );
}
