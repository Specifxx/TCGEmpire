"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { GameLoading, GameResultExtras, GameShell, cardUrl, useBestScore, useGameCards, useShare } from "./shared";

// Price Check — The Price Is Right, for Riftbound. Five cards; type what you
// think each one's cheapest live price is; score by closeness. Teaches market
// feel better than any guide — and every reveal links to the real price page.
const ROUNDS = 5;
const MAX_PTS = 100; // per round

function roundPoints(guessCents: number, actualCents: number): number {
  if (actualCents <= 0) return 0;
  const err = Math.abs(guessCents - actualCents) / actualCents; // 0 = perfect
  return Math.max(0, Math.round(MAX_PTS * (1 - Math.min(1, err))));
}

export function PriceCheck() {
  const { cards, currency, error, reload } = useGameCards(ROUNDS + 3);
  const { best, record } = useBestScore("rc_game_pc_best");
  const { copied, share } = useShare();

  const [round, setRound] = useState(0);
  const [input, setInput] = useState("");
  const [scores, setScores] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);

  if (!cards) return (
    <GameShell emoji="🏷️" title="Price Check" tagline="Guess each card's price — score by how close you land.">
      <GameLoading error={error} retry={reload} />
    </GameShell>
  );

  const deck = cards.slice(0, ROUNDS);
  const card = deck[Math.min(round, ROUNDS - 1)];
  const total = scores.reduce((a, b) => a + b, 0);
  const done = round >= ROUNDS;

  function submit() {
    const dollars = parseFloat(input);
    if (!Number.isFinite(dollars) || dollars < 0 || revealed) return;
    setScores((s) => [...s, roundPoints(Math.round(dollars * 100), card.priceCents)]);
    setRevealed(true);
  }
  function next() {
    setRevealed(false);
    setInput("");
    const r = round + 1;
    setRound(r);
    if (r >= ROUNDS) record(total);
  }
  function restart() {
    setRound(0); setScores([]); setInput(""); setRevealed(false); reload();
  }

  const rating =
    total >= 400 ? "Market savant 🧠" : total >= 300 ? "Sharp trader 📈" : total >= 200 ? "Getting there 👀" : "Time to browse some prices 🔍";

  return (
    <GameShell
      emoji="🏷️"
      title="Price Check"
      tagline={`Guess each card's cheapest live price (${currency}). ${ROUNDS} rounds, ${MAX_PTS} points each.`}
      bestLabel={`best ${best}/${ROUNDS * MAX_PTS}`}
    >
      {!done ? (
        <div className="card-surface p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-bold uppercase tracking-wide">Card {round + 1} of {ROUNDS}</span>
            <span>score {total}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.img} alt={card.name} width={300} height={420} className="h-56 w-40 shrink-0 rounded-lg object-cover shadow-xl ring-1 ring-white/10" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-extrabold text-white">{card.name}</h2>
              <p className="text-xs text-slate-500">{card.setCode} · {card.collectorNumber}</p>

              {!revealed ? (
                <div className="mt-4">
                  <label htmlFor="pc-guess" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Your price ({currency})
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      id="pc-guess"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submit()}
                      placeholder="e.g. 4.50"
                      className="input max-w-[160px]"
                      autoFocus
                    />
                    <button onClick={submit} disabled={input.trim() === ""} className="btn-primary disabled:opacity-50">
                      Lock it in
                    </button>
                  </div>
                </div>
              ) : (
                <div className="animate-fade-up mt-4">
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                    <span className="text-slate-400">You said <span className="font-bold text-white">{formatMoney(Math.round(parseFloat(input || "0") * 100), currency)}</span></span>
                    <span className="text-slate-400">Actual <span className="font-bold text-accent">{formatMoney(card.priceCents, currency)}</span></span>
                  </div>
                  <p className={`mt-1 text-base font-extrabold ${scores[scores.length - 1] >= 70 ? "text-brand-400" : scores[scores.length - 1] >= 35 ? "text-gold" : "text-rose-400"}`}>
                    +{scores[scores.length - 1]} points
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <button onClick={next} className="btn-primary text-sm">{round + 1 < ROUNDS ? "Next card →" : "Final score →"}</button>
                    <Link href={cardUrl(card)} className="text-sm text-brand-400 hover:underline">Compare its stores →</Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="card-surface animate-fade-up p-6 text-center">
          <p className="text-3xl" aria-hidden>{total >= 400 ? "🏆" : total >= 250 ? "🎉" : "🧾"}</p>
          <h2 className="mt-1 text-xl font-extrabold text-white">{total}/{ROUNDS * MAX_PTS}</h2>
          <p className="mt-1 text-sm text-slate-400">{rating} · personal best {best}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button onClick={restart} className="btn-primary">▶ Play again</button>
            <button
              onClick={() => share(`🏷️ Price Check — I scored ${total}/${ROUNDS * MAX_PTS} guessing Riftbound card prices!\nriftcompare.com/games/price-check`)}
              className="btn-ghost text-sm"
            >
              {copied ? "✓ Copied!" : "Share score"}
            </button>
            <Link href="/games" className="btn-ghost text-sm">More games →</Link>
          </div>
          <GameResultExtras game="price-check" score={total} />
        </div>
      )}
    </GameShell>
  );
}
