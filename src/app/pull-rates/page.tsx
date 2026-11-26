import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubFaq } from "@/components/HubFaq";
import { PullRateTable } from "@/components/PullRateTable";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { faqPage, ldJson } from "@/lib/jsonld";
import { getPullTally } from "@/lib/pull-rates-server";
import { MIN_MEMBERS, MIN_PACKS, onePer, onePerText, PULL_RATE_SETS, setIsOpen, toPublish } from "@/lib/pull-rates";
import { PACK_SOURCE } from "@/lib/pack-composition";

// /pull-rates: every set's community pull rates (lib/pull-rates.ts; DECISIONS.md 2026-11-26). Riot's own
// figures for every set, and members' packs beside them once a set has enough. One cached tally read.
export const revalidate = 21600;

const TITLE = "Riftbound Pull Rates: What Members Actually Pulled";
const DESCRIPTION =
  "Riftbound pull rates per set from packs real members opened and logged: Epics, alt arts, overnumbered and Signature cards, beside Riot's published odds.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: pageAlternates("/pull-rates"),
  openGraph: pageOpenGraph({ title: TITLE, description: DESCRIPTION, url: "/pull-rates" }),
};

const FAQS = [
  {
    q: "Where do these pull rates come from?",
    a: "From packs members of the site opened and logged with the pull tracker: how many packs, and every Epic and Showcase card in them. The site adds the counts up per set. Riot's column is from Riot's own collectability article for Origins.",
  },
  {
    q: "Why does a set say not enough packs yet?",
    a: `A set's rates appear once at least ${MIN_PACKS} packs from at least ${MIN_MEMBERS} different members are logged, so one lucky or unlucky box cannot pass for the rate, and no one person's pulls can be read off the page.`,
  },
  {
    q: "Is my box shown to anyone?",
    a: "No. A log is never shown on its own: pages show only each set's totals. You can take a log back from the pull tracker, and deleting your account deletes your logs.",
  },
];

export default async function PullRatesHub() {
  const tally = await getPullTally();
  const newest = PULL_RATE_SETS.find((s) => setIsOpen(s)) ?? PULL_RATE_SETS[0];
  return (
    <div className="container-app space-y-6 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(faqPage(FAQS)) }} />
      <Breadcrumbs trail={[{ name: "Pull rates", href: "/pull-rates" }]} />
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">Community data</p>
        <h1 className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">Riftbound pull rates, from real packs</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          How often an Epic, an alt art or an overnumbered card really turns up, counted from packs members opened and logged, beside the odds Riot published.
          Opened some packs?{" "}
          <Link href={`/tools/pull-tracker/${newest.slug}`} className="text-brand-300 underline-offset-2 hover:underline">
            Log them in the pull tracker
          </Link>
          .
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PULL_RATE_SETS.map((s) => {
          const t = tally.sets[s.code];
          const left = toPublish(t);
          const epic = t?.published ? onePerText(onePer(t.packs, t.tiers.epic)) : null;
          return (
            <li key={s.slug}>
              <Link href={`/pull-rates/${s.slug}`} className="card-surface block h-full rounded-2xl p-4 ring-1 ring-white/5 transition hover:ring-white/20">
                <p className="text-base font-extrabold text-white">{s.name}</p>
                {!setIsOpen(s) ? (
                  <p className="mt-1 text-sm text-slate-400">Packs open from {s.opensOn}. Logging starts then.</p>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-slate-300 num">
                      {t?.packs ?? 0} pack{t?.packs === 1 ? "" : "s"} logged by {t?.members ?? 0} member{t?.members === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {epic ? `Epic: ${epic}` : `${left.packs ? `${left.packs} more packs` : ""}${left.packs && left.members ? " and " : ""}${left.members ? `${left.members} more member${left.members === 1 ? "" : "s"}` : ""} until rates show`}
                    </p>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <section className="card-surface space-y-3 p-5">
        <h2 className="text-base font-extrabold text-white">Riot&apos;s published odds</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          From{" "}
          <a href={PACK_SOURCE.url} rel="noopener" className="text-brand-300 underline-offset-2 hover:underline">
            {PACK_SOURCE.title}
          </a>{" "}
          ({PACK_SOURCE.author}). Riot has not published separate odds for later sets, which is what members&apos; packs are for.
        </p>
        <PullRateTable code="UNL" tally={undefined} officialOnly />
      </section>

      <HubFaq faqs={FAQS} />
    </div>
  );
}
