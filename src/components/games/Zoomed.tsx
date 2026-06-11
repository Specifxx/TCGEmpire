"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GameLoading, GameResultExtras, GameShell, cardUrl, useBestScore, useGameCards, useShare, type GameCard } from "./shared";

// Zoomed In — name the card from a tight crop of its art. Four choices per
// round; "zoom out" once for a better look at half points. Five rounds.
const ROUNDS = 5;
const CHOICES = 4;
const PTS_FULL = 2;
const PTS_HINT = 1;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Round = { answer: GameCard; options: string[]; originX: number; originY: number };

export function Zoomed() {
  const { cards, error, reload } = useGameCards(ROUNDS * CHOICES + 4);
  const { best, record } = useBestScore("rc_game_zoom_best");
  const { copied, share } = useShare();

  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [zoomedOut, setZoomedOut] = useState(false);

  // Build all rounds once per deal: each round takes a fresh answer + 3 decoy
  // names, and a random crop origin (kept off the edges so it never shows border).
  const rounds: Round[] = useMemo(() => {
    if (!cards) return [];
    const pool = cards.slice(0, ROUNDS * CHOICES);
    const out: Round[] = [];
    for (let i = 0; i < ROUNDS && (i + 1) * CHOICES <= pool.length; i++) {
      const group = pool.slice(i * CHOICES, (i + 1) * CHOICES);
      out.push({
        answer: group[0],
        options: shuffle(group.map((c) => c.name)),
        originX: 25 + Math.random() * 50,
        originY: 20 + Math.random() * 55,
      });
    }
    return out;
  }, [cards]);

  if (!cards || rounds.length < ROUNDS) {
    return (
      <GameShell emoji="🔍" title="Zoomed In" tagline="Name the card from a tiny patch of its art.">
        <GameLoading error={error} retry={reload} />
      </GameShell>
    );
  }

  const done = round >= ROUNDS;
  const r = rounds[Math.min(round, ROUNDS - 1)];
  const maxScore = ROUNDS * PTS_FULL;

  function pick(name: string) {
    if (picked) return;
    setPicked(name);
    if (name === r.answer.name) {
      const total = score + (zoomedOut ? PTS_HINT : PTS_FULL);
      setScore(total);
      if (round + 1 >= ROUNDS) record(total);
    } else if (round + 1 >= ROUNDS) {
      record(score);
    }
  }
  function next() {
    setPicked(null);
    setZoomedOut(false);
    setRound((x) => x + 1);
  }
  function restart() {
    setRound(0); setScore(0); setPicked(null); setZoomedOut(false); reload();
  }

  return (
    <GameShell
      emoji="🔍"
      title="Zoomed In"
      tagline={`Name the card from a tiny patch of art. Zoom out once for half points. ${ROUNDS} rounds.`}
      bestLabel={`best ${best}/${maxScore}`}
    >
      {!done ? (
        <div className="card-surface p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-bold uppercase tracking-wide">Round {round + 1} of {ROUNDS}</span>
            <span>score {score}</span>
          </div>

          <div className="mt-3 flex flex-wrap items-start gap-5">
            <div className="relative h-56 w-40 shrink-0 overflow-hidden rounded-lg shadow-xl ring-1 ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.answer.img}
                alt="Mystery card art"
                width={300}
                height={420}
                className="h-full w-full object-cover transition-transform duration-500"
                style={{
                  transform: picked ? "scale(1)" : zoomedOut ? "scale(1.8)" : "scale(3.2)",
                  transformOrigin: `${r.originX}% ${r.originY}%`,
                }}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="grid gap-2">
                {r.options.map((name) => {
                  const isAnswer = name === r.answer.name;
                  const isPicked = name === picked;
                  const state = !picked ? "idle" : isAnswer ? "right" : isPicked ? "wrong" : "dim";
                  return (
                    <button
                      key={name}
                      onClick={() => pick(name)}
                      disabled={!!picked}
                      className={`rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-all ${
                        state === "idle"
                          ? "border-ink-700 bg-ink-900 text-slate-200 hover:border-brand-500/60 hover:text-white"
                          : state === "right"
                            ? "border-brand-500 bg-brand-500/20 text-brand-200"
                            : state === "wrong"
                              ? "border-rose-500 bg-rose-500/15 text-rose-300"
                              : "border-ink-800 bg-ink-900 text-slate-600"
                      }`}
                    >
                      {name} {picked && isAnswer ? "✓" : picked && isPicked ? "✕" : ""}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {!picked && !zoomedOut && (
                  <button onClick={() => setZoomedOut(true)} className="btn-ghost text-sm">
                    🔭 Zoom out (worth {PTS_HINT} instead of {PTS_FULL})
                  </button>
                )}
                {picked && (
                  <>
                    <span className={`text-sm font-bold ${picked === r.answer.name ? "text-brand-400" : "text-rose-400"}`}>
                      {picked === r.answer.name ? `+${zoomedOut ? PTS_HINT : PTS_FULL} — nice eye!` : `It's ${r.answer.name}.`}
                    </span>
                    <Link href={cardUrl(r.answer)} className="text-sm text-brand-400 hover:underline">See the card →</Link>
                    <button onClick={next} className="btn-primary ml-auto text-sm">
                      {round + 1 < ROUNDS ? "Next →" : "Final score →"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card-surface animate-fade-up p-6 text-center">
          <p className="text-3xl" aria-hidden>{score >= maxScore - 1 ? "🏆" : score >= maxScore / 2 ? "🎉" : "🖼️"}</p>
          <h2 className="mt-1 text-xl font-extrabold text-white">{score}/{maxScore}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {score >= maxScore - 1 ? "You know this art cold." : score >= maxScore / 2 ? "Sharp eye!" : "The gallery awaits — browse some cards and rematch."}{" "}
            · personal best {best}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button onClick={restart} className="btn-primary">▶ Play again</button>
            <button
              onClick={() => share(`🔍 Zoomed In — I scored ${score}/${maxScore} naming Riftbound cards from tiny art crops!\nriftcompare.com/games/zoomed`)}
              className="btn-ghost text-sm"
            >
              {copied ? "✓ Copied!" : "Share score"}
            </button>
            <Link href="/games" className="btn-ghost text-sm">More games →</Link>
          </div>
          <GameResultExtras game="zoomed" score={score} />
        </div>
      )}
    </GameShell>
  );
}
