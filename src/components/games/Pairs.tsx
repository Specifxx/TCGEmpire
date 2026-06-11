"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { GameLoading, GameResultExtras, GameShell, useGameCards, useShare, type GameCard } from "./shared";

// Pairs — classic memory with real card art: 8 cards × 2 = a 4×4 grid. Fewest
// moves wins; the clock keeps you honest. Best (lowest) move count is stored
// locally — note this game's "best" is a minimum, so it has its own storage
// logic instead of useBestScore (which assumes higher = better).
const PAIRS = 8;
const MISMATCH_MS = 750;
const BEST_KEY = "rc_game_pairs_best_moves";

type Tile = { key: number; card: GameCard; state: "down" | "up" | "matched" };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Pairs() {
  const { cards, error, reload } = useGameCards(PAIRS + 2);
  const { copied, share } = useShare();

  const deck: Tile[] = useMemo(() => {
    if (!cards) return [];
    const eight = cards.slice(0, PAIRS);
    return shuffle(eight.flatMap((card, i) => [
      { key: i * 2, card, state: "down" as const },
      { key: i * 2 + 1, card, state: "down" as const },
    ]));
  }, [cards]);

  const [tiles, setTiles] = useState<Tile[]>([]);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    setTiles(deck);
    setMoves(0);
    setSeconds(0);
    lock.current = false;
  }, [deck]);

  useEffect(() => {
    try {
      const b = parseInt(localStorage.getItem(BEST_KEY) || "", 10);
      if (Number.isFinite(b)) setBest(b);
    } catch { /* fresh */ }
  }, []);

  const won = tiles.length > 0 && tiles.every((t) => t.state === "matched");
  const started = moves > 0;

  // Tick the clock while a game is live.
  useEffect(() => {
    if (!started || won) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [started, won]);

  // Record the best (lowest) move count on win.
  useEffect(() => {
    if (!won) return;
    setBest((b) => {
      const next = b == null ? moves : Math.min(b, moves);
      try { localStorage.setItem(BEST_KEY, String(next)); } catch { /* full */ }
      return next;
    });
  }, [won, moves]);

  if (!cards) return (
    <GameShell emoji="🧠" title="Pairs" tagline="Match the card art from memory — fewest moves wins.">
      <GameLoading error={error} retry={reload} />
    </GameShell>
  );

  function flip(idx: number) {
    if (lock.current) return;
    const t = tiles[idx];
    if (!t || t.state !== "down") return;

    const up = tiles.filter((x) => x.state === "up");
    const next = tiles.map((x, i) => (i === idx ? { ...x, state: "up" as const } : x));
    setTiles(next);

    if (up.length === 1) {
      setMoves((m) => m + 1);
      const a = up[0];
      if (a.card.id === t.card.id) {
        setTiles((cur) => cur.map((x) => (x.card.id === t.card.id ? { ...x, state: "matched" } : x)));
      } else {
        lock.current = true;
        setTimeout(() => {
          setTiles((cur) => cur.map((x) => (x.state === "up" ? { ...x, state: "down" } : x)));
          lock.current = false;
        }, MISMATCH_MS);
      }
    }
  }

  const mm = String(Math.floor(seconds / 60));
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <GameShell
      emoji="🧠"
      title="Pairs"
      tagline="Match the card art from memory — fewest moves wins."
      bestLabel={`moves ${moves} · ⏱ ${mm}:${ss}${best != null ? ` · best ${best}` : ""}`}
    >
      {!won ? (
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {tiles.map((t, i) => {
            const up = t.state !== "down";
            return (
              <button
                key={t.key}
                onClick={() => flip(i)}
                disabled={up}
                aria-label={up ? t.card.name : "Face-down card"}
                className={`relative aspect-[5/7] overflow-hidden rounded-lg ring-1 transition-all duration-300 ${
                  t.state === "matched"
                    ? "opacity-90 ring-brand-500/60"
                    : up
                      ? "ring-white/20"
                      : "ring-ink-700 hover:-translate-y-0.5 hover:ring-brand-500/50"
                }`}
                style={{ transform: up ? undefined : undefined }}
              >
                {up ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.card.img} alt="" width={300} height={420} className="animate-fade-up h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center bg-gradient-to-br from-ink-850 to-ink-900">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-base font-extrabold text-brand-400">R</span>
                  </span>
                )}
                {t.state === "matched" && (
                  <span className="absolute right-1 top-1 rounded-full bg-brand-500 px-1.5 text-[10px] font-extrabold text-ink-950">✓</span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="card-surface animate-fade-up p-6 text-center">
          <p className="text-3xl" aria-hidden>{moves <= 12 ? "🏆" : moves <= 18 ? "🎉" : "🧠"}</p>
          <h2 className="mt-1 text-xl font-extrabold text-white">Cleared in {moves} moves · {mm}:{ss}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {moves <= 12 ? "Photographic memory!" : moves <= 18 ? "Solid recall." : "The art's worth a second look anyway."}
            {best != null && <> · best {best} moves</>}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button onClick={reload} className="btn-primary">▶ Play again</button>
            <button
              onClick={() => share(`🧠 Pairs — I matched all ${PAIRS} Riftbound cards in ${moves} moves (${mm}:${ss})!\nriftcompare.com/games/pairs`)}
              className="btn-ghost text-sm"
            >
              {copied ? "✓ Copied!" : "Share"}
            </button>
            <Link href="/games" className="btn-ghost text-sm">More games →</Link>
          </div>
          <GameResultExtras game="pairs" score={moves} seconds={seconds} />
        </div>
      )}
    </GameShell>
  );
}
