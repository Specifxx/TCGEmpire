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
