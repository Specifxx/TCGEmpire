import type { Metadata } from "next";
import Link from "next/link";
import { SETS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { PackSim } from "@/components/games/PackSim";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubFaq } from "@/components/HubFaq";
import { faqPage } from "@/lib/jsonld";
import {
  PACK_SLOTS,
  PULL_RATES,
  PACK_SOURCE,
  CARDS_PER_PACK,
  PACKS_PER_BOX,
  FOIL_UPGRADE_CHANCE,
} from "@/lib/pack-composition";

// ~157 chars — long enough to say what it is and what makes it different, short
// enough that Google renders all of it.
const DESC =
  "Open Riftbound booster packs online, free. Real cards, Riot's real 14-card pack structure and published odds, with a live price on every card you pull.";

// Shared pull links carry ?v=<value> so they unfurl with a custom OG card
// ("I pulled $X"), pulling friends in to rip their own. Plain link is unchanged.
export function generateMetadata({ searchParams }: { searchParams?: { v?: string } }): Metadata {
  const base: Metadata = {
    // 53 chars with the " — RiftCompare" template suffix; the previous one
    // rendered at 71 and was truncated in the SERP.
    title: "Riftbound Pack Opening Simulator — Free",
    description: DESC,
    keywords: [
      "Riftbound pack simulator",
      "Riftbound pack opening simulator",
      "open Riftbound packs free",
      "Riftbound booster pack simulator",
      "Vendetta pack opening",
      "Riftbound pull rates",
    ],
    alternates: pageAlternates("/games/pack-sim"),
    openGraph: pageOpenGraph({
      title: "Riftbound Pack Opening Simulator | RiftCompare",
      description: "Rip free virtual Riftbound packs built from real cards, real pack odds and live prices.",
      url: `${SITE_URL}/games/pack-sim`,
    }),
  };
  const v = typeof searchParams?.v === "string" ? searchParams.v.slice(0, 14) : null;
  if (!v) return base;

  const sub = "I ripped a Riftbound pack on RiftCompare — rip yours free";
  const img = `${SITE_URL}/api/og?t=${encodeURIComponent("PACK PULL")}&s=${encodeURIComponent(v)}&l=${encodeURIComponent(
    "of cards"
  )}&b=${encodeURIComponent(sub)}&c=${encodeURIComponent("#f5a524")}`;
  return {
    ...base,
    openGraph: { ...base.openGraph, title: `I pulled ${v} of Riftbound cards`, description: sub, images: [{ url: img, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: `I pulled ${v}`, description: sub, images: [img] },
  };
}

// The questions people actually type, answered in the server HTML. Doubles as
// the FAQPage node — one source, so the visible copy and the markup cannot drift.
const FAQS = [
  {
    q: "How many cards are in a Riftbound booster pack?",
    a: `${CARDS_PER_PACK}: seven commons, three uncommons, two rare-or-better slots, one dedicated foil slot and one token/rune slot, plus an informational insert. That breakdown is Riot's own, from the Riftbound design team's collectability post, and it matches the "14 cards" printed on retail booster displays.`,
  },
  {
    q: "What are the Riftbound pull rates?",
    a: "Riot has published four: Epics appear in roughly 1 in 4 packs, alternate arts about 2 per box, over-numbered cards about 1 per 3 boxes, and a signature over-number about 1 in 10 over-numbers — roughly 1 per 30 boxes. Rares and Epics are always foil, and the separate foil slot is usually a common or uncommon but can upgrade.",
  },
  {
    q: "Is this pack simulator accurate?",
    a: "The slot structure and the published rates are Riot's, and the cards are drawn from the real card pool for the set you pick — no invented cards. Two details are ours and are labelled as such on this page: how the two rare-or-better slots split between Rare and Epic, and how often the foil slot upgrades. Riot has never published either.",
  },
  {
    q: "Does opening a virtual pack cost anything?",
    a: "No. It is free, needs no account, and nothing is bought or sold. It is a simulation of a pack, not a pack — you cannot keep or trade what you pull.",
  },
  {
    q: "Which Riftbound sets can I open?",
    a: `Every released set we have catalogued — ${SETS.filter((s) => !s.comingSoon).map((s) => s.name).join(", ")}. The simulator opens the most recent set by default, since that is the one on shelves.`,
  },
  {
    q: "Are the prices on the pulled cards real?",
    a: "Yes. Every card is priced at the cheapest live listing we track in your market, the same figure its card page shows. That is what makes the pack total meaningful rather than decorative — it is what those cards would actually cost you to buy.",
  },
  {
    q: "Is opening real Riftbound booster boxes worth it?",
    a: "Usually not, if your goal is specific cards: the expected value of a box is normally below its price, which is why singles exist. Our box EV calculator prices a full box against every card in it so you can check the maths for the set you are looking at.",
  },
];

export default function PackSimPage() {
  // NEWEST RELEASED SET FIRST — the picker's first entry is the simulator's
  // default, and SETS is in release order, so the default used to be Origins:
  // the set from a year ago. Whoever arrives here wants to rip the pack that is
  // on shelves now (Vendetta today, Radiance from 23 Oct 2026), and this follows
  // the calendar rather than needing an edit each launch.
  const released = SETS.filter((s) => !s.comingSoon)
    .slice()
    .sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? ""));
  const sets = released.map((s) => ({ code: s.code, name: s.name }));
  const current = released[0];

  // NO BreadcrumbList here on purpose: <Breadcrumbs> below emits one already,
  // from the same trail it renders. Adding a second described the same hierarchy
  // twice in one document.
  //
  // WebApplication, matching /tools/box-ev — this is a free browser tool, not a
  // VideoGame (no scoring, no play session) and not a SoftwareApplication to
  // install. Same shape as the box-EV node so the two agree.
  const appLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Riftbound Pack Opening Simulator",
    url: `${SITE_URL}/games/pack-sim`,
    applicationCategory: "GameApplication",
    operatingSystem: "Web",
    browserRequirements: "Requires JavaScript",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description: DESC,
    featureList: [
      `Deals Riot's real ${CARDS_PER_PACK}-card pack structure`,
      "Draws from the real card pool of every released set",
      "Live market price on every card pulled",
      "Published pull rates, with the source cited",
    ],
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([appLd, faqPage(FAQS)].filter(Boolean)) }}
      />
      <Breadcrumbs trail={[{ name: "Games", href: "/games" }, { name: "Pack Opening Simulator", href: "/games/pack-sim" }]} />

      {/* The H1 and the paragraph under it are the only copy a crawler sees
          before the (client-rendered) simulator, so they carry the query and the
          answer rather than a bare tool name. */}
      <div className="mx-auto mb-6 max-w-2xl text-center">
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">
          Riftbound Pack Opening Simulator
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Rip free virtual Riftbound booster packs — no account, no money, no limit. Each pack is dealt
          to Riot&apos;s real {CARDS_PER_PACK}-card structure from the actual card pool of the set you
          pick, and every card you pull carries its live market price, so the total at the end is what
          that pack would genuinely have been worth.
          {current && (
            <>
              {" "}
              Defaults to <strong className="text-slate-200">{current.name}</strong>, the current set.
            </>
          )}
        </p>
      </div>

      <PackSim sets={sets} />

      {/* ── The content half of the page ────────────────────────────────────
          A simulator is a client-side toy; a crawler sees an empty div. What
          makes this page rank is below: the pack structure and the pull rates,
          sourced and laid out, which is also the thing people link to. */}
      <div className="mx-auto mt-10 max-w-2xl">
        <section>
          <h2 className="text-xl font-extrabold text-white">What&apos;s actually in a Riftbound booster pack?</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {CARDS_PER_PACK} cards, in five kinds of slot. This is Riot&apos;s own breakdown, not a
            community estimate — and it is what this simulator deals.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-3 font-semibold">Slot</th>
                  <th className="pb-2 pr-3 font-semibold">Per pack</th>
                  <th className="pb-2 font-semibold">What comes out of it</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {PACK_SLOTS.map((s) => (
                  <tr key={s.key}>
                    <td className="py-2 pr-3 font-semibold text-white">{s.label}</td>
                    <td className="num py-2 pr-3 text-slate-300">{s.count}</td>
                    <td className="py-2 text-slate-400">{s.note}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 pr-3 font-bold text-white">Total</td>
                  <td className="num py-2 pr-3 font-bold text-white">{CARDS_PER_PACK}</td>
                  <td className="py-2 text-slate-500">Plus an informational insert.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-white">Riftbound pull rates</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Riot has published four rates. Everything else you will read about Riftbound odds is
            community observation — useful, but not the same thing, so it is not on this table.
            A box is {PACKS_PER_BOX} packs, which is how the per-box figures convert.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-3 font-semibold">Card</th>
                  <th className="pb-2 pr-3 font-semibold">How often</th>
                  <th className="pb-2 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {PULL_RATES.map((r) => (
                  <tr key={r.key}>
                    <td className="py-2 pr-3 font-semibold text-white">{r.label}</td>
                    <td className="num whitespace-nowrap py-2 pr-3 text-slate-300">{r.frequency}</td>
                    <td className="py-2 text-slate-400">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Source:{" "}
            <a
              href={PACK_SOURCE.url}
              rel="nofollow noopener"
              target="_blank"
              className="text-brand-400 hover:underline"
            >
              &ldquo;{PACK_SOURCE.title}&rdquo;
            </a>{" "}
            — {PACK_SOURCE.author}, {new Date(`${PACK_SOURCE.published}T00:00:00Z`).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
            . Riot documented Origins specifically and has not published a per-set breakdown since;
            retail packaging for the later sets still states 14 cards a pack, which is the only
            corroboration we have and is why the structure above is presented as Origins&apos;.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-white">How this simulator deals a pack</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            The slots above, filled from the real card pool of the set you picked — base printings
            only, no promos, and no card appears twice in one pack. Every card is then priced at the
            cheapest live listing we track in your market, the same number its{" "}
            <Link href="/browse" className="text-brand-400 hover:underline">card page</Link> shows.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            <strong className="text-slate-200">Two things here are ours, not Riot&apos;s</strong>, and we
            would rather say so than let a simulation pass as a spec. Riot states that Epics land in
            about 1 in 4 packs and replace a card in the rare slot, but not how the two rare-or-better
            slots divide — we upgrade each slot independently at half the stated rate, which
            reproduces the overall figure while keeping the double-Epic pack Riot says is possible.
            And Riot says the foil slot is &ldquo;most of the time&rdquo; a common or uncommon without
            giving a number; we upgrade it {Math.round(FOIL_UPGRADE_CHANCE * 100)}% of the time.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            What a simulation cannot show you is the foiling itself, which is half of why a real hit
            feels like one.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-extrabold text-white">Should you open real packs?</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Rip a few here and the answer usually arrives on its own: most packs are bulk, which is
            exactly what the rates above predict. If you want a specific card, buying the single is
            almost always cheaper than chasing it — that is the whole reason a singles market exists.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-400">
            <li>
              <Link href="/tools/box-ev" className="font-semibold text-brand-300 hover:underline">
                Box EV calculator →
              </Link>{" "}
              prices a full {PACKS_PER_BOX}-pack box against every card in it, chase prints included.
            </li>
            <li>
              <Link href="/sealed" className="font-semibold text-brand-300 hover:underline">
                Sealed prices →
              </Link>{" "}
              what a real box or pack costs right now, across every store we track.
            </li>
            {current && (
              <li>
                <Link href={`/sets/${current.slug}`} className="font-semibold text-brand-300 hover:underline">
                  Every {current.name} card, priced →
                </Link>{" "}
                if you would rather just buy the one you wanted.
              </li>
            )}
            <li>
              <Link href="/games" className="font-semibold text-brand-300 hover:underline">
                More Riftbound games →
              </Link>{" "}
              Riftle, price guessing and the rest.
            </li>
          </ul>
        </section>

        <HubFaq faqs={FAQS} />
      </div>
    </div>
  );
}
