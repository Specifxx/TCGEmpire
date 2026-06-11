"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { GameLoading, GameResultExtras, GameShell, RunRecap, cardUrl, useBestScore, useGameCards, useShare, type GameCard } from "./shared";

// Higher or Lower — the classic streak game, with live card prices. One card's
// price is shown; guess whether the challenger costs more or less. One mistake
// ends the run. Equal prices count as correct either way (it's a coin flip, and
// the game should never feel cheap).
const DECK = 80;
const REVEAL_MS = 950;

export function HigherLower() {
  const { cards, currency, error, reload } = useGameCards(DECK);
  const { best, record } = useBestScore("rc_game_hl_best");
  const { copied, share } = useShare();

  const [pos, setPos] = useState(1); // index of the challenger card
  const [streak, setStreak] = useState(0);
  const [phase, setPhase] = useState<"guess" | "reveal" | "over" | "beat-deck">("guess");
  const [lastRight, setLastRight] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    // fresh deck → reset the run
    setPos(1); setStreak(0); setPhase("guess");
  }, [cards]);

  if (!cards) return (
    <GameShell emoji="⚖️" title="Higher or Lower" tagline="Guess which card costs more. One miss ends the run.">
      <GameLoading error={error} retry={reload} />
    </GameShell>
  );

  const known = cards[pos - 1];
  const challenger = cards[pos];

  function guess(dir: "higher" | "lower") {
    if (phase !== "guess" || !challenger) return;
    const diff = challenger.priceCents - known.priceCents;
    const right = diff === 0 || (dir === "higher" ? diff > 0 : diff < 0);
    setLastRight(right);
    setPhase("reveal");
    timer.current = setTimeout(() => {
      if (!right) {
        record(streak);
        setPhase("over");
        return;
      }
      const next = streak + 1;
      setStreak(next);
      record(next);
      if (pos + 1 >= cards!.length) setPhase("beat-deck");
      else { setPos(pos + 1); setPhase("guess"); }
    }, REVEAL_MS);
  }

  const done = phase === "over" || phase === "beat-deck";
  const shareText = () =>
    `⚖️ Higher or Lower — I ran a streak of ${phase === "beat-deck" ? streak : streak} on Riftbound card prices!\nriftcompare.com/games/higher-lower`;

  const CardPanel = ({ c, revealed, accent }: { c: GameCard; revealed: boolean; accent?: boolean }) => (
    <div className={`card-surface overflow-hidden text-center transition-all duration-300 ${accent && phase === "reveal" ? (lastRight ? "ring-2 ring-brand-500" : "ring-2 ring-rose-500") : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={c.img} alt={c.name} width={300} height={420} className="aspect-[5/7] w-full object-cover" />
      <div className="p-3">
        <div className="truncate text-sm font-bold text-white" title={c.name}>{c.name}</div>
        <div className="text-[11px] text-slate-500">{c.setCode} · {c.collectorNumber}</div>
        <div className={`mt-1.5 text-lg font-extrabold ${revealed ? "text-accent" : "text-slate-600"}`}>
          {revealed ? formatMoney(c.priceCents, currency) : "$ ?.??"}
        </div>
      </div>
    </div>
  );

  return (
    <GameShell
      emoji="⚖️"
      title="Higher or Lower"
      tagline="Guess which card costs more. One miss ends the run."
      bestLabel={`🔥 streak ${streak} · best ${best}`}
    >
      {!done ? (
        <>
          <div className="grid grid-cols-2 items-start gap-3 sm:gap-5">
            <CardPanel c={known} revealed />
            <CardPanel c={challenger} revealed={phase === "reveal"} accent />
          </div>

          <div className="mt-4 text-center">
            <p className="text-sm text-slate-400">
              Is <span className="font-semibold text-white">{challenger.name}</span> worth more or less?
            </p>
            <div className="mt-3 flex items-center justify-center gap-3">
              <button onClick={() => guess("higher")} disabled={phase !== "guess"} className="btn-primary min-w-[130px] disabled:opacity-50">
                ▲ Higher
              </button>
              <button onClick={() => guess("lower")} disabled={phase !== "guess"} className="btn-ghost min-w-[130px] disabled:opacity-50">
                ▼ Lower
              </button>
            </div>
            {phase === "reveal" && (
              <p className={`animate-fade-up mt-3 text-sm font-bold ${lastRight ? "text-brand-400" : "text-rose-400"}`}>
                {lastRight ? "Correct! 🎉" : "Ouch — wrong way."}
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="card-surface animate-fade-up p-6 text-center">
          <p className="text-3xl" aria-hidden>{phase === "beat-deck" ? "🏆" : streak >= 10 ? "🔥" : streak >= 5 ? "💪" : "🪦"}</p>
          <h2 className="mt-1 text-xl font-extrabold text-white">
            {phase === "beat-deck" ? `You beat the whole deck — streak of ${streak}!` : `Run over — streak of ${streak}`}
          </h2>
          <p className="mt-1 text-sm text-slate-400">Personal best: {best}</p>
          {phase === "over" && (
            <div className="mx-auto mt-4 flex max-w-sm items-center justify-center gap-4 text-left text-xs text-slate-400">
              <Link href={cardUrl(known)} className="hover:text-brand-400 hover:underline">
                {known.name} — {formatMoney(known.priceCents, currency)}
              </Link>
              <span className="text-slate-600">vs</span>
              <Link href={cardUrl(challenger)} className="hover:text-brand-400 hover:underline">
                {challenger.name} — {formatMoney(challenger.priceCents, currency)}
              </Link>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button onClick={reload} className="btn-primary">▶ Play again</button>
            <button onClick={() => share(shareText())} className="btn-ghost text-sm">{copied ? "✓ Copied!" : "Share streak"}</button>
            <Link href="/games" className="btn-ghost text-sm">More games →</Link>
          </div>
          <GameResultExtras game="higher-lower" score={streak} />
          <RunRecap cards={cards.slice(0, pos + 1)} currency={currency} />
        </div>
      )}
    </GameShell>
  );
}
