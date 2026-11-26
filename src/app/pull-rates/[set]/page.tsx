import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubFaq } from "@/components/HubFaq";
import { PullRateTable } from "@/components/PullRateTable";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { faqPage, ldJson } from "@/lib/jsonld";
import { cardImageSrc } from "@/lib/card-image-url";
import { getPullTally } from "@/lib/pull-rates-server";
import { getPullSetCards } from "@/lib/pull-tracker-server";
import { LEGACY_PRODUCTS, LEGACY_RELEASE_DATE } from "@/lib/sets/legacy";
import { MAX_PACKS_PER_MEMBER_SET, MIN_MEMBERS, MIN_PACKS, onePerText, PULL_RATE_SETS, PULL_TIERS, pullRateSetBySlug, setIsOpen, toPublish } from "@/lib/pull-rates";

// /pull-rates/<set>: one set's community pull rates (lib/pull-rates.ts; DECISIONS.md 2026-11-26). Members'
// packs beside Riot's figures, and the hits members pulled most. Indexed only once the set is published
// (MIN_MEMBERS members and MIN_PACKS packs): before that it is a short page with Riot's column only. One
// cached tally read and the tracker's cached card list; no static prewarming.
export const revalidate = 21600;

const tierLabel = (k: string) => PULL_TIERS.find((t) => t.key === k)?.label ?? k;

export async function generateMetadata({ params }: { params: { set: string } }): Promise<Metadata> {
  const set = pullRateSetBySlug(params.set);
  if (!set) return {};
  const tally = (await getPullTally()).sets[set.code];
  const title = `${set.name} Pull Rates: What Riftbound Members Pulled`;
  const description = tally?.published
    ? `${set.name} pull rates from ${tally.packs} Riftbound packs members opened and logged: Epics, alt arts, overnumbered and Signature cards, beside Riot's odds.`
    : `Riftbound ${set.name} pull rates from real packs members log, beside Riot's published odds. Opened some? Add yours.`;
  return {
    title,
    description,
    alternates: pageAlternates(`/pull-rates/${set.slug}`),
    openGraph: pageOpenGraph({ title, description, url: `/pull-rates/${set.slug}` }),
    ...(tally?.published ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function SetPullRates({ params }: { params: { set: string } }) {
  const set = pullRateSetBySlug(params.set);
  if (!set) notFound();
  const open = setIsOpen(set);
  const [tally, cards] = await Promise.all([getPullTally(), open ? getPullSetCards(set.code) : Promise.resolve([])]);
  const t = tally.sets[set.code];
  const left = toPublish(t);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const top = (t?.cards ?? []).map((h) => ({ ...h, card: byId.get(h.cardId) })).filter((h) => h.card).slice(0, 12);
  const updated = new Date(tally.at).toUTCString().slice(5, 16);
  const box = set.code === "LGC" ? LEGACY_PRODUCTS[0] : null;

  const faqs = [
    {
      q: `How are the ${set.name} pull rates counted?`,
      a: `Members log how many ${set.name} packs they opened and tap (or scan) every Epic and Showcase card those packs gave them. The site adds every log up and divides packs by pulls. Rares and below are not counted: Riot publishes no rate for them.`,
    },
    {
      q: "Why might members' rates differ from Riot's?",
      a: `Riot's odds are an average over the whole print run, and Riot's only article on them is about Origins. A few hundred packs can run hot or cold by chance, so treat a rate from under ten boxes as a rough guide, and watch it settle as more packs come in.`,
    },
    {
      q: "Can one person skew it?",
      a: `Each member can add up to ${MAX_PACKS_PER_MEMBER_SET} ${set.name} packs, a log must be possible (no more hits than packs can hold), and rates show only after ${MIN_PACKS} packs from ${MIN_MEMBERS} different members.`,
    },
  ];

  return (
    <div className="container-app space-y-6 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(faqPage(faqs)) }} />
      <Breadcrumbs
        trail={[
          { name: "Pull rates", href: "/pull-rates" },
          { name: set.name, href: `/pull-rates/${set.slug}` },
        ]}
      />
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">Community data</p>
        <h1 className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">{set.name} pull rates, from real packs</h1>
        {open ? (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400 num">
            {t?.packs ?? 0} {set.name} pack{t?.packs === 1 ? "" : "s"} logged by {t?.members ?? 0} member{t?.members === 1 ? "" : "s"}
            {t && t.packs >= 24 ? ` (about ${Math.floor(t.packs / 24)} box${Math.floor(t.packs / 24) === 1 ? "" : "es"})` : ""}. Updated {updated}.
          </p>
        ) : (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            {set.name} packs open at Pre-Rift events from {set.opensOn}, and the set is out on {LEGACY_RELEASE_DATE}. Logging opens on the first day of Pre-Rift, and
            this page fills in as members add their packs.
          </p>
        )}
        <nav aria-label="Other sets" className="mt-3 flex flex-wrap gap-1.5">
          {PULL_RATE_SETS.map((s) => (
            <Link
              key={s.slug}
              href={`/pull-rates/${s.slug}`}
              aria-current={s.slug === set.slug ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${s.slug === set.slug ? "bg-gold/15 text-gold ring-gold/40" : "bg-ink-800 text-slate-300 ring-white/10 hover:bg-ink-700"}`}
            >
              {s.name}
            </Link>
          ))}
        </nav>
      </header>

      <section className="space-y-3">
        <PullRateTable code={set.code} tally={t} />
        {open && !t?.published && (
          <p className="text-sm text-slate-400">
            Rates show once {MIN_PACKS} packs from {MIN_MEMBERS} different members are in:{" "}
            {[left.packs ? `${left.packs} more pack${left.packs === 1 ? "" : "s"}` : "", left.members ? `${left.members} more member${left.members === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ")} to go.
          </p>
        )}
        {open && (
          <Link href={`/tools/pull-tracker/${set.slug}`} className="btn-primary inline-block text-sm">
            Log your {set.name} pulls
          </Link>
        )}
      </section>

      {box && (
        <section className="card-surface p-5 text-sm leading-relaxed text-slate-300">
          <h2 className="text-base font-extrabold text-white">What a {set.name} pack holds</h2>
          <p className="mt-2">
            {box.name}{box.msrp ? `, ${box.msrp}` : ""}: {box.detail}. Riot has not published {set.name}&apos;s odds; the table above fills in from members&apos; packs.
          </p>
        </section>
      )}

      {top.length > 0 && (
        <section aria-labelledby="pr-top">
          <h2 id="pr-top" className="text-lg font-extrabold text-white">Most pulled {set.name} hits</h2>
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {top.map((h) => {
              const c = h.card!;
              const src = cardImageSrc(c);
              return (
                <li key={h.cardId} className="rounded-lg bg-ink-900 p-1 ring-1 ring-white/10">
                  <Link href={c.slug ? `/card/${c.slug}` : `/sets/${set.slug}`} className="block">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={`${c.name} ${c.collectorNumber}`} loading="lazy" className="aspect-[5/7] w-full rounded-md object-cover" />
                    ) : (
                      <span className="grid aspect-[5/7] w-full place-items-center rounded-md bg-ink-800 text-[10px] text-slate-500">{c.collectorNumber}</span>
                    )}
                    <span className="mt-1 block truncate text-[11px] font-semibold text-slate-200">{c.name}</span>
                    <span className="block text-[11px] text-slate-400 num">
                      {tierLabel(h.tier)} · pulled {h.qty}× · {onePerText(t!.packs / h.qty)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card-surface p-5 text-sm leading-relaxed text-slate-300">
        <h2 className="text-base font-extrabold text-white">Rather buy the card than chase it?</h2>
        <p className="mt-2">
          A rate of one in 72 packs is three boxes for one card. The{" "}
          <Link href={`/sets/${set.slug}`} className="text-brand-300 underline-offset-2 hover:underline">
            {set.name} card list
          </Link>{" "}
          compares every single across stores, and the{" "}
          <Link href="/tools/box-ev" className="text-brand-300 underline-offset-2 hover:underline">
            box value calculator
          </Link>{" "}
          works out what a box returns on average at today&apos;s prices.
        </p>
      </section>

      <HubFaq faqs={faqs} />
    </div>
  );
}
