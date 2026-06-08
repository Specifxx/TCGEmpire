"use client";

import { useState } from "react";
import {
  AWARDS,
  CHECKIN,
  LEVELS,
  REWARDS,
  SHARD,
  type Level,
  type Reward,
  type RewardKind,
  meetsLevel,
  rewardByKey,
} from "@/lib/points-config";

// The serialisable shape returned by getPointsState().
export interface PointsState {
  points: number;
  lifetimePoints: number;
  level: Level;
  next: Level | null;
  progress: { pct: number; remaining: number };
  streakDays: number;
  canCheckIn: boolean;
  nextCheckinReward: number | null;
  owned: string[];
  equippedFlair: string | null;
  equippedBadge: string | null;
  emailVerified: boolean;
  ledger: { delta: number; reason: string; createdAt: string }[];
}

const KIND_TITLE: Record<RewardKind, string> = {
  flair: "Name flair",
  badge: "Badges",
  perk: "Feature unlocks",
  experience: "Personalised experiences",
};
const KIND_ORDER: RewardKind[] = ["badge", "flair", "perk", "experience"];

function shard(n: number) {
  return `${SHARD.glyph} ${n.toLocaleString()}`;
}

function levelByKey(key?: string): Level | undefined {
  return LEVELS.find((l) => l.key === key);
}

function reasonLabel(reason: string): string {
  if (reason === "checkin") return "Daily check-in";
  if (reason === "welcome") return "Welcome bonus";
  if (reason === "verify_email") return "Confirmed email";
  if (reason.startsWith("redeem:")) {
    const r = rewardByKey(reason.slice(7));
    return r ? `Redeemed — ${r.name}` : "Redeemed a reward";
  }
  return (AWARDS as Record<string, { label: string }>)[reason]?.label ?? reason;
}

function LevelMedal({ level, size = "md" }: { level: Level; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "h-16 w-16 text-2xl" : "h-9 w-9 text-base";
  return (
    <span
      className={`grid ${dim} shrink-0 place-items-center rounded-2xl font-display font-black`}
      style={{ background: level.bg, color: level.color, boxShadow: `inset 0 0 0 1.5px ${level.color}55` }}
      title={`${level.name} — ${level.blurb}`}
    >
      {SHARD.glyph}
    </span>
  );
}

// ── Signed-in interactive dashboard ──────────────────────────────────────────
export function RewardsDashboard({ initial }: { initial: PointsState }) {
  const [state, setState] = useState<PointsState>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 4000);
  }

  async function checkin() {
    setBusy("checkin");
    try {
      const res = await fetch("/api/points/checkin", { method: "POST" });
      const data = await res.json();
      if (data.state) setState(data.state);
      if (data.ok) flash("ok", `Checked in! +${shard(data.reward)} · ${data.streak}-day streak 🔥`);
      else if (data.already) flash("err", "You've already checked in today — come back tomorrow!");
    } catch {
      flash("err", "Check-in failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function redeem(reward: Reward) {
    let note: string | undefined;
    if (reward.kind === "experience") {
      const input = window.prompt(
        `Redeem “${reward.name}” for ${shard(reward.cost)}?\n\nOptionally add a note (e.g. a link to your deck) so we can action it:`,
        ""
      );
      if (input === null) return; // cancelled
      note = input.trim() || undefined;
    } else if (!window.confirm(`Redeem “${reward.name}” for ${shard(reward.cost)}?`)) {
      return;
    }
    setBusy(reward.key);
    try {
      const res = await fetch("/api/points/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardKey: reward.key, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash("err", data.error ?? "Couldn't redeem that.");
        return;
      }
      setState(data.state);
      flash(
        "ok",
        reward.kind === "experience"
          ? `Redeemed “${reward.name}” — we'll be in touch by email to set it up.`
          : `Unlocked “${reward.name}”! ${reward.kind !== "perk" ? "Equipped and ready." : "It's now active."}`
      );
    } catch {
      flash("err", "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function equip(slot: "flair" | "badge", rewardKey: string | null) {
    setBusy(rewardKey ?? `un-${slot}`);
    try {
      const res = await fetch("/api/points/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, rewardKey }),
      });
      const data = await res.json();
      if (data.state) setState(data.state);
    } catch {
      flash("err", "Couldn't update that. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const pct = Math.round(state.progress.pct * 100);

  return (
    <div>
      {/* Header */}
      <header className="card-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <LevelMedal level={state.level} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-extrabold text-white">{state.level.name}</h1>
                {state.streakDays > 0 && (
                  <span className="chip bg-orange-500/15 text-orange-300">🔥 {state.streakDays}-day streak</span>
                )}
              </div>
              <p className="text-sm text-slate-400">{state.level.blurb}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-extrabold text-accent">{shard(state.points)}</div>
            <div className="text-xs text-slate-500">Lifetime {shard(state.lifetimePoints)}</div>
          </div>
        </div>

        {/* Progress to next level */}
        {state.next ? (
          <div className="mt-5">
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>{state.level.name}</span>
              <span>{shard(state.progress.remaining)} to {state.next.name}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-ink-800">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm font-semibold text-brand-300">You&apos;ve reached the top level — legend. {SHARD.glyph}</p>
        )}

        {/* Daily check-in */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-950/40 p-4">
          <div>
            <div className="font-semibold text-white">Daily check-in</div>
            <div className="text-xs text-slate-400">
              {state.canCheckIn
                ? `Claim ${shard(state.nextCheckinReward ?? CHECKIN.base)} today — streaks earn more, with a bonus every 7 days.`
                : "Claimed today. Come back tomorrow to grow your streak!"}
            </div>
          </div>
          <button onClick={checkin} disabled={!state.canCheckIn || busy === "checkin"} className="btn-primary disabled:opacity-50">
            {state.canCheckIn ? (busy === "checkin" ? "Claiming…" : `Check in · +${shard(state.nextCheckinReward ?? CHECKIN.base)}`) : "Checked in ✓"}
          </button>
        </div>
      </header>

      {msg && (
        <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${msg.kind === "ok" ? "border-brand-500/40 bg-brand-500/10 text-brand-200" : "border-rose-500/40 bg-rose-500/10 text-rose-200"}`}>
          {msg.text}
        </div>
      )}

      {/* Ways to earn */}
      <section className="card-surface mt-5 p-5">
        <h2 className="font-bold text-white">Ways to earn {SHARD.name}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          <EarnRow label="Daily check-in (grows with your streak)" amount={`+${CHECKIN.base}–${CHECKIN.base + CHECKIN.maxStreakBonus + CHECKIN.weeklyBonus}`} />
          {Object.entries(AWARDS).map(([key, cfg]) => (
            <EarnRow key={key} label={cfg.label + (cfg.dailyCap ? ` (up to ${cfg.dailyCap}/day)` : cfg.oneTime ? " (one-time)" : "")} amount={`+${cfg.amount}`} />
          ))}
        </ul>
      </section>

      {/* Shop */}
      {KIND_ORDER.map((kind) => (
        <section key={kind} className="mt-6">
          <h2 className="mb-3 font-display text-lg font-bold text-white">{KIND_TITLE[kind]}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {REWARDS.filter((r) => r.kind === kind).map((reward) => (
              <RewardCard
                key={reward.key}
                reward={reward}
                state={state}
                busy={busy}
                onRedeem={() => redeem(reward)}
                onEquip={equip}
              />
            ))}
          </div>
        </section>
      ))}

      {/* History */}
      <section className="card-surface mt-6 p-5">
        <h2 className="font-bold text-white">Recent activity</h2>
        {state.ledger.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No activity yet — check in above to get started.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-800">
            {state.ledger.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-slate-300">{reasonLabel(l.reason)}</span>
                <span className="flex items-center gap-3">
                  <span className={`font-semibold ${l.delta >= 0 ? "text-brand-300" : "text-rose-300"}`}>
                    {l.delta >= 0 ? "+" : ""}{l.delta}
                  </span>
                  <span className="shrink-0 text-xs text-slate-600">
                    {new Date(l.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EarnRow({ label, amount }: { label: string; amount: string }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-ink-900/50 px-3 py-2 text-sm">
      <span className="text-slate-300">{label}</span>
      <span className="shrink-0 font-semibold text-brand-300">{SHARD.glyph} {amount}</span>
    </li>
  );
}

function RewardCard({
  reward,
  state,
  busy,
  onRedeem,
  onEquip,
}: {
  reward: Reward;
  state: PointsState;
  busy: string | null;
  onRedeem: () => void;
  onEquip: (slot: "flair" | "badge", key: string | null) => void;
}) {
  const isCosmetic = reward.kind === "flair" || reward.kind === "badge";
  const owned = state.owned.includes(reward.key);
  const equipped = state.equippedFlair === reward.key || state.equippedBadge === reward.key;
  const levelOk = meetsLevel(state.lifetimePoints, reward.minLevel);
  const needEmail = !!reward.needsEmail && !state.emailVerified;
  const affordable = state.points >= reward.cost;
  const thisBusy = busy === reward.key;

  return (
    <div className="card-surface flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {reward.kind === "badge" && reward.display && <span className="text-lg">{reward.display}</span>}
            <h3 className="font-semibold text-white">{reward.name}</h3>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{reward.description}</p>
        </div>
        <span className="chip shrink-0 bg-ink-800 font-bold text-accent">{SHARD.glyph} {reward.cost}</span>
      </div>

      {reward.kind === "flair" && reward.display && (
        <span className="self-start chip bg-brand-500/15 text-brand-300">{reward.display}</span>
      )}

      <div className="mt-auto pt-1">
        {owned && isCosmetic ? (
          <div className="flex gap-2">
            {equipped ? (
              <button
                onClick={() => onEquip(reward.kind as "flair" | "badge", null)}
                disabled={!!busy}
                className="btn-ghost flex-1 text-sm disabled:opacity-50"
              >
                Equipped ✓ · Unequip
              </button>
            ) : (
              <button
                onClick={() => onEquip(reward.kind as "flair" | "badge", reward.key)}
                disabled={!!busy}
                className="btn-primary flex-1 text-sm disabled:opacity-50"
              >
                Equip
              </button>
            )}
          </div>
        ) : owned ? (
          <span className="chip bg-brand-500/15 text-brand-300">Unlocked ✓</span>
        ) : !levelOk ? (
          <button disabled className="btn-ghost w-full cursor-not-allowed text-sm opacity-60">
            🔒 Reach {levelByKey(reward.minLevel)?.name ?? "a higher level"}
          </button>
        ) : (
          <button
            onClick={onRedeem}
            disabled={!affordable || needEmail || thisBusy}
            title={needEmail ? "Confirm your email first" : !affordable ? "Not enough Shards yet" : undefined}
            className="btn-primary w-full text-sm disabled:opacity-50"
          >
            {thisBusy ? "Redeeming…" : needEmail ? "Confirm email first" : affordable ? "Redeem" : `Need ${SHARD.glyph} ${reward.cost}`}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Read-only catalogue for signed-out visitors ──────────────────────────────
export function RewardCatalogPreview() {
  return (
    <>
      <section className="card-surface mt-5 p-5">
        <h2 className="font-bold text-white">Level up as you go</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <span key={l.key} className="chip font-bold" style={{ background: l.bg, color: l.color }}>
              {l.name} · {l.min.toLocaleString()}+
            </span>
          ))}
        </div>
      </section>
      {KIND_ORDER.map((kind) => (
        <section key={kind} className="mt-6">
          <h2 className="mb-3 font-display text-lg font-bold text-white">{KIND_TITLE[kind]}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {REWARDS.filter((r) => r.kind === kind).map((reward) => (
              <div key={reward.key} className="card-surface flex items-start justify-between gap-2 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    {reward.kind === "badge" && reward.display && <span className="text-lg">{reward.display}</span>}
                    <h3 className="font-semibold text-white">{reward.name}</h3>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{reward.description}</p>
                </div>
                <span className="chip shrink-0 bg-ink-800 font-bold text-accent">{SHARD.glyph} {reward.cost}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
