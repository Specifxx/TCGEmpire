"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import {
  BADGES,
  BADGE_CHANCE,
  BADGE_PITY,
  COINS,
  EPIC_PITY,
  LEGENDARY_PITY,
  RARITY_LABEL,
  RARITY_ODDS,
  RARITY_ORDER,
  PREMIUM_BOOST,
  PREMIUM_REDEEM_COST,
  PREMIUM_REDEEM_DAYS,
  SHARDS_FOR_DUPLICATE,
  SHARDS_FOR_DUPLICATE_BADGE,
  SHARDS_PER_PULL,
  SPIN_COST,
  STREAK_DAYS,
  TASKS,
  badgeById,
  coinArt,
  collectionProgress,
  taskById,
  type Badge,
  type Coin,
  type Rarity,
  type TaskId,
} from "@/lib/coins";
import type { CoinState, SpinPayment } from "@/lib/coins-server";
import { RiftBadge } from "./RiftBadge";

// /coins — Riftcoins, Rift Slots, the collection, badges and the tasks
// (2026-10-16, Riftcoins and the slot 2026-10-17). DECISIONS.md, "RiftCompare
// Coins" and "Riftcoins". The page around it is static; everything here reads the
// member's own state from /api/coins after load. The roll happens on the
// server; this only stages it.
//
// The reveal is a fixed sequence so it never stutters on a slow answer: the
// coin's back starts charging the moment the button is pressed (the request
// runs in parallel), holds for at least CHARGE_MS, takes on the rarity's
// colour, flips, then bursts. Transform and opacity only (globals.css .cn-*).

export const RARITY_COLOR: Record<Rarity, string> = { common: "#a8b3c4", rare: "#4fa8ff", epic: "#c86bff", legendary: "#ffcc4d" };

const CHARGE_MS = 1150;
const FLIP_MS = 950;

type Api = { signedIn: boolean; eligible: boolean; inviteUrl?: string; state?: CoinState };
type Won = { coin: Coin; isNew: boolean; count: number; shards: number; forced: boolean; badge: Badge | null; badgeIsNew: boolean };
type Reveal = { phase: "charge" } | ({ phase: "flip" | "shown" } & Won);
type Reel = "idle" | "spin" | "stop";

// The slot's timing: reels spin at least SPIN_MS (the request runs alongside),
// then stop left to right REEL_GAP apart, and the coin's reveal opens LAND_MS
// after the last one lands.
const SPIN_MS = 1100;
const REEL_GAP = 260;
const LAND_MS = 450;
const IDLE_REELS = ["jinx", "ahri", "yasuo"];

export function CoinCollection() {
  const [api, setApi] = useState<Api | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [reels, setReels] = useState<Reel[]>(["idle", "idle", "idle"]);
  const [landed, setLanded] = useState<string[]>(IDLE_REELS);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const welcomed = useRef(false);
  const timers = useRef<number[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/coins", { cache: "no-store" });
      const d = (await r.json()) as Api;
      setApi(d);
      return d;
    } catch {
      setError("Couldn't load your Riftcoins. Refresh to try again.");
      return null;
    }
  }, []);

  const say = useCallback((t: string) => {
    setToast(t);
    const id = window.setTimeout(() => setToast(null), 2600);
    timers.current.push(id);
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const claim = useCallback(
    async (task: TaskId) => {
      const r = await fetch("/api/coins/claim", { method: "POST", body: JSON.stringify({ task }) }).catch(() => null);
      const d = r && r.ok ? await r.json().catch(() => null) : null;
      await load();
      return d as { paid: number; bonus?: number } | null;
    },
    [load]
  );

  useEffect(() => {
    void load().then(async (d) => {
      // The welcome gift is paid on a member's first visit, once (the server's key).
      if (d?.eligible && d.state && !d.state.done.welcome && !welcomed.current) {
        welcomed.current = true;
        const res = await claim("welcome");
        if (res?.paid) say(`Welcome gift: +${res.paid} Riftcoins`);
      }
    });
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, [load, claim, say]);

  const state = api?.state;
  const eligible = !!api?.eligible && !!state;
  const boost = state?.boosted ? PREMIUM_BOOST : 1;

  async function checkIn() {
    if (busy) return;
    setBusy(true);
    const res = await claim("daily");
    setBusy(false);
    if (res?.paid) {
      trackEvent("coins_checkin", { bonus: res.bonus ?? 0 });
      say(res.bonus ? `Checked in: +${res.paid} Riftcoins, and +${res.bonus} for your ${STREAK_DAYS}-day streak!` : `Checked in: +${res.paid} Riftcoins`);
    }
  }

  function canPay(pay: SpinPayment): boolean {
    if (!state) return false;
    return pay === "riftcoins" ? state.riftcoins >= SPIN_COST : pay === "shards" ? state.shards >= SHARDS_PER_PULL : state.pulls >= 1;
  }

  async function doSpin(pay: SpinPayment) {
    if (!state || reveal || busy || !canPay(pay)) return;
    setBusy(true);
    setReels(["spin", "spin", "spin"]);
    const started = performance.now();
    const res = await fetch("/api/coins/pull", { method: "POST", body: JSON.stringify({ pay }) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (!res?.coin) {
      setReels(["idle", "idle", "idle"]);
      setBusy(false);
      say("That spin didn't go through. Nothing was spent.");
      void load();
      return;
    }
    const coin = COINS.find((c) => c.id === res.coin.id) ?? res.coin;
    const badge = res.badge ? badgeById(res.badge.id) ?? null : null;
    const won: Won = { coin, isNew: res.isNew, count: res.count, shards: res.shards, forced: res.forced, badge, badgeIsNew: !!res.badgeIsNew };
    trackEvent("coins_pull", { coin: coin.id, rarity: coin.rarity, new: res.isNew, pay, badge: badge?.id ?? "" });
    // Preload the face so the flip never shows an empty disc.
    const img = new Image();
    img.src = coinArt(coin.id);
    setLanded([coin.id, coin.id, coin.id]);
    const wait = Math.max(0, SPIN_MS - (performance.now() - started));
    [0, 1, 2].forEach((i) => later(wait + i * REEL_GAP, () => setReels((r) => r.map((x, j) => (j === i ? "stop" : x)) as Reel[])));
    later(wait + 2 * REEL_GAP + LAND_MS, () => {
      setReveal({ phase: "flip", ...won });
      later(FLIP_MS, () => {
        setReveal((r) => (r && r.phase === "flip" ? { ...r, phase: "shown" } : r));
        setBusy(false);
        void load();
      });
    });
  }

  async function redeem() {
    if (busy || !state || state.redeemBlocker) return;
    setBusy(true);
    const r = await fetch("/api/coins/redeem", { method: "POST" }).catch(() => null);
    const d = r ? await r.json().catch(() => null) : null;
    setBusy(false);
    if (r?.ok) {
      trackEvent("coins_redeem_premium", { days: PREMIUM_REDEEM_DAYS });
      say(`Premium is on for ${PREMIUM_REDEEM_DAYS} days. Enjoy!`);
    } else {
      say(d?.error ?? "That didn't go through. Nothing was spent.");
    }
    void load();
  }

  async function wear(badgeId: string | null) {
    const r = await fetch("/api/coins/badge", { method: "POST", body: JSON.stringify({ badge: badgeId }) }).catch(() => null);
    if (r?.ok) say(badgeId ? `${badgeById(badgeId)?.name} badge is on your profile` : "Badge taken off your profile");
    void load();
  }

  async function copyInvite() {
    if (!api?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(api.inviteUrl);
      setCopied(true);
      later(2000, () => setCopied(false));
    } catch {
      /* clipboard blocked */
    }
  }

  const owned = state?.owned ?? {};
  const progress = collectionProgress(owned);
  const ownedBadges = state?.badges ?? [];

  return (
    <div className="space-y-8">
      {/* ── Wallet and the slot ─────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-[#ffcc4d]/25 bg-[radial-gradient(ellipse_at_top,rgba(255,204,77,0.14),transparent_60%),linear-gradient(180deg,#140f1f,#0a0a12)] p-5 sm:p-8">
        {!api && !error && <p className="py-10 text-center text-sm text-slate-400">Loading your Riftcoins…</p>}
        {error && <p className="py-10 text-center text-sm text-red-400">{error}</p>}
        {api && !eligible && <Locked />}
        {eligible && state && (
          <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="flex flex-wrap gap-2.5">
                <Stat label="Riftcoins" value={state.riftcoins.toLocaleString()} accent />
                {state.pulls > 0 && <Stat label="Free spins" value={state.pulls} />}
                <Stat label="Shards" value={`${state.shards}/${SHARDS_PER_PULL}`} />
                <Stat label="Coins" value={`${progress.have}/${progress.total}`} />
                <Stat label="Badges" value={`${ownedBadges.length}/${BADGES.length}`} />
              </div>
              <div className="mt-4 flex items-center gap-1.5" aria-label={`Streak: ${streakLit(state.streak)} of ${STREAK_DAYS} days`}>
                {Array.from({ length: STREAK_DAYS }, (_, i) => (
                  <span key={i} className={`h-2 w-6 rounded-full ${i < streakLit(state.streak) ? "bg-[#ffcc4d] shadow-[0_0_10px_rgba(255,204,77,0.7)]" : "bg-white/10"}`} />
                ))}
                <span className="ml-2 text-xs text-slate-400">
                  {state.streak} day streak · day {STREAK_DAYS} pays +{taskById("streak")!.riftcoins * boost}
                </span>
              </div>
              {state.boosted && <p className="mt-3 text-xs font-bold text-[#ffcc4d]">✦ Premium: you earn {PREMIUM_BOOST}× Riftcoins on every task.</p>}
              {!state.checkedInToday ? (
                <button
                  type="button"
                  onClick={checkIn}
                  disabled={busy}
                  className="mt-4 rounded-2xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/10 active:scale-[0.97]"
                >
                  ✦ Daily check-in · +{taskById("daily")!.riftcoins * boost} Riftcoins
                </button>
              ) : (
                <p className="mt-4 text-xs text-slate-400">Checked in today. Back tomorrow for more.</p>
              )}
            </div>

            {/* The slot machine. */}
            <div className="rc-slot mx-auto w-full max-w-[340px] rounded-[28px] p-3.5">
              <p className="mb-2.5 text-center text-[11px] font-black uppercase tracking-[0.3em] text-[#ffcc4d]">Rift Slots</p>
              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#07050d] p-2 ring-1 ring-black/60">
                {reels.map((r, i) => (
                  <div key={i} className="rc-reel relative aspect-[3/4] overflow-hidden rounded-xl bg-[radial-gradient(circle,#1d1630,#0b0814)]">
                    {r === "spin" ? (
                      <div className="rc-reel-strip absolute inset-x-0 top-0" style={{ animationDelay: `${i * -0.12}s` }}>
                        {[...COINS, ...COINS].map((c, k) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={k} src={coinArt(c.id)} alt="" aria-hidden="true" className="mx-auto aspect-square w-[80%] py-[10%] blur-[1px]" draggable={false} />
                        ))}
                      </div>
                    ) : (
                      <div className={`absolute inset-0 grid place-items-center ${r === "stop" ? "rc-reel-land" : ""}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={coinArt(landed[i])} alt="" aria-hidden="true" className="w-[80%] select-none" draggable={false} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => doSpin("riftcoins")}
                  disabled={!canPay("riftcoins") || busy || !!reveal}
                  className={`rounded-2xl bg-gradient-to-b from-[#ffe08a] via-[#ffcc4d] to-[#e0a321] px-6 py-3.5 text-lg font-black tracking-wide text-[#2a1a00] transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${canPay("riftcoins") && !busy ? "cn-pull-btn" : ""}`}
                >
                  {canPay("riftcoins") ? `Spin · ${SPIN_COST} Riftcoins` : `Spin needs ${SPIN_COST} Riftcoins`}
                </button>
                {state.pulls > 0 && (
                  <button
                    type="button"
                    onClick={() => doSpin("pull")}
                    disabled={busy || !!reveal}
                    className="rounded-2xl border border-[#ffcc4d]/40 bg-[#ffcc4d]/10 px-5 py-2.5 text-sm font-bold text-[#ffe08a] transition hover:bg-[#ffcc4d]/20 active:scale-[0.97]"
                  >
                    Use a free spin · {state.pulls} left
                  </button>
                )}
                {state.shards >= SHARDS_PER_PULL && (
                  <button
                    type="button"
                    onClick={() => doSpin("shards")}
                    disabled={busy || !!reveal}
                    className="rounded-2xl border border-[#c86bff]/50 bg-[#c86bff]/15 px-5 py-2.5 text-sm font-bold text-[#e7c6ff] transition hover:bg-[#c86bff]/25 active:scale-[0.97]"
                  >
                    Trade {SHARDS_PER_PULL} shards for a spin
                  </button>
                )}
              </div>
              <p className="mt-2.5 text-center text-[11px] text-slate-400">
                Every spin wins a champion coin, with a {Math.round(BADGE_CHANCE * 100)}% chance at a profile badge.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── Free Premium ────────────────────────────────────────────── */}
      {eligible && state && <PremiumRedeem state={state} busy={busy} onRedeem={redeem} />}

      {/* ── The collection ──────────────────────────────────────────── */}
      <section aria-labelledby="coins-collection">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="coins-collection" className="text-xl font-extrabold text-white">
            Champion coins
          </h2>
          <span className="text-sm text-slate-400">
            {progress.have} of {progress.total} found
          </span>
        </div>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {COINS.map((c, i) => {
            const n = owned[c.id] ?? 0;
            return (
              <li
                key={c.id}
                className="relative flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 pb-3 text-center"
                style={{ boxShadow: n ? `inset 0 0 34px -14px ${RARITY_COLOR[c.rarity]}` : undefined }}
              >
                <div className={`relative aspect-square w-full ${n ? "cn-bob" : ""}`} style={{ ["--cn-delay" as string]: `${(i % 6) * -0.6}s` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={coinArt(c.id)}
                    alt={n ? `${c.name} coin` : "An undiscovered coin"}
                    width={160}
                    height={160}
                    loading="lazy"
                    className={`h-full w-full select-none rounded-full ${n ? "" : "brightness-[0.16] grayscale"}`}
                    draggable={false}
                  />
                  {!n && <span className="absolute inset-0 grid place-items-center text-2xl font-black text-white/40">?</span>}
                  {n > 1 && <span className="absolute -right-1 -top-1 rounded-full bg-[#ffcc4d] px-1.5 py-0.5 text-[10px] font-black text-[#2a1a00]">×{n}</span>}
                </div>
                <span className="mt-2 text-[13px] font-bold leading-tight text-white">{n ? c.name : "???"}</span>
                <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: RARITY_COLOR[c.rarity] }}>
                  {RARITY_LABEL[c.rarity]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Profile badges ──────────────────────────────────────────── */}
      <section aria-labelledby="coins-badges">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="coins-badges" className="text-xl font-extrabold text-white">
            Profile badges
          </h2>
          <span className="text-sm text-slate-400">Win them on the slot, then show one on your profile</span>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {BADGES.map((b) => {
            const has = ownedBadges.includes(b.id);
            const worn = state?.badge === b.id;
            return (
              <li
                key={b.id}
                className={`flex flex-col items-center rounded-2xl border p-3 text-center ${worn ? "border-[#ffcc4d]/60 bg-[#ffcc4d]/[0.06]" : "border-white/10 bg-white/[0.03]"}`}
              >
                <RiftBadge badge={b} size={64} locked={!has} />
                <span className="mt-2 text-sm font-bold text-white">{has ? b.name : "???"}</span>
                <span className="text-[11px] text-slate-400">{has ? b.motto : "Not won yet"}</span>
                {has && (
                  <button
                    type="button"
                    onClick={() => wear(worn ? null : b.id)}
                    className={`mt-2 rounded-full px-3 py-1 text-xs font-bold ${worn ? "bg-[#ffcc4d] text-[#2a1a00]" : "bg-white/10 text-white hover:bg-white/15"}`}
                  >
                    {worn ? "On your profile ✓" : "Show on profile"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Tasks ───────────────────────────────────────────────────── */}
      <section aria-labelledby="coins-tasks">
        <h2 id="coins-tasks" className="mb-3 text-xl font-extrabold text-white">
          Earn Riftcoins
        </h2>
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          {TASKS.map((t) => {
            const done = state?.done[t.id] ?? 0;
            const complete = t.once ? done > 0 : t.perDay != null && done >= t.perDay;
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-full bg-[#ffcc4d]/15 px-1.5 text-xs font-black text-[#ffcc4d]">+{t.riftcoins * boost}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">{t.label}</p>
                  <p className="text-xs text-slate-400">{t.detail}</p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  {!eligible ? (
                    <span className="text-slate-500">Sign in</span>
                  ) : complete ? (
                    <span className="font-bold text-brand-400">Done ✓</span>
                  ) : t.id === "daily" ? (
                    <button type="button" onClick={checkIn} disabled={busy} className="rounded-full bg-white/10 px-3 py-1.5 font-bold text-white hover:bg-white/15">
                      Check in
                    </button>
                  ) : t.id === "referral" ? (
                    <button type="button" onClick={copyInvite} className="rounded-full bg-white/10 px-3 py-1.5 font-bold text-white hover:bg-white/15">
                      {copied ? "Copied!" : "Copy invite link"}
                    </button>
                  ) : t.id === "streak" ? (
                    <span className="text-slate-400">
                      {streakLit(state?.streak ?? 0)}/{STREAK_DAYS}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      {t.perDay != null && (
                        <span className="text-slate-400">
                          {done}/{t.perDay} today
                        </span>
                      )}
                      {t.href && (
                        <Link href={t.href} className="rounded-full bg-white/10 px-3 py-1.5 font-bold text-white hover:bg-white/15">
                          Go
                        </Link>
                      )}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── The odds, in full ───────────────────────────────────────── */}
      <section aria-labelledby="coins-odds" className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-slate-300">
        <h2 id="coins-odds" className="mb-2 text-base font-extrabold text-white">
          The odds
        </h2>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          {[...RARITY_ORDER].reverse().map((r) => (
            <li key={r} className="flex justify-between gap-2">
              <span style={{ color: RARITY_COLOR[r] }} className="font-bold">
                {RARITY_LABEL[r]}
              </span>
              <span>
                {Math.round(RARITY_ODDS[r] * 100)}% · {COINS.filter((c) => c.rarity === r).length} coin{COINS.filter((c) => c.rarity === r).length === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          Every spin wins one champion coin, and every coin in a rarity is equally likely. You always get an Epic or better within {EPIC_PITY} spins and the Legendary within{" "}
          {LEGENDARY_PITY}. A spin also has a {Math.round(BADGE_CHANCE * 100)}% chance at a profile badge, and you always win one within {BADGE_PITY} spins; a badge you
          don&apos;t have yet always comes before a repeat. A coin you already have becomes shards ({RARITY_ORDER.map((r) => `${RARITY_LABEL[r]} ${SHARDS_FOR_DUPLICATE[r]}`).join(", ")}
          ), a repeat badge {SHARDS_FOR_DUPLICATE_BADGE}, and {SHARDS_PER_PULL} shards buy a spin.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          Riftcoins are earned by using the site, never won on a spin. Riftcoins, coins, badges, spins and shards are free: they can&apos;t be bought or sold and have no cash value.
        </p>
      </section>

      {reveal && <RevealOverlay reveal={reveal} onClose={() => (reveal.phase === "shown" ? (setReveal(null), setReels(["idle", "idle", "idle"])) : undefined)} />}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[90] flex justify-center px-4">
        {toast && <p className="cn-rise rounded-full bg-[#1d1730] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)] ring-1 ring-[#ffcc4d]/40">{toast}</p>}
      </div>
    </div>
  );
}

const REDEEM_WHY: Record<NonNullable<CoinState["redeemBlocker"]>, string> = {
  "paid-plan": "You already have Premium or Plus, so there's nothing to add. Spend your Riftcoins on spins instead.",
  "this-month": "You've had your free week this month. Back on the 1st for another.",
  short: "Keep earning: check in daily, play the arcade and build your watchlist.",
};

function PremiumRedeem({ state, busy, onRedeem }: { state: CoinState; busy: boolean; onRedeem: () => void }) {
  const pct = Math.min(100, Math.round((state.riftcoins / PREMIUM_REDEEM_COST) * 100));
  const why = state.redeemBlocker;
  return (
    <section aria-labelledby="coins-premium" className="rounded-3xl border border-brand-500/30 bg-[linear-gradient(135deg,rgba(52,209,126,0.10),rgba(10,10,18,0.6))] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 id="coins-premium" className="text-lg font-extrabold text-white">
            Get a week of Premium, free
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            {PREMIUM_REDEEM_COST.toLocaleString()} Riftcoins for {PREMIUM_REDEEM_DAYS} days of every Premium tool. Once a month, for accounts without a paid plan.
          </p>
          {why !== "paid-plan" && (
            <div className="mt-3 max-w-md">
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={PREMIUM_REDEEM_COST} aria-valuenow={Math.min(state.riftcoins, PREMIUM_REDEEM_COST)} aria-label="Riftcoins towards a week of Premium">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {Math.min(state.riftcoins, PREMIUM_REDEEM_COST).toLocaleString()} / {PREMIUM_REDEEM_COST.toLocaleString()}
              </p>
            </div>
          )}
          {why && <p className="mt-2 text-xs text-slate-400">{REDEEM_WHY[why]}</p>}
        </div>
        <button
          type="button"
          onClick={onRedeem}
          disabled={!!why || busy}
          className="btn-primary w-full shrink-0 px-6 py-3 text-base disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          Redeem {PREMIUM_REDEEM_DAYS} days
        </button>
      </div>
    </section>
  );
}

/** Days lit on the streak bar: 1-7, then round again (day 8 lights one). */
function streakLit(streak: number): number {
  return streak <= 0 ? 0 : ((streak - 1) % STREAK_DAYS) + 1;
}

function Stat({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className={`rounded-xl px-3.5 py-2 ${accent ? "bg-[#ffcc4d]/15 ring-1 ring-[#ffcc4d]/40" : "bg-white/5 ring-1 ring-white/10"}`}>
      <span className={`block text-lg font-black leading-tight ${accent ? "text-[#ffcc4d]" : "text-white"}`}>{value}</span>
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
    </div>
  );
}

function Locked() {
  return (
    <div className="py-4 text-center">
      <p className="text-lg font-extrabold text-white">Sign in to collect Riftcoins</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-300">
        Earn Riftcoins by checking in, playing the arcade, building a watchlist and inviting friends. Spend them on Rift Slots for champion coins and profile badges, or on a
        free week of Premium.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2.5">
        <Link href="/login?next=/coins&src=coins" className="rounded-full bg-gradient-to-b from-[#ffe08a] to-[#e0a321] px-6 py-2.5 text-sm font-black text-[#2a1a00]">
          Sign in, free
        </Link>
      </div>
    </div>
  );
}

const SPARKS = Array.from({ length: 22 }, (_, i) => ({ a: (360 / 22) * i + (i % 3) * 7, d: 120 + ((i * 37) % 90), delay: (i % 4) * 0.03 }));

function RevealOverlay({ reveal, onClose }: { reveal: Reveal; onClose: () => void }) {
  const coin = reveal.phase === "charge" ? null : reveal.coin;
  const glow = coin ? RARITY_COLOR[coin.rarity] : "#ffcc4d";
  const shown = reveal.phase === "shown" && coin;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (reveal.phase === "shown") closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reveal.phase, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={shown ? `You won ${coin.name}` : "Spinning"}
      className="fixed inset-0 z-[85] flex flex-col items-center justify-center bg-[#05040a]/90 px-4 backdrop-blur-sm"
      onClick={onClose}
      style={{ ["--cn-glow" as string]: glow }}
    >
      {shown && coin.rarity === "legendary" && <div aria-hidden="true" className="cn-flash pointer-events-none absolute inset-0 bg-[#fff3c4]" />}
      <div className="cn-stage relative h-[260px] w-[260px] sm:h-[300px] sm:w-[300px]">
        <div aria-hidden="true" className="cn-rays absolute -inset-[60%] rounded-full" />
        <div aria-hidden="true" className="cn-halo absolute -inset-[25%] rounded-full" />
        {shown && (
          <>
            <div aria-hidden="true" className="cn-shock absolute inset-0 rounded-full" />
            {SPARKS.map((s, i) => (
              <span
                key={i}
                aria-hidden="true"
                className="cn-spark"
                style={{ ["--cn-a" as string]: `${s.a}deg`, ["--cn-d" as string]: `${s.d}px`, ["--cn-delay" as string]: `${s.delay}s` }}
              />
            ))}
          </>
        )}
        <div className={reveal.phase === "charge" ? "cn-charge absolute inset-0" : "absolute inset-0"}>
          <div className={`cn-flip h-full w-full ${reveal.phase === "charge" ? "" : "cn-flipped"}`}>
            <div className="cn-face grid place-items-center bg-[radial-gradient(circle_at_35%_30%,#fff1b8,#e0a321_45%,#7a4f0c_80%)] shadow-[0_0_60px_var(--cn-glow)]">
              <div className="grid h-[78%] w-[78%] place-items-center rounded-full bg-[radial-gradient(circle,#2a1d3d,#0d0916)] ring-4 ring-[#7a4f0c]/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/r-mark.svg" alt="" aria-hidden="true" className="h-[46%] w-[46%] opacity-90" />
              </div>
            </div>
            <div className="cn-face cn-front overflow-hidden shadow-[0_0_70px_var(--cn-glow)]">
              {coin && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coinArt(coin.id)} alt={`${coin.name} coin`} className="h-full w-full select-none" draggable={false} />
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-8 min-h-[120px] text-center">
        {shown ? (
          <>
            <p className="cn-rise text-xs font-black uppercase tracking-[0.3em]" style={{ color: glow }}>
              {RARITY_LABEL[coin.rarity]}
              {reveal.isNew ? " · New!" : ""}
            </p>
            <p className="cn-rise mt-1 font-display text-3xl font-black text-white sm:text-4xl" style={{ ["--cn-delay" as string]: "0.08s" }}>
              {coin.name}
            </p>
            <p className="cn-rise mt-1 text-sm text-slate-300" style={{ ["--cn-delay" as string]: "0.16s" }}>
              {coin.title}
              {!reveal.isNew && reveal.shards ? ` · duplicate, +${reveal.shards} shard${reveal.shards === 1 ? "" : "s"}` : ""}
            </p>
            {reveal.badge && (
              <p className="cn-rise mt-3 flex items-center justify-center gap-2 text-sm font-bold text-white" style={{ ["--cn-delay" as string]: "0.22s" }}>
                <RiftBadge badge={reveal.badge} size={36} />
                {reveal.badgeIsNew ? `New profile badge: ${reveal.badge.name}!` : `${reveal.badge.name} badge again: shards instead`}
              </p>
            )}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="cn-rise mt-5 rounded-full bg-white/10 px-6 py-2.5 text-sm font-bold text-white ring-1 ring-white/20 hover:bg-white/15"
              style={{ ["--cn-delay" as string]: "0.3s" }}
            >
              Continue
            </button>
          </>
        ) : (
          <p className="text-sm font-bold tracking-wide text-slate-300">{reveal.phase === "charge" ? "Spinning…" : ""}</p>
        )}
      </div>
    </div>
  );
}
