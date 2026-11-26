import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import {
  BONUS_POINTS,
  CHECKIN_POINTS,
  CURRENT_GIVEAWAY as G,
  ENTRY_POINTS,
  GIVEAWAY_EVERY_MONTHS,
  MAX_REFERRALS,
  PREMIUM_START_POINTS,
  REFERRAL_POINTS,
  STAR_FRIEND_CHECKINS,
  STAR_REFERRAL_POINTS,
} from "@/lib/giveaway";
import { GiveawayEnter } from "@/components/giveaway/GiveawayEnter";
import { CONTRIBUTION_POINTS, DAILY_CONTRIBUTION_CAP } from "@/lib/contributions";
import { GiveawayCountdown } from "@/components/giveaway/GiveawayCountdown";
import { GiveawayBoard } from "@/components/giveaway/GiveawayBoard";

// /giveaway: the current prize draw, its points and its official rules (lib/giveaway.ts; owner 2026-11-18, points 2026-11-22).
// Static: the entry state comes from /api/giveaway after mount, the board and winner from the CDN-held leaderboard.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Riftbound Giveaway: Win a Miss Fortune, Captain Alt Art",
  description:
    "Free to enter, worldwide: win a Miss Fortune, Captain Showcase alternate art from Origins. Earn points by checking in and inviting friends, watch the live leaderboard, and see the winner drawn from a public random number. Closes 14 December 2026.",
  alternates: pageAlternates("/giveaway"),
  openGraph: pageOpenGraph({
    title: "Win a Miss Fortune, Captain alt art (free, worldwide)",
    description: "Free to enter with a RiftCompare account, ships worldwide. Closes 14 December 2026.",
    url: "/giveaway",
  }),
};

const closesText = "14 December 2026 at 11:59 pm Sydney time (AEDT)";

const WAYS = [
  { pts: `+${ENTRY_POINTS}`, title: "Enter", text: "Sign in free and press Enter. That's your first 10 tickets.", tone: "text-brand-400" },
  { pts: `+${BONUS_POINTS}`, title: "Free bonus", text: "Watch any card's price, or just claim it. Premium members get it automatically.", tone: "text-gold" },
  { pts: `+${CHECKIN_POINTS}`, title: "Check in daily", text: "One tap a day while the giveaway is open. It adds up fast.", tone: "text-sky-400" },
  { pts: `+${CONTRIBUTION_POINTS.hot}`, title: "Help the community", text: `Each deal you vote hot or cold or flag as gone, each collector pulse answer (+${CONTRIBUTION_POINTS.pull} for a pull log), signed in on any of our card sites. Up to ${DAILY_CONTRIBUTION_CAP} a day.`, tone: "text-emerald-400" },
  { pts: `+${REFERRAL_POINTS}`, title: "Invite friends", text: `Each friend who joins with your link and confirms their email, up to ${MAX_REFERRALS}. ${STAR_REFERRAL_POINTS} for a friend who takes Premium or checks in on ${STAR_FRIEND_CHECKINS} days.`, tone: "text-fuchsia-400" },
];

export default function GiveawayPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* Hero: the prize, the clock and the entry panel. */}
      <section className="gw-hero relative overflow-hidden rounded-3xl border border-white/10 p-5 sm:p-8">
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 sm:grid-cols-[230px_minmax(0,1fr)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={G.imageUrl}
            alt="Miss Fortune, Captain, Origins 162a/298 alternate art"
            width={230}
            height={321}
            className="gw-prize mx-auto rounded-xl shadow-2xl"
            loading="eager"
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Giveaway · free to enter · worldwide</p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight sm:text-4xl">{G.title}</h1>
            <p className="mt-2 opacity-90">
              {G.prize}. Ships anywhere, on us. Every point you earn is one ticket in the draw.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="opacity-75">Closes in</span>
              <GiveawayCountdown closesAt={G.closesAt} fallback="14 December 2026" />
            </div>
            <GiveawayEnter giveaway={G.key} cardHref={`/card/${G.cardSlug}`} closesText="14 Dec, 11:59 pm Sydney" />
            <p className="mt-3 text-sm opacity-75">
              See what this card costs at every store:{" "}
              <Link href={`/card/${G.cardSlug}`} className="underline">
                Miss Fortune, Captain prices
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">How to earn points</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {WAYS.map((w) => (
            <div key={w.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className={`text-2xl font-extrabold ${w.tone}`}>{w.pts}</p>
              <p className="mt-1 font-semibold">{w.title}</p>
              <p className="mt-1 text-sm opacity-80">{w.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm opacity-75">
          Premium members start on {PREMIUM_START_POINTS} points, and every free account can reach exactly the same {PREMIUM_START_POINTS}: paying never
          buys more chances than free.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Leaderboard</h2>
        <p className="mt-1 text-sm opacity-80">The top 100 by points. Once entries close, the winner appears here with the winning ticket.</p>
        <GiveawayBoard url="/api/giveaway/leaderboard?site=rift" prize={G.prize} />
      </section>

      <section className="mt-10 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-lg font-semibold">A fair draw you can check</h2>
          <p className="mt-1 text-sm leading-relaxed opacity-85">
            Each point is a numbered ticket. After entries close we take the next public random number from drand, the League of Entropy&apos;s beacon,
            which nobody (us included) can know in advance, and turn it into the winning ticket. The working is shown with the winner.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-lg font-semibold">A new giveaway every {GIVEAWAY_EVERY_MONTHS} months</h2>
          <p className="mt-1 text-sm leading-relaxed opacity-85">
            The next one opens after this draw, announced here. Your account is all you need to enter each one.
          </p>
        </div>
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
            <strong>No purchase necessary.</strong> Entry is free. Premium members receive a {BONUS_POINTS}-point bonus automatically; every free account
            can receive the same {BONUS_POINTS} points, free, by watching the price of any card or sealed product or by pressing &quot;Claim the free
            bonus&quot;. Buying anything, by you or a friend you invite, never gives more points than free activity can.
          </li>
          <li>
            <strong>Who can enter.</strong> Anyone aged 18 or over (or the age of majority where they live, if that is higher), anywhere in the world,
            except where this draw is prohibited or restricted by law, where it is void. Not open to anyone involved in running {SITE_NAME}, or their
            household.
          </li>
          <li>
            <strong>How to enter.</strong> Between now and {closesText}, sign in to a free {SITE_NAME} account with a confirmed email address and press
            &quot;Enter the giveaway&quot; on this page. One account per person. Each account earns {ENTRY_POINTS} points for entering, a {BONUS_POINTS}
            -point bonus (rule 2), {CHECKIN_POINTS} points for each day it checks in on this page while the giveaway is open (one a day, by Sydney date),
            and {REFERRAL_POINTS} points for each friend who creates a new account with its invite link during the giveaway and confirms their email, up
            to {MAX_REFERRALS} friends. A friend counts {STAR_REFERRAL_POINTS} points instead of {REFERRAL_POINTS} once they also have Premium or have checked in on {STAR_FRIEND_CHECKINS} days of this giveaway, so a friend&apos;s free activity counts exactly as much as a friend&apos;s purchase. While the giveaway is open, an account signed in on any of
            our card sites also earns community points: {CONTRIBUTION_POINTS.hot} for each deal it votes hot or cold or flags as gone, {CONTRIBUTION_POINTS.pulse} for
            each collector pulse answer and {CONTRIBUTION_POINTS.pull} for each pull log, each counted once, at most {DAILY_CONTRIBUTION_CAP} a day (Sydney date). Points made with more than one account by the same person, invites to your own or fake accounts, and points made
            by automated means are void, and we may remove them.
          </li>
          <li>
            <strong>Prize.</strong> One {G.prize}. {G.prizeDetail} Approximate value: {G.approxValue}. No cash alternative. The prize is not
            transferable. Postage is paid by the promoter. Any import duty or tax in the winner&apos;s country is the winner&apos;s.
          </li>
          <li>
            <strong>Draw.</strong> On {G.drawOn}, every valid entrant&apos;s points become that many consecutive numbered tickets, in the order they
            entered. The winning ticket is the randomness of the first drand round published after entries close, read as a number, modulo the number of
            tickets, plus 1. So each point has the same chance, and an entrant&apos;s chance is their points divided by all points. The round, its
            randomness and the winning ticket are published on this page.
          </li>
          <li>
            <strong>Winner.</strong> We email the winner at their account&apos;s address with a link to a private claim form for their postal address.
            They have {G.claimDays} days to claim. If they don&apos;t, or can&apos;t accept the prize, we draw again from the remaining tickets (up to
            two redraws) the same published way. We show the winner&apos;s first name and last initial and country only.
          </li>
          <li>
            <strong>Privacy.</strong> We use your account and entry only to run this draw and contact the winner, and the winner&apos;s address only to
            post the prize. The public leaderboard shows the top 100 entrants by first name and last initial and their points, never an email; untick
            &quot;Show my first name&quot; to appear as &quot;Anonymous entrant&quot;. Entering does not sign you up to any marketing email. See our{" "}
            <Link className="underline" href="/privacy">
              privacy policy
            </Link>
            .
          </li>
          <li>
            <strong>Not sponsored.</strong> This draw is not sponsored, endorsed or run by Riot Games, Instagram, Meta, Reddit, drand or any store.
            Riftbound and its cards are Riot Games&apos; trademarks.
          </li>
          <li>
            <strong>Changes.</strong> If something outside our control stops the draw running fairly, we may change or cancel it and say so on this page.
          </li>
        </ol>
      </section>
    </main>
  );
}
