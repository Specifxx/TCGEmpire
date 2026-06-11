"use client";

// Shared plumbing for the arcade games (/games/*): the deal-me-cards hook, a
// per-game best-score store, and the common header/footer chrome so every game
// feels like part of one arcade.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export type GameCard = {
  id: string;
  slug: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
  img: string;
  priceCents: number;
};

export function cardUrl(c: GameCard): string {
  return `/card/${c.slug ?? c.id}`;
}

// Fetch a fresh random hand of priced cards. `reload()` deals again (new game).
export function useGameCards(n: number) {
  const [cards, setCards] = useState<GameCard[] | null>(null);
  const [currency, setCurrency] = useState("AUD");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setCards(null);
    setError(null);
    fetch(`/api/games/cards?n=${n}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (!d.cards?.length) throw new Error();
        setCards(d.cards);
        setCurrency(d.currency ?? "AUD");
      })
      .catch(() => alive && setError("Couldn't deal the cards — check your connection and try again."));
    return () => {
      alive = false;
    };
  }, [n, nonce]);

  const reload = useCallback(() => setNonce((x) => x + 1), []);
  return { cards, currency, error, reload };
}

// localStorage best score (higher is better).
export function useBestScore(key: string) {
  const [best, setBest] = useState(0);
  useEffect(() => {
    try { setBest(parseInt(localStorage.getItem(key) || "0", 10) || 0); } catch { /* fresh */ }
  }, [key]);
  const record = useCallback(
    (score: number) => {
      setBest((b) => {
        const next = Math.max(b, score);
        try { localStorage.setItem(key, String(next)); } catch { /* full */ }
        return next;
      });
    },
    [key]
  );
  return { best, record };
}

export function GameShell({
  emoji,
  title,
  tagline,
  bestLabel,
  children,
}: {
  emoji: string;
  title: string;
  tagline: string;
  bestLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/games" className="hover:text-slate-300">🎮 Games</Link>
        <span>/</span>
        <span className="text-slate-300">{title}</span>
      </nav>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-white">
            <span aria-hidden>{emoji}</span> {title}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{tagline}</p>
        </div>
        {bestLabel && <div className="text-right text-xs text-slate-400">{bestLabel}</div>}
      </div>
      {children}
      <p className="mt-6 text-center text-xs text-slate-600">
        Prices are live from the stores RiftCompare tracks — every game doubles as market research.{" "}
        <Link href="/games" className="text-brand-400 hover:underline">More games →</Link>
      </p>
    </div>
  );
}

export function GameLoading({ error, retry }: { error: string | null; retry: () => void }) {
  return (
    <div className="card-surface grid min-h-[280px] place-items-center p-8 text-center">
      {error ? (
        <div>
          <p className="text-sm text-rose-400">{error}</p>
          <button onClick={retry} className="btn-primary mt-3 text-sm">Try again</button>
        </div>
      ) : (
        <div className="animate-pulse text-sm text-slate-500">Dealing the cards…</div>
      )}
    </div>
  );
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
type LeaderRow = { rank: number; name: string; score: number; isYou: boolean };
type Board = { unit: string; rows: LeaderRow[]; you: { rank: number; score: number } | null; total: number; signedIn: boolean };

// Drop into a game's result screen: submits this run's score (once), tells the
// player where they landed, prompts a sign-up if they're logged out, and shows the
// live top 10. `seconds` is an optional tiebreak (Pairs).
export function GameResultExtras({ game, score, seconds }: { game: string; score: number; seconds?: number }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [status, setStatus] = useState<"saving" | "saved" | "signin" | "error">("saving");
  const [myRank, setMyRank] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/games/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game, score, ...(seconds != null ? { seconds } : {}) }),
        });
        if (!alive) return;
        if (res.status === 401) setStatus("signin");
        else if (res.ok) { const d = await res.json(); setMyRank(d.rank ?? null); setStatus("saved"); }
        else setStatus("error");
      } catch { if (alive) setStatus("error"); }
      // Always show the board, signed in or not.
      try {
        const b = await fetch(`/api/games/leaderboard?game=${encodeURIComponent(game)}`).then((r) => r.json());
        if (alive && b?.rows) setBoard(b);
      } catch { /* leave board null */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = `/games/${game}`;
  return (
    <div className="mt-5 text-left">
      {status === "signin" ? (
        <div className="rounded-xl border border-brand-500/40 bg-brand-500/10 p-4 text-center">
          <p className="text-sm font-semibold text-white">🏆 Want on the leaderboard?</p>
          <p className="mt-1 text-xs text-slate-300">
            Create a free account to save your scores and climb the global rankings — it takes a few seconds.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Link href={`/register?next=${encodeURIComponent(next)}`} className="btn-primary text-sm">Create account</Link>
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-ghost text-sm">Sign in</Link>
          </div>
        </div>
      ) : status === "saved" && myRank != null ? (
        <p className="text-center text-sm font-semibold text-brand-300">
          ✓ Score saved — you&apos;re <span className="text-white">#{myRank}</span> on the leaderboard!
        </p>
      ) : null}

      {board && board.rows.length > 0 && (
        <div className="card-surface mt-4 overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
            <h3 className="text-sm font-bold text-white">🏆 Leaderboard</h3>
            <span className="text-[11px] text-slate-500">{board.total} {board.total === 1 ? "player" : "players"}</span>
          </div>
          <ul className="divide-y divide-ink-800">
            {board.rows.map((r) => (
              <li key={r.rank} className={`flex items-center gap-3 px-4 py-2 text-sm ${r.isYou ? "bg-brand-500/10" : ""}`}>
                <span className={`w-6 text-center font-bold ${r.rank === 1 ? "text-gold" : r.rank <= 3 ? "text-slate-300" : "text-slate-500"}`}>
                  {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank}
                </span>
                <span className={`flex-1 truncate ${r.isYou ? "font-bold text-white" : "text-slate-300"}`}>
                  {r.name}{r.isYou ? " (you)" : ""}
                </span>
                <span className="font-bold text-white">{r.score} <span className="text-[11px] font-normal text-slate-500">{board.unit}</span></span>
              </li>
            ))}
          </ul>
          {board.signedIn && board.you && !board.rows.some((r) => r.isYou) && (
            <div className="flex items-center gap-3 border-t border-ink-700 bg-brand-500/10 px-4 py-2 text-sm">
              <span className="w-6 text-center font-bold text-slate-400">#{board.you.rank}</span>
              <span className="flex-1 truncate font-bold text-white">You</span>
              <span className="font-bold text-white">{board.you.score} <span className="text-[11px] font-normal text-slate-500">{board.unit}</span></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Copy a Wordle-style share blurb.
export function useShare() {
  const [copied, setCopied] = useState(false);
  const share = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, []);
  return { copied, share };
}
