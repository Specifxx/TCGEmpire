"use client";

import { useEffect, useState } from "react";

// Member rewards (lib/loyalty.ts, owner 2026-11-26): the member's points, daily streak, level and the rewards they can take.
// On /profile only. It asks /api/loyalty once on mount; the check-in and a reward happen only when the member presses them.
// Nothing opens by itself and nothing shows on any other page (UX guard: at most one prompt a visit, and this is not one).

type Reward = { key: string; title: string; points: number; available: boolean; reason: string | null };
type Level = { key: string; name: string; min: number };
type Me = {
  balance: number;
  lifetime: number;
  streak: number;
  checkedInToday: boolean;
  today: number;
  tomorrow: number;
  level: Level;
  next: Level | null;
  toNext: number;
  streakCap: number;
  rewards: Reward[];
  note?: string | null;
};

async function call(body: Record<string, unknown>): Promise<{ ok: boolean; j: Record<string, unknown> }> {
  const r = await fetch("/api/loyalty", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: r.ok, j: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

export function MemberRewardsCard() {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    call({})
      .then(({ ok, j }) => ok && j.ok && setMe(j as unknown as Me))
      .catch(() => {});
  }, []);

  async function act(action: "checkin" | "redeem", reward?: string) {
    setBusy(reward ?? action);
    setMsg(null);
    try {
      const { ok, j } = await call({ action, reward });
      if (ok && j.ok) {
        setMe(j as unknown as Me);
        if (typeof j.note === "string") setMsg({ ok: true, text: j.note });
      } else setMsg({ ok: false, text: typeof j.error === "string" ? j.error : "Couldn't do that. Try again." });
    } catch {
      setMsg({ ok: false, text: "Couldn't do that. Try again." });
    } finally {
      setBusy(null);
    }
  }

  if (!me) return null;
  const pct = me.next ? Math.min(100, Math.round(((me.lifetime - me.level.min) / Math.max(1, me.next.min - me.level.min)) * 100)) : 100;
  return (
    <div className="card-surface mt-5 p-5" id="rewards">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold text-white">Member rewards</h2>
        <span className="text-xs font-semibold text-amber-300">{me.level.name}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-ink-900 p-2">
          <div className="text-xl font-bold tabular-nums text-white">{me.balance}</div>
          <div className="text-[11px] text-slate-400">points</div>
        </div>
        <div className="rounded-lg bg-ink-900 p-2">
          <div className="text-xl font-bold tabular-nums text-white">{me.streak}</div>
          <div className="text-[11px] text-slate-400">day streak</div>
        </div>
        <div className="rounded-lg bg-ink-900 p-2">
          <div className="text-xl font-bold tabular-nums text-white">+{me.checkedInToday ? me.tomorrow : me.today}</div>
          <div className="text-[11px] text-slate-400">{me.checkedInToday ? "tomorrow" : "today"}</div>
        </div>
      </div>
      <button type="button" onClick={() => act("checkin")} disabled={me.checkedInToday || busy !== null} className="btn-primary mt-3 w-full">
        {me.checkedInToday ? `✓ Checked in · come back tomorrow for +${me.tomorrow}` : busy === "checkin" ? "Checking in…" : `Check in · +${me.today}`}
      </button>
      <p className="mt-2 text-xs text-slate-400">
        Day 1 of a streak is 1 point, day 2 is 2, and so on up to {me.streakCap} a day. Miss a day and it starts again at 1. Votes, flags, pulse
        answers and pull logs earn points too. The same points work on every one of our sites.
      </p>
      {me.next && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-900" aria-hidden>
            <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-400">{me.toNext} more lifetime points to {me.next.name}.</p>
        </div>
      )}
      <ul className="mt-4 space-y-2">
        {me.rewards.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-700 p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{r.title}</div>
              <div className="text-xs text-slate-400">{r.points} points{!r.available && r.reason ? ` · ${r.reason}` : ""}</div>
            </div>
            <button type="button" onClick={() => act("redeem", r.key)} disabled={!r.available || busy !== null} className="btn-ghost shrink-0 text-sm">
              {busy === r.key ? "…" : "Redeem"}
            </button>
          </li>
        ))}
      </ul>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`} role="status">{msg.text}</p>}
      <p className="mt-3 text-[11px] text-slate-500">Points have no cash value and can&apos;t be bought. Spending them never changes your giveaway tickets.</p>
    </div>
  );
}
