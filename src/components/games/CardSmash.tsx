"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { GameLoading, GameResultExtras, GameShell, RunRecap, useGameCards, useShare, type GameCard } from "./shared";

// Card Smash — whack-a-mole with Riftbound cards. Cards pop up across a 3×3 grid;
// tap them before they vanish for points (pricier cards score more — reading the
// market IS the game), but tap a 💣 and you lose a life. Three lives, 45 seconds,
// and it speeds up the longer you survive. Timer-driven (no physics), so it's
// rock-solid on touch.
const GRID = 9;
const GAME_SECONDS = 45;
const LIVES = 3;
const BOMB_CHANCE = 0.18;

type Target = { cell: number; kind: "card" | "bomb"; card?: GameCard; key: number };

const tierPts = (cents: number) => (cents >= 2000 ? 25 : cents >= 500 ? 12 : 5);

export function CardSmash() {
  const { cards, currency, error, reload } = useGameCards(40);
  const { best, record } = useBest();
  const { copied, share } = useShare();

  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [targets, setTargets] = useState<Target[]>([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [smashed, setSmashed] = useState<GameCard[]>([]);

  // Refs mirror state for the self-scheduling loops (no stale closures).
  const phaseRef = useRef(phase);
  const livesRef = useRef(lives);
  const startedAt = useRef(0);
  const roundTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const keySeq = useRef(0);
  phaseRef.current = phase;
  livesRef.current = lives;

  const stopLoops = useCallback(() => {
    if (roundTimer.current) clearTimeout(roundTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    roundTimer.current = null;
    tickTimer.current = null;
  }, []);
  useEffect(() => stopLoops, [stopLoops]);

  const endGame = useCallback(
    (finalScore: number) => {
      stopLoops();
      setTargets([]);
      setPhase("over");
      record(finalScore);
    },
    [record, stopLoops]
  );

  const spawnRound = useCallback(() => {
    if (!cards) return;
    const elapsed = (performance.now() - startedAt.current) / 1000;
    const count = elapsed < 12 ? 1 : elapsed < 28 ? 2 : 3;
    const cells = shuffle([...Array(GRID).keys()]).slice(0, count);
    const next: Target[] = cells.map((cell) => {
      if (Math.random() < BOMB_CHANCE) return { cell, kind: "bomb", key: keySeq.current++ };
      return { cell, kind: "card", card: cards[Math.floor(Math.random() * cards.length)], key: keySeq.current++ };
    });
    setTargets(next);
  }, [cards]);

  const scheduleRound = useCallback(() => {
    const elapsed = (performance.now() - startedAt.current) / 1000;
    const roundMs = Math.max(640, 1150 - elapsed * 11); // pops get faster
    roundTimer.current = setTimeout(() => {
      if (phaseRef.current !== "playing") return;
      spawnRound();
      scheduleRound();
    }, roundMs);
  }, [spawnRound]);

  const start = useCallback(() => {
    if (!cards) return;
    stopLoops();
    setScore(0);
    setLives(LIVES);
    setCombo(0);
    setSmashed([]);
    setTimeLeft(GAME_SECONDS);
    setTargets([]);
    setPhase("playing");
    startedAt.current = performance.now();
    // Countdown.
    tickTimer.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setScore((s) => { endGame(s); return s; });
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    spawnRound();
    scheduleRound();
  }, [cards, endGame, scheduleRound, spawnRound, stopLoops]);

  const tap = useCallback(
    (t: Target) => {
      if (phaseRef.current !== "playing") return;
      setTargets((cur) => cur.filter((x) => x.key !== t.key));
      if (t.kind === "bomb") {
        setCombo(0);
        setLives((l) => {
          const nl = l - 1;
          if (nl <= 0) setScore((s) => { endGame(s); return s; });
          return nl;
        });
      } else if (t.card) {
        const card = t.card;
        setCombo((c) => {
          const nc = c + 1;
          const bonus = 1 + Math.min(nc, 6) * 0.15; // light combo reward
          setScore((s) => s + Math.round(tierPts(card.priceCents) * bonus));
          return nc;
        });
        setSmashed((arr) => (arr.some((c) => c.id === card.id) ? arr : [...arr, card]));
      }
    },
    [endGame]
  );

  if (!cards) {
    return (
      <GameShell emoji="💥" title="Card Smash" tagline="Tap the cards, dodge the bombs. 45 seconds, three lives.">
        <GameLoading error={error} retry={reload} />
      </GameShell>
    );
  }

  const byCell = new Map(targets.map((t) => [t.cell, t]));

  return (
    <GameShell
      emoji="💥"
      title="Card Smash"
      tagline="Tap the cards, dodge the bombs. Pricier cards score more."
      bestLabel={`best ${best}`}
    >
      {/* HUD */}
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="font-bold text-white">⭐ {score}</span>
        <span className="text-slate-400">{"❤️".repeat(Math.max(0, lives))}{"🤍".repeat(Math.max(0, LIVES - lives))}</span>
        <span className={`font-bold tabular-nums ${timeLeft <= 10 ? "text-rose-400" : "text-slate-300"}`}>⏱ {timeLeft}s</span>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-md rounded-xl bg-ink-900 p-2">
        <div className="grid h-full grid-cols-3 grid-rows-3 gap-2">
          {Array.from({ length: GRID }).map((_, cell) => {
            const t = byCell.get(cell);
            return (
              <div key={cell} className="relative grid place-items-center rounded-lg bg-ink-850/60">
                {t && (
                  <button
                    onClick={() => tap(t)}
                    className="animate-fade-up absolute inset-0 grid place-items-center overflow-hidden rounded-lg"
                    aria-label={t.kind === "bomb" ? "bomb" : t.card?.name}
                  >
                    {t.kind === "bomb" ? (
                      <span className="grid h-full w-full place-items-center bg-rose-950/60 text-3xl">💣</span>
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={t.card!.img} alt="" aria-hidden="true" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                        <span className="absolute inset-x-0 bottom-0 bg-ink-950/70 text-center text-[10px] font-bold text-accent">
                          {formatMoney(t.card!.priceCents, currency)}
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Start / overlay */}
        {phase !== "playing" && (
          <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-ink-950/85 p-4 text-center">
            <div>
              {phase === "ready" ? (
                <>
                  <p className="text-4xl" aria-hidden>💥</p>
                  <h2 className="mt-1 text-xl font-extrabold text-white">Card Smash</h2>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-slate-300">
                    Tap cards to score (pricier = more), dodge the 💣. Three lives, 45 seconds, gets faster.
                  </p>
                  <button onClick={start} className="btn-primary mt-4">▶ Start</button>
                </>
              ) : (
                <>
                  <p className="text-3xl" aria-hidden>{lives <= 0 ? "💀" : "🏁"}</p>
                  <h2 className="mt-1 text-xl font-extrabold text-white">{lives <= 0 ? "Boom — out of lives!" : "Time!"}</h2>
                  <p className="mt-1 text-sm text-slate-300">Score <span className="font-bold text-white">{score}</span> · best {best}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <button onClick={start} className="btn-primary">▶ Play again</button>
                    <button
                      onClick={() => share(`💥 Card Smash — I scored ${score} smashing Riftbound cards!\nriftcompare.com/games/card-smash`)}
                      className="btn-ghost text-sm"
                    >
                      {copied ? "✓ Copied!" : "Share score"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">
        Combo builds with each clean hit — a bomb resets it. {combo > 1 && phase === "playing" ? `🔥 ${combo} combo` : ""}
      </p>

      {phase === "over" && (
        <div className="mx-auto max-w-md">
          <GameResultExtras game="card-smash" score={score} />
          <RunRecap cards={smashed} currency={currency} title="🛒 The cards you smashed" />
          <p className="mt-4 text-center text-xs text-slate-600">
            Real cards, real prices. <Link href="/movers" className="text-brand-400 hover:underline">See today&apos;s movers →</Link>
          </p>
        </div>
      )}
    </GameShell>
  );
}

// Local best (higher better) for Card Smash.
function useBest() {
  const [best, setBest] = useState(0);
  useEffect(() => {
    try { setBest(parseInt(localStorage.getItem("rc_game_smash_best") || "0", 10) || 0); } catch { /* fresh */ }
  }, []);
  const record = useCallback((score: number) => {
    setBest((b) => {
      const next = Math.max(b, score);
      try { localStorage.setItem("rc_game_smash_best", String(next)); } catch { /* full */ }
      return next;
    });
  }, []);
  return { best, record };
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
