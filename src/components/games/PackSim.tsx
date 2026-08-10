"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { RARITIES } from "@/lib/constants";
import { GameShell, RunRecap, cardUrl, useShare, type GameCard } from "./shared";

// Pack Opening Simulator — rip a virtual Riftbound pack built from the real card
// pool (so, like a real pack, most of it is bulk and a good hit is the payoff).
// Cards reveal one at a time, commons first and the chase card last, then the
// pack's total live value lands. It's a toy, not a contest — no leaderboard —
// but it funnels hard into the shop: every card is real, priced and wishlist-able.
type PackCard = {
  id: string;
  slug: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
  img: string;
  rarity: string;
  priceCents: number | null;
};

const rarityColor = (r: string) => RARITIES[r]?.color ?? "#9aa0aa";
const BEST_KEY = "rc_game_pack_best";

export function PackSim({ sets }: { sets: { code: string; name: string }[] }) {
  const [setCode, setSetCode] = useState(sets[0]?.code ?? "");
  const [pack, setPack] = useState<PackCard[] | null>(null);
  const [setName, setSetName] = useState("");
  const [currency, setCurrency] = useState("AUD");
  const [revealed, setRevealed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [best, setBest] = useState(0);
  const { copied, share } = useShare();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    try { setBest(parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0); } catch { /* fresh */ }
    return () => timers.current.forEach(clearTimeout);
  }, []);

  const openPack = useCallback(async () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setLoading(true);
    setError(null);
    setPack(null);
    setRevealed(0);
    try {
      const d = await fetch(`/api/games/pack?set=${encodeURIComponent(setCode)}`).then((r) => r.json());
      if (!d.cards?.length) throw new Error();
      const cards = d.cards as PackCard[];
      setPack(cards);
      setSetName(d.setName ?? "");
      setCurrency(d.currency ?? "AUD");

      // Sequential reveal: brisk through the commons, a beat before the final
      // (chase) card for suspense.
      let t = 0;
      cards.forEach((_, i) => {
        const last = i === cards.length - 1;
        t += last ? 650 : i < 8 ? 130 : 240;
        timers.current.push(setTimeout(() => setRevealed(i + 1), t));
      });

      const total = cards.reduce((s, c) => s + (c.priceCents ?? 0), 0);
      timers.current.push(
        setTimeout(() => {
          setBest((b) => {
            const next = Math.max(b, total);
            try { localStorage.setItem(BEST_KEY, String(next)); } catch { /* full */ }
            return next;
          });
        }, t + 50)
      );
    } catch {
      setError("Couldn't open a pack for this set yet — try another set.");
    } finally {
      setLoading(false);
    }
  }, [setCode]);

  const total = pack ? pack.reduce((s, c) => s + (c.priceCents ?? 0), 0) : 0;
  const bestPull = pack && pack.length ? pack.reduce((a, b) => ((b.priceCents ?? 0) > (a.priceCents ?? 0) ? b : a)) : null;
  const allRevealed = pack != null && revealed >= pack.length;

  // Map to the shared RunRecap shape (it wants a non-null price).
  const recapCards: GameCard[] = (pack ?? []).map((c) => ({
    id: c.id, slug: c.slug, name: c.name, setCode: c.setCode, collectorNumber: c.collectorNumber, img: c.img, priceCents: c.priceCents ?? 0,
  }));

  const shareText = () =>
    `🎁 I opened a ${setName || "Riftbound"} pack on RiftCompare and pulled ${formatMoney(total, currency)} of cards${
      bestPull && (bestPull.priceCents ?? 0) > 0 ? ` — best card: ${bestPull.name} (${formatMoney(bestPull.priceCents ?? 0, currency)})` : ""
    }!\nRip your own → riftcompare.com/games/pack-sim?v=${encodeURIComponent(formatMoney(total, currency))}`;

  return (
    <GameShell
      emoji="🎁"
      title="Pack Opening Simulator"
      tagline="Rip virtual Riftbound packs built from real cards and live prices."
      // The page owns the <h1> and breadcrumb here — see GameShell's `chrome`.
      chrome={false}
      bestLabel={best > 0 ? `💎 best pack ${formatMoney(best, currency)}` : undefined}
    >
      {/* Controls */}
      <div className="card-surface flex flex-wrap items-end gap-3 p-4">
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-400">Set</span>
          <select value={setCode} onChange={(e) => setSetCode(e.target.value)} className="input" disabled={loading}>
            {sets.map((s) => (
              <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
            ))}
          </select>
        </label>
        <button onClick={openPack} disabled={loading} className="btn-primary min-w-[150px] disabled:opacity-50">
          {loading ? "Opening…" : pack ? "🎁 Open another" : "🎁 Open a pack"}
        </button>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-rose-400">{error}</p>}

      {!pack && !loading && !error && (
        <div className="card-surface mt-4 grid place-items-center p-10 text-center text-sm text-slate-400">
          <p className="text-4xl" aria-hidden>🎴</p>
          <p className="mt-2">Pick a set and rip a pack. The cards and prices are 100% real — most packs are bulk, which is exactly the point.</p>
        </div>
      )}

      {pack && (
        <div className="mt-4">
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {pack.map((c, i) => {
              const isRevealed = i < revealed;
              const color = rarityColor(c.rarity);
              return (
                <div key={i} className="[perspective:800px]">
                  <div
                    className={`relative aspect-[5/7] w-full transition-transform duration-500 [transform-style:preserve-3d] ${isRevealed ? "[transform:rotateY(180deg)]" : ""}`}
                  >
                    {/* Back */}
                    <div className="absolute inset-0 grid place-items-center rounded-lg border border-ink-700 bg-gradient-to-br from-ink-800 to-ink-900 text-2xl [backface-visibility:hidden]" aria-hidden>
                      🃏
                    </div>
                    {/* Front */}
                    <Link
                      href={cardUrl(c)}
                      className="absolute inset-0 overflow-hidden rounded-lg border-2 [backface-visibility:hidden] [transform:rotateY(180deg)]"
                      style={{ borderColor: color }}
                      title={`${c.name} — ${c.rarity}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.img} alt={c.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 to-transparent px-1.5 pb-1 pt-4 text-center">
                        <span className="block truncate text-[10px] font-bold text-white">{c.name}</span>
                        <span className="block text-[10px] font-bold" style={{ color }}>
                          {c.priceCents != null ? formatMoney(c.priceCents, currency) : "bulk"}
                        </span>
                      </span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tally */}
          {allRevealed && (
            <div className="animate-fade-up mt-4">
              <div className="card-surface flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">This pack&apos;s live value</div>
                  <div className="font-display text-3xl font-extrabold text-white">{formatMoney(total, currency)}</div>
                  {bestPull && (bestPull.priceCents ?? 0) > 0 && (
                    <div className="mt-0.5 text-xs text-slate-400">
                      Best pull: <Link href={cardUrl(bestPull)} className="font-semibold text-brand-400 hover:underline">{bestPull.name}</Link> ({formatMoney(bestPull.priceCents ?? 0, currency)})
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={openPack} className="btn-primary text-sm">🎁 Open another</button>
                  <button onClick={() => share(shareText())} className="btn-ghost text-sm">{copied ? "✓ Copied!" : "Share pull"}</button>
                </div>
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-600">
                A simulator for fun — real odds aren&apos;t published. Curious whether opening actually beats buying?{" "}
                <Link href="/tools/box-ev" className="text-brand-400 hover:underline">Run the Box EV calculator →</Link>
              </p>
              <RunRecap cards={recapCards} currency={currency} title="🛒 The cards you pulled" />
            </div>
          )}
        </div>
      )}
    </GameShell>
  );
}
