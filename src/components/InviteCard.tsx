"use client";

import { useState } from "react";
import { SITE_URL } from "@/lib/site";
import { AWARDS, SHARD } from "@/lib/points-config";

// "Invite friends" card on the rewards dashboard. The share link is just the
// signed-in user's id (/?ref=<id>) — ReferralCapture stashes it, applyReferral
// credits both sides on signup. Double-sided reward = a real reason to share.
export function InviteCard({ userId, referrals, premiumMonths = 0 }: { userId: string; referrals: number; premiumMonths?: number }) {
  const [copied, setCopied] = useState(false);
  const link = `${SITE_URL}/?ref=${userId}`;
  const referBonus = AWARDS.referral.amount;
  const joinBonus = AWARDS.referral_welcome.amount;
  const moLabel = `${premiumMonths} month${premiumMonths === 1 ? "" : "s"}`;
  const shareText = `I'm using RiftCompare to find the cheapest Riftbound card prices — join with my link and grab ${joinBonus} ${SHARD.glyph} Shards to start:`;

  const copy = () => {
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  const nativeShare = () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: "RiftCompare", text: shareText, url: link }).catch(() => {});
    } else {
      copy();
    }
  };
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(link)}`;
  const redditUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(link)}&title=${encodeURIComponent("RiftCompare — find the cheapest Riftbound card prices")}`;

  return (
    <section className="card-surface mt-6 p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-white">
        <span aria-hidden>🎁</span> Invite friends{premiumMonths > 0 ? <>, earn <span className="text-gold">free Premium</span></> : <> , earn {SHARD.glyph} {SHARD.name}</>}
      </h2>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-400">
        Share your link — your friend gets {joinBonus} {SHARD.glyph} to start, and you earn{" "}
        {referBonus} {SHARD.glyph}
        {premiumMonths > 0 && <> <strong className="text-gold">plus {moLabel} of Premium</strong></>} every time someone joins through it.
      </p>
      {premiumMonths > 0 && (
        <p className="mt-2 text-xs font-medium text-gold/80">
          Your Premium months stack — invite {Math.ceil(12 / premiumMonths)} friends and you&apos;ve earned a free year.
        </p>
      )}
      {referrals > 0 && (
        <p className="mt-2 text-sm font-medium text-brand-300">
          {referrals} {referrals === 1 ? "friend has" : "friends have"} joined so far — that&apos;s{" "}
          {(referrals * referBonus).toLocaleString()} {SHARD.glyph} earned.
        </p>
      )}

      <div className="mt-4 flex items-stretch gap-2">
        <code className="flex flex-1 items-center overflow-x-auto rounded-lg bg-ink-950 px-3 py-2 text-xs text-slate-300">
          {link}
        </code>
        <button type="button" onClick={copy} className="btn-primary shrink-0 text-sm">
          {copied ? "✓ Copied" : "Copy link"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={nativeShare} className="btn-ghost text-sm">
          Share…
        </button>
        <a href={xUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost text-sm">
          Share on X
        </a>
        <a href={redditUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost text-sm">
          Share on Reddit
        </a>
      </div>
    </section>
  );
}
