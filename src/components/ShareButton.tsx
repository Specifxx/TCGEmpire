"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import { earnCoin } from "@/lib/coins-client";
import { useCountryMaybe } from "@/components/CountryProvider";
import { computeMarket, type MarketRow } from "@/lib/market-rows";
import { useMe } from "@/lib/use-me";
import { REFERRAL_PREMIUM_DAYS } from "@/lib/premium-days";
import { pickShareArm, priceGap, SHARE_ARM_KEY, shareText, shareUrl, withInvite, type GapRow, type ShareArm, type ShareMedium } from "@/lib/share-link";

// Share (2026-11-02, word of mouth; a copy-the-link button since 2026-09): the
// phone's own share sheet where there is one, else the link copied. No pop-up.
// The link is this page's clean URL plus utm_source=share (lib/share-link.ts), and
// the message names the real price gap in the visitor's market when the card
// page passes its rows (or the quick view its in-stock rows). One Vercel event
// per tap, share { medium }; the growth report counts them.
// A drawn icon and text-sm (2026-09-23) to match the heart button beside it;
// `responsive` gives an icon square below sm.
export function ShareButton({
  className,
  responsive = false,
  name,
  rows,
  prices,
  medium = "card",
  path,
}: {
  className?: string;
  responsive?: boolean;
  name?: string;
  /** the card page's rows, every market: the visitor's market is picked here */
  rows?: MarketRow[];
  /** one market's in-stock rows, already chosen (the quick view) */
  prices?: GapRow[];
  medium?: ShareMedium;
  /** defaults to the current page */
  path?: string;
}) {
  const [copied, setCopied] = useState(false);
  // Share-for-a-deal (lib/share-link.ts): the arm, and the thank-you card once a share completes.
  const [arm, setArm] = useState<ShareArm>("plain");
  const [thanks, setThanks] = useState(false);
  useEffect(() => {
    try {
      const a = pickShareArm(localStorage.getItem(SHARE_ARM_KEY), Math.random());
      localStorage.setItem(SHARE_ARM_KEY, a);
      setArm(a);
    } catch {}
  }, []);
  // After a completed share, everyone is told about invites (owner, 2026-11-18: the
  // invite reward "needs to be visible"): a member that the link carried their code,
  // a visitor that signing in first earns them both a week. The deal card stays the
  // reward arm's only.
  const [invite, setInvite] = useState(false);
  const unlock = () => {
    setInvite(true);
    if (arm !== "reward") return;
    setThanks(true);
    try {
      track("share_unlock", { medium });
    } catch {}
  };
  // The shared session (one /api/me per page load, already asked by the header):
  // a signed-in member's link carries their invite code after the #.
  const { inviteCode, loaded: meLoaded } = useMe();
  const ctx = useCountryMaybe();
  const country = ctx?.country;
  const market = useMemo(() => (rows && country ? computeMarket(rows, country).prices : null), [rows, country]);
  return (
    <span className="relative inline-flex">
    <button
      onClick={async () => {
        const url = withInvite(shareUrl(location.origin, path ?? location.pathname, medium), inviteCode);
        const gapRows = prices ?? market ?? null;
        const fmt = ctx?.fmt ?? ((c: number) => `$${(c / 100).toFixed(2)}`);
        const title = name ?? document.title;
        const text = shareText(title, gapRows ? priceGap(gapRows) : null, fmt);
        try {
          track("share", { medium, arm });
        } catch {
          /* analytics never gets in the way */
        }
        // RiftCompare Coins: sharing a price is a task (lib/coins-client.ts).
        earnCoin("share");
        if (typeof navigator.share === "function") {
          try {
            await navigator.share({ title, text, url });
            unlock();
            return;
          } catch (e) {
            if ((e as Error)?.name === "AbortError") return;
          }
        }
        try {
          await navigator.clipboard.writeText(`${text} ${url}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          unlock();
        } catch {
          /* clipboard unavailable — ignore */
        }
      }}
      aria-label={name ? `Share ${name}` : "Share this page"}
      title="Share"
      className={`btn-ghost whitespace-nowrap${responsive ? " w-12 px-0 sm:w-auto sm:px-4" : ""} ${className ?? ""}`}
    >
      {/* The glyph swaps to a check while copied, so a phone — where the label
          is hidden — still gets a confirmation. */}
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {copied ? (
          <path d="M20 6 9 17l-5-5" />
        ) : (
          <>
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="M16 6l-4-4-4 4" />
            <path d="M12 2v13" />
          </>
        )}
      </svg>
      <span className={responsive && arm !== "reward" ? "hidden sm:inline" : arm === "reward" ? "text-xs sm:text-sm" : undefined}>{copied ? "Link copied" : arm === "reward" ? "Share · get a deal" : "Share"}</span>
    </button>
    {invite && !thanks && meLoaded && (
      <span className="absolute right-0 top-full z-20 mt-2 flex w-72 max-w-[85vw] flex-col gap-1.5 rounded-xl border border-white/10 bg-slate-900 p-3 text-left text-sm text-slate-200 shadow-lg">
        <span className="flex items-start justify-between gap-2">
          <span className="font-semibold text-white">{inviteCode ? "Sent with your invite" : "Share as an invite"}</span>
          <button type="button" onClick={() => setInvite(false)} className="text-slate-400" aria-label="Close">✕</button>
        </span>
        <span className="text-slate-400">
          {inviteCode
            ? `When a friend makes a free account from your link, you both get ${REFERRAL_PREMIUM_DAYS} days of Premium.`
            : `Sign in before you share, and when a friend makes a free account you both get ${REFERRAL_PREMIUM_DAYS} days of Premium.`}
        </span>
        <Link rel="nofollow" href={inviteCode ? "/profile#invite" : "/login?src=referral"} prefetch={false} className="text-xs font-semibold text-brand-400 underline">
          {inviteCode ? "Your invite link →" : "Sign in free →"}
        </Link>
      </span>
    )}
    {thanks && (
      <span className="absolute right-0 top-full z-20 mt-2 flex w-72 max-w-[85vw] flex-col gap-1.5 rounded-xl border border-white/10 bg-slate-900 p-3 text-left text-sm text-slate-200 shadow-lg">
        <span className="flex items-start justify-between gap-2">
          <span className="font-semibold text-white">Thanks for sharing. Your deal:</span>
          <button type="button" onClick={() => setThanks(false)} className="text-slate-400" aria-label="Close">✕</button>
        </span>
        <span className="text-slate-400">Today’s Riftbound cards selling below TCGplayer market, and the ones cheapest on eBay, checked every day.</span>
        <span className="text-xs text-slate-400">{inviteCode ? `Your link carries your invite: a friend who joins gets you both ${REFERRAL_PREMIUM_DAYS} days of Premium.` : `Sign in before sharing and a friend who joins gets you both ${REFERRAL_PREMIUM_DAYS} days of Premium.`}</span>
        <Link href="/tools/deal-finder?utm_source=share&utm_medium=unlock" prefetch={false} className="text-xs font-semibold text-brand-400 underline">Open Deal Finder →</Link>
      </span>
    )}
    </span>
  );
}
