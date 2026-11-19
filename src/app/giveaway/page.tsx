import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { BONUS_ENTRIES, CURRENT_GIVEAWAY as G, MAX_REFERRAL_ENTRIES } from "@/lib/giveaway";
import { GiveawayEnter } from "@/components/giveaway/GiveawayEnter";
import { GiveawayLeaderboard } from "@/components/giveaway/GiveawayLeaderboard";

// /giveaway: the current prize draw and its official rules (lib/giveaway.ts, owner
// 2026-11-18). Static: the entry state comes from /api/giveaway after mount.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Riftbound Giveaway: Win a Miss Fortune, Captain Alt Art",
  description:
    "Free to enter, worldwide: win a Miss Fortune, Captain Showcase alternate art from Origins. Free bonus entries, a live leaderboard, and a new giveaway every month. Closes 14 December 2026.",
  alternates: pageAlternates("/giveaway"),
  openGraph: pageOpenGraph({
    title: "Win a Miss Fortune, Captain alt art (free, worldwide)",
    description: "Free to enter with a RiftCompare account, ships worldwide. Closes 14 December 2026.",
    url: "/giveaway",
  }),
};

const closesText = "14 December 2026 at 11:59 pm Sydney time (AEDT)";

export default function GiveawayPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-sm uppercase tracking-wide opacity-70">Giveaway · free to enter · worldwide</p>
      <h1 className="mt-1 text-3xl font-bold">{G.title}</h1>

      <div className="mt-6 grid gap-6 sm:grid-cols-[220px_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={G.imageUrl} alt="Miss Fortune, Captain, Origins 162a/298 alternate art" width={220} height={307} className="rounded-xl" loading="eager" />
        <div>
          <p className="text-lg">
            We&apos;re giving away <strong>{G.prize}</strong>. Entry is free, and it&apos;s open to players worldwide.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5">
            <li>Sign in to {SITE_NAME} free (Google or an email link).</li>
            <li>Press <strong>Enter the giveaway</strong> below.</li>
            <li>
              Optional, all free: watch any card&apos;s price for {BONUS_ENTRIES} entries, and invite friends for +1 each. We draw one winner on {G.drawOn}{" "}
              and email them.
            </li>
          </ol>
          <GiveawayEnter giveaway={G.key} cardHref={`/card/${G.cardSlug}`} maxReferrals={MAX_REFERRAL_ENTRIES} />
          <p className="mt-3 text-sm opacity-80">
            Closes {closesText}. While you&apos;re here, see what this card costs at every store:{" "}
            <Link href={`/card/${G.cardSlug}`} className="underline">
              Miss Fortune, Captain prices
            </Link>
            .
          </p>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">How entries work</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>Every entrant starts with 1 entry.</li>
          <li>
            Watch the price of any card or sealed product (free for every account) and you have {BONUS_ENTRIES} entries. Premium members have{" "}
            {BONUS_ENTRIES} automatically, so paying never gets you more than a free account can.
          </li>
          <li>
            Each friend who creates an account with your invite link and confirms their email adds 1 entry, up to {MAX_REFERRAL_ENTRIES}.
          </li>
          <li>Your chance of winning is your entries divided by all entries. The site counts everything itself; nothing is self-reported.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Leaderboard</h2>
        <p className="mt-1 text-sm opacity-80">The top 100 entrants by entries. First name and last initial only, and you can hide yours.</p>
        <GiveawayLeaderboard />
      </section>

      <section className="mt-10 rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-xl font-semibold">A giveaway every month</h2>
        <p className="mt-1 text-sm leading-relaxed">
          This is the first one. We plan to run a new giveaway every month, announced on this page. Your account is all you need to enter each one.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Official rules</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <strong>Promoter.</strong> {SITE_NAME} (riftcompare.com), Sydney, Australia. Contact:{" "}
            <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </li>
          <li>
            <strong>No purchase necessary.</strong> Entry is free. Premium members receive {BONUS_ENTRIES} entries; every free account can receive the
            same {BONUS_ENTRIES} entries, free, by watching the price of at least one card or sealed product. Buying anything never gives more entries than
            a free account can have.
          </li>
          <li>
            <strong>Who can enter.</strong> Anyone aged 18 or over (or the age of majority where they live, if that is higher), anywhere in the world,
            except where this draw is prohibited or restricted by law, where it is void. Not open to anyone involved in running {SITE_NAME}, or their
            household.
          </li>
          <li>
            <strong>How to enter.</strong> Between now and {closesText}, sign in to a free {SITE_NAME} account with a confirmed email address and press
            &quot;Enter the giveaway&quot; on this page. One account per person. Each account holds 1 entry, or {BONUS_ENTRIES} entries while it
            watches a price or has Premium, plus 1 entry for each friend who creates a new account with its invite link during the giveaway and confirms
            their email, up to {MAX_REFERRAL_ENTRIES}. Entries made with more than one account by the same person, invites to your own or fake accounts,
            and entries made by automated means are void, and we may remove them.
          </li>
          <li>
            <strong>Prize.</strong> One {G.prize}. {G.prizeDetail} Approximate value: {G.approxValue}. No cash alternative. The prize is not
            transferable. Postage is paid by the promoter. Any import duty or tax in the winner&apos;s country is the winner&apos;s.
          </li>
          <li>
            <strong>Draw.</strong> One winner is chosen at random from all valid entries on {G.drawOn}, by a computer draw in which every entry has the
            same chance, so an entrant&apos;s chance is their entries divided by all entries.
          </li>
          <li>
            <strong>Winner.</strong> We email the winner at their account&apos;s address. They have {G.claimDays} days to reply with a postal address. If
            they don&apos;t, or can&apos;t accept the prize, we draw again once. We may publish the winner&apos;s first name and country only, with their consent.
          </li>
          <li>
            <strong>Privacy.</strong> We use your account and entry only to run this draw and contact the winner. The public leaderboard shows the top
            100 entrants by first name and last initial and their entries, never an email; untick &quot;Show my first name&quot; to appear as
            &quot;Anonymous entrant&quot;. Entering does not sign you up to any
            marketing email. See our <Link className="underline" href="/privacy">privacy policy</Link>.
          </li>
          <li>
            <strong>Not sponsored.</strong> This draw is not sponsored, endorsed or run by Riot Games, Instagram, Meta, Reddit or any store. Riftbound and
            its cards are Riot Games&apos; trademarks.
          </li>
          <li>
            <strong>Changes.</strong> If something outside our control stops the draw running fairly, we may change or cancel it and say so on this page.
          </li>
        </ol>
      </section>
    </main>
  );
}
