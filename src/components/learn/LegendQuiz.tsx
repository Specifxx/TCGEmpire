"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

// "Guess the domain" — a five-question mini-quiz built from REAL Legends in the
// database (card art + name; you pick the domain). Always accurate because the
// answers come straight from card data, and a fun on-ramp to Riftle.
export interface QuizLegend {
  name: string;
  img: string | null;
  domain: string;
  href: string;
}

const ROUNDS = 5;
const CHOICES = 4;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function LegendQuiz({ legends, domains }: { legends: QuizLegend[]; domains: string[] }) {
  const [gameId, setGameId] = useState(0); // bump to reshuffle
  const deck = useMemo(() => shuffle(legends).slice(0, ROUNDS), [legends, gameId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const q = deck[round];
  const options = useMemo(() => {
    if (!q) return [];
    const others = shuffle(domains.filter((d) => d !== q.domain)).slice(0, CHOICES - 1);
    return shuffle([q.domain, ...others]);
  }, [q, domains]);

  if (deck.length < ROUNDS) return null; // not enough data — hide quietly

  function pick(d: string) {
    if (picked) return;
    setPicked(d);
    if (d === q.domain) setScore((s) => s + 1);
  }
  function next() {
    setPicked(null);
    setRound((r) => r + 1);
  }
  function restart() {
    setScore(0);
    setRound(0);
    setPicked(null);
    setGameId((g) => g + 1);
  }

  // Finished?
  if (round >= ROUNDS) {
    return (
      <div className="card-surface animate-fade-up p-6 text-center">
        <p className="text-3xl" aria-hidden>{score === ROUNDS ? "🏆" : score >= 3 ? "🎉" : "📚"}</p>
        <h3 className="mt-1 text-lg font-extrabold text-white">You scored {score}/{ROUNDS}</h3>
        <p className="mt-1 text-sm text-slate-400">
          {score === ROUNDS ? "Perfect — you already think in domains." : score >= 3 ? "Solid! A few more reps and the domains are yours." : "No stress — every pro started here."}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button onClick={restart} className="btn-primary text-sm">↻ Play again</button>
          <Link href="/riftle" className="btn-ghost text-sm">Try Riftle next →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-bold uppercase tracking-wide">Question {round + 1} of {ROUNDS}</span>
        <span>score {score}</span>
      </div>

      <div key={`${gameId}-${round}`} className="animate-fade-up mt-3 flex flex-wrap items-center gap-5">
        {q.img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.img} alt="" className="h-44 w-[126px] shrink-0 rounded-lg object-cover shadow-xl ring-1 ring-white/10" loading="lazy" decoding="async" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-white">
            Which domain does <span className="text-brand-300">{q.name}</span> belong to?
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {options.map((d) => {
              const isAnswer = d === q.domain;
              const isPicked = d === picked;
              const state = !picked ? "idle" : isAnswer ? "right" : isPicked ? "wrong" : "dim";
              return (
                <button
                  key={d}
                  onClick={() => pick(d)}
                  disabled={!!picked}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition-all ${
                    state === "idle"
                      ? "border-ink-700 bg-ink-900 text-slate-200 hover:border-brand-500/60 hover:text-white"
                      : state === "right"
                        ? "scale-[1.02] border-brand-500 bg-brand-500/20 text-brand-200"
                        : state === "wrong"
                          ? "border-rose-500 bg-rose-500/15 text-rose-300"
                          : "border-ink-800 bg-ink-900 text-slate-600"
                  }`}
                >
                  {d} {picked && isAnswer ? "✓" : picked && isPicked ? "✕" : ""}
                </button>
              );
            })}
          </div>
          {picked && (
            <div className="animate-fade-up mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className={picked === q.domain ? "font-bold text-brand-300" : "font-bold text-rose-300"}>
                {picked === q.domain ? "Correct!" : `It's ${q.domain}.`}
              </span>
              <Link href={q.href} className="text-brand-400 hover:underline">See the card →</Link>
              <button onClick={next} className="btn-primary ml-auto text-sm">
                {round + 1 < ROUNDS ? "Next →" : "See score →"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
