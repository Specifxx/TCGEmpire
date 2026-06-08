import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPointsState } from "@/lib/points";
import { RewardsDashboard } from "@/components/RewardsDashboard";
import { RewardCatalogPreview } from "@/components/RewardsDashboard";
import { SHARD } from "@/lib/points-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${SHARD.name} & Rewards`,
  description: `Earn ${SHARD.name} just by using RiftCompare — daily check-ins, posting on the forum and more — then redeem them for badges, flair, early-access features and personalised experiences.`,
};

export default async function RewardsPage() {
  const user = await getCurrentUser();

  if (!user) {
    // Signed-out: market the programme + show the catalogue read-only.
    return (
      <div className="mx-auto max-w-4xl">
        <header className="card-surface p-6 text-center sm:p-8">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/15 text-3xl text-brand-400">
            {SHARD.glyph}
          </div>
          <h1 className="mt-3 font-display text-3xl font-extrabold text-white">RiftCompare {SHARD.name}</h1>
          <p className="mx-auto mt-2 max-w-xl text-slate-300">
            Earn {SHARD.glyph} {SHARD.name} just by using the site — check in daily, post on the forum, list cards and
            level up. Redeem them for badges, name flair, early-access features and personalised experiences.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/register" className="btn-primary">Create an account</Link>
            <Link href="/login?next=/rewards" className="btn-ghost">Sign in</Link>
          </div>
        </header>
        <RewardCatalogPreview />
      </div>
    );
  }

  const state = await getPointsState(user.id);
  if (!state) {
    return <div className="mx-auto max-w-4xl card-surface p-6 text-slate-300">Couldn&apos;t load your rewards. Please refresh.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <RewardsDashboard initial={state} />
    </div>
  );
}
