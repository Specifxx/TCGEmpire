import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { isPreorderSetCode, setBySlug } from "@/lib/constants";
import { getSetChecklist } from "@/lib/set-checklist";
import { ownedBySet } from "@/lib/set-owned";
import type { ChecklistCard, OwnedMap } from "@/lib/set-scope";
import { FREE_PORTFOLIO_LIMIT } from "@/lib/free-limits";
import { SetOwnedProvider } from "@/components/SetOwned";
import { SetTracker } from "@/components/SetTracker";

// Personal page, never indexed, per-request (it reads the signed-in account).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set checklist — what your binder is missing",
  robots: { index: false, follow: false },
};

// ONE SET'S CHECKLIST (2026-09-29, DECISIONS.md, "Set tracker").
//
// It reads NO searchParams and never calls notFound(): a loading.tsx sits above
// /portfolio (scripts/adsense-guard.ts refuses one above a searchParams route or
// a notFound() route), so scope, filters and sort live in the client component
// and an unknown set bounces to the index. The catalogue is lib/set-checklist.ts's
// cached entry; the only per-request read is the account's owned cards for THIS
// set, one narrow groupBy. Called directly, never inside an unstable_cache.
export default async function SetChecklistPage({ params }: { params: { set: string } }) {
  const set = setBySlug(params.set);
  if (!set) redirect("/portfolio/sets");
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/portfolio/sets/${set.slug}`);

  const country = getCountry();
  const info = COUNTRIES[country];

  let cards: ChecklistCard[] = [];
  let owned: OwnedMap = {};
  let failed = false;
  try {
    [cards, owned] = await Promise.all([getSetChecklist(set.code, country), ownedBySet(prisma, user.id, set.code)]);
  } catch {
    failed = true;
  }

  const preRelease = isPreorderSetCode(set.code);
  const releasedLabel = set.releasedOn
    ? new Date(`${set.releasedOn}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/portfolio" className="hover:text-slate-300">My binder</Link>
          <span>/</span>
          <Link href="/portfolio/sets" className="hover:text-slate-300">Set checklist</Link>
          <span>/</span>
          <span className="text-slate-300">{set.name}</span>
        </nav>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-white">{set.name} checklist</h1>
        <p className="mt-1 text-sm text-slate-400">
          {preRelease
            ? `Tick the ${set.name} cards you have as they're revealed.`
            : `What your binder is missing from ${set.name}, and the cheapest listing for each card in ${info.place} (${info.currency}).`}
        </p>
      </div>

      {failed ? (
        <p role="alert" className="card-surface p-6 text-center text-sm text-amber-200">
          Couldn&apos;t load {set.name} just now. Reload in a minute.
        </p>
      ) : cards.length === 0 ? (
        <p className="card-surface p-6 text-center text-sm text-slate-400">
          There are no {set.name} cards in our catalogue yet. <Link href="/portfolio/sets" className="text-brand-400 hover:underline">Back to the checklist</Link>
        </p>
      ) : (
        <SetOwnedProvider setCode={set.code} initial={owned}>
          <SetTracker
            setName={set.name}
            setSlug={set.slug}
            cards={cards}
            initialOwned={owned}
            currency={info.currency}
            place={info.place}
            country={country}
            preRelease={preRelease}
            releasedLabel={releasedLabel}
            freeLimit={FREE_PORTFOLIO_LIMIT}
          />
        </SetOwnedProvider>
      )}
    </div>
  );
}
