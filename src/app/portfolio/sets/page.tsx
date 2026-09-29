import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { SETS, isPreorderSetCode } from "@/lib/constants";
import { getSetChecklist } from "@/lib/set-checklist";
import { ownedBySet } from "@/lib/set-owned";
import { preReleaseLine, summarise, summarisePreRelease, type ChecklistCard, type OwnedMap } from "@/lib/set-scope";
import { FREE_PORTFOLIO_LIMIT } from "@/lib/free-limits";
import { NavIcon } from "@/components/NavIcon";

// Personal page, never indexed, and per-request: it reads the signed-in account.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set checklist — what your binder is missing",
  robots: { index: false, follow: false },
};

// THE SET TRACKER'S INDEX (2026-09-29, DECISIONS.md, "Set tracker"): one bar per
// set. Each set's catalogue is lib/set-checklist.ts's own cached entry (not
// per-request work); the only per-request read is the account's owned cards for
// the listed sets, one narrow groupBy (lib/set-owned.ts). A set that has not
// released shows "N cards revealed so far" and no bar, fraction or percentage:
// its total is not settled. No P&L anywhere on this page.
export default async function SetChecklistIndex() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/portfolio/sets");

  const country = getCountry();
  const info = COUNTRIES[country];

  let failed = false;
  const lists = await Promise.all(
    SETS.map(async (set) => ({
      set,
      cards: await getSetChecklist(set.code, country).catch((): ChecklistCard[] => {
        failed = true;
        return [];
      }),
    })),
  );
  const shown = lists.filter((l) => l.cards.length > 0);
  const owned: OwnedMap = shown.length
    ? await ownedBySet(prisma, user.id, shown.map((l) => l.set.code)).catch(() => {
        failed = true;
        return {};
      })
    : {};

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <Link href="/portfolio" className="text-xs text-slate-500 hover:text-slate-300">← My binder</Link>
        <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-extrabold text-white">
          <NavIcon name="collection" className="h-6 w-6 text-brand-400" />
          Set checklist
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Tick what&apos;s in your binder and see how far through each set you are, what&apos;s missing, and the cheapest listing for
          each missing card in {info.place}. Free for your first {FREE_PORTFOLIO_LIMIT} cards; Plus removes the limit so a whole set
          fits, and nobody loses cards they already have.
        </p>
      </div>

      {failed && (
        <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
          Some sets couldn&apos;t be loaded just now, so they may be missing below. Reload in a minute.
        </p>
      )}

      {shown.length === 0 && !failed ? (
        <p className="card-surface p-6 text-center text-sm text-slate-400">No set has cards in our catalogue yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {shown.map(({ set, cards }) => {
            const pre = isPreorderSetCode(set.code);
            const href = `/portfolio/sets/${set.slug}`;
            if (pre) {
              const p = summarisePreRelease(cards, owned);
              return (
                <li key={set.code} className="card-surface flex flex-col gap-2 p-5" data-set={set.code} data-prerelease>
                  <h2 className="text-lg font-extrabold text-white">{set.name}</h2>
                  <p className="text-sm text-slate-300">{preReleaseLine(p)}</p>
                  <p className="text-xs text-slate-500">
                    {p.owned > 0 ? `You have ${p.owned} in your binder. ` : ""}Not released yet, so there is no total to count against.
                  </p>
                  <Link href={href} className="mt-auto pt-2 text-sm font-semibold text-brand-300 hover:underline">Tick what you pull →</Link>
                </li>
              );
            }
            const base = summarise(cards, owned, "base");
            const all = summarise(cards, owned, "all");
            return (
              <li key={set.code} className="card-surface flex flex-col gap-2 p-5" data-set={set.code}>
                <h2 className="text-lg font-extrabold text-white">{set.name}</h2>
                <p className="text-sm text-slate-300">
                  <span className="num font-bold text-white">{base.owned}</span> of {base.total} base cards
                  {base.percent != null && <span className="ml-1 text-brand-300">· {base.percent}%</span>}
                </p>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={base.percent ?? 0}
                  aria-label={`${set.name} base set owned`}
                  className="h-2.5 overflow-hidden rounded-full bg-ink-800"
                >
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${base.percent ?? 0}%` }} />
                </div>
                <p className="text-xs text-slate-500">
                  Every printing we track: {all.owned} of {all.total}. Counts are printings in our catalogue.
                </p>
                <Link href={href} className="mt-auto pt-2 text-sm font-semibold text-brand-300 hover:underline">
                  {base.missing > 0 || all.missing > 0 ? "See what's missing →" : "Open the checklist →"}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-slate-500">
        Any finish and any condition counts as owned. Prices are the cheapest in-stock listing at a store in {info.place}, before
        postage. To bring in a whole binder, import a CSV with a set, collector number, finish and quantity from{" "}
        <Link href="/portfolio#collection" className="text-brand-400 hover:underline">My binder</Link>.
      </p>
    </div>
  );
}
