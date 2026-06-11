"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Feedback, RiftleCard } from "@/lib/riftle";
import { RIFTLE_HINT_GATES } from "@/lib/riftle";

// Riftle — free daily guess-the-card game. State persists per Sydney day in
// localStorage; share button copies a Wordle-style emoji grid.
type Saved = { day: string; rows: Feedback[]; done: "win" | "lose" | null; answer: RiftleCard | null; hintsUsed?: number };
type Stats = { played: number; wins: number; streak: number; lastWinDay: string | null };

const KEY = "rc_riftle";
const KEY_STATS = "rc_riftle_stats";
const COLS = ["set", "type", "domain", "rarity", "cost", "might"] as const;
const COL_LABEL: Record<(typeof COLS)[number], string> = {
  set: "Set", type: "Type", domain: "Domain", rarity: "Rarity", cost: "Cost", might: "Might",
};

function loadStats(): Stats {
  try { return JSON.parse(localStorage.getItem(KEY_STATS) || "") as Stats; } catch { return { played: 0, wins: 0, streak: 0, lastWinDay: null }; }
}

export function Riftle() {
  const [day, setDay] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(8);
  const [names, setNames] = useState<string[]>([]);
  const [rows, setRows] = useState<Feedback[]>([]);
  const [done, setDone] = useState<"win" | "lose" | null>(null);
  const [answer, setAnswer] = useState<RiftleCard | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<Stats>({ played: 0, wins: 0, streak: 0, lastWinDay: null });
  const [hints, setHints] = useState<string[]>([]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load puzzle meta + restore today's progress.
  useEffect(() => {
    fetch("/api/riftle")
      .then((r) => r.json())
      .then((d) => {
        setDay(d.day);
        setAttempts(d.attempts ?? 8);
        setNames(d.names ?? []);
        try {
          const saved = JSON.parse(localStorage.getItem(KEY) || "") as Saved;
          if (saved.day === d.day) {
            setRows(saved.rows ?? []);
            setDone(saved.done ?? null);
            setAnswer(saved.answer ?? null);
            setHintsUsed(saved.hintsUsed ?? 0);
            // Re-fetch the hint text the player had already unlocked so it shows again.
            if ((saved.hintsUsed ?? 0) > 0) loadHints();
          }
        } catch { /* fresh day */ }
        setStats(loadStats());
      })
      .catch(() => setError("Couldn't load today's puzzle — refresh to try again."));
  }, []);

  function persist(nextRows: Feedback[], nextDone: Saved["done"], nextAnswer: RiftleCard | null, nextHints = hintsUsed) {
    if (!day) return;
    try { localStorage.setItem(KEY, JSON.stringify({ day, rows: nextRows, done: nextDone, answer: nextAnswer, hintsUsed: nextHints } satisfies Saved)); } catch { /* full */ }
  }

  // Lazily fetch the hint list (kept out of the default puzzle payload). Returns the
  // hints so callers can act on them; caches into state so we only fetch once.
  async function loadHints(): Promise<string[]> {
    if (hints.length) return hints;
    try {
      const d = await fetch("/api/riftle?hints=1").then((r) => r.json());
      const list: string[] = d.hints ?? [];
      setHints(list);
      return list;
    } catch {
      return [];
    }
  }

  async function revealHint() {
    if (done || hintsUsed >= RIFTLE_HINT_GATES.length) return;
    if (rows.length < RIFTLE_HINT_GATES[hintsUsed]) return; // not unlocked yet
    await loadHints();
    const next = hintsUsed + 1;
    setHintsUsed(next);
    persist(rows, done, answer, next);
  }

  function finish(win: boolean) {
    const s = loadStats();
    const next: Stats = {
      played: s.played + 1,
      wins: s.wins + (win ? 1 : 0),
      streak: win ? s.streak + 1 : 0,
      lastWinDay: win ? day : s.lastWinDay,
    };
    try { localStorage.setItem(KEY_STATS, JSON.stringify(next)); } catch { /* full */ }
    setStats(next);
  }

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (q.length < 2) return [];
    const guessed = new Set(rows.map((r) => r.name.toLowerCase()));
    return names.filter((n) => n.toLowerCase().includes(q) && !guessed.has(n.toLowerCase())).slice(0, 8);
  }, [input, names, rows]);

  async function submit(name: string) {
    if (busy || done) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/riftle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Something went wrong"); return; }
      const nextRows = [...rows, d.feedback as Feedback];
      setRows(nextRows);
      setInput("");
      if (d.feedback.correct) {
        setDone("win"); setAnswer(d.card ?? null); persist(nextRows, "win", d.card ?? null); finish(true);
      } else if (nextRows.length >= attempts) {
        const rev = await fetch("/api/riftle?reveal=1").then((r) => r.json()).catch(() => null);
        setDone("lose"); setAnswer(rev?.card ?? null); persist(nextRows, "lose", rev?.card ?? null); finish(false);
      } else {
        persist(nextRows, null, null);
      }
    } catch {
      setError("Network hiccup — try that guess again.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function share() {
    if (!day) return;
    const grid = rows
      .map((r) => COLS.map((c) => (r.cells[c].state === "hit" ? "🟩" : r.cells[c].hint ? (r.cells[c].hint === "higher" ? "🔼" : "🔽") : "⬛")).join(""))
      .join("\n");
    const score = done === "win" ? `${rows.length}/${attempts}` : `X/${attempts}`;
    const text = `Riftle ${day} ${score}\n${grid}\nriftcompare.com/riftle`;
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  }

  const cell = (c: Feedback["cells"][(typeof COLS)[number]]) => (
    <div className={`flex h-11 items-center justify-center gap-0.5 rounded-md px-1 text-center text-[11px] font-semibold sm:text-xs ${c.state === "hit" ? "bg-brand-500/25 text-brand-200 ring-1 ring-brand-500/50" : "bg-ink-800 text-slate-300"}`}>
      <span className="truncate">{c.value}</span>
      {c.hint && <span className="text-slate-400">{c.hint === "higher" ? "▲" : "▼"}</span>}
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-white">
            🃏 Riftle <span className="chip bg-brand-500/15 text-[11px] font-bold uppercase tracking-wide text-brand-300">Daily</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">Guess the Riftbound card of the day in {attempts} tries. Free, no signup — a new card every midnight AEST.</p>
        </div>
        <div className="flex gap-3 text-center text-xs text-slate-400">
          <div><div className="text-base font-extrabold text-white">{stats.played}</div>played</div>
          <div><div className="text-base font-extrabold text-white">{stats.wins}</div>wins</div>
          <div><div className="text-base font-extrabold text-gold">🔥 {stats.streak}</div>streak</div>
        </div>
      </div>

      {/* Guess input */}
      {!done && (
        <div className="relative">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Prefer the exactly-typed name; fall back to the top suggestion.
              const exact = names.find((n) => n.toLowerCase() === input.trim().toLowerCase());
              if (exact) submit(exact);
              else if (suggestions.length) submit(suggestions[0]);
            }}
            placeholder={day ? `Guess ${rows.length + 1} of ${attempts} — type a card name…` : "Loading today's card…"}
            disabled={!day || busy}
            className="input"
            autoComplete="off"
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
              {suggestions.map((n) => (
                <li key={n}>
                  <button onClick={() => submit(n)} className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-ink-800">{n}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}

      {/* Hints + a way out to the full database for anyone who wants to explore */}
      {!done && day && (
        <div className="mt-3 space-y-2">
          {hintsUsed > 0 && hints.length > 0 && (
            <ul className="space-y-1.5">
              {hints.slice(0, hintsUsed).map((h, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg border border-gold/25 bg-gold/[0.06] px-3 py-2 text-sm text-amber-100/90">
                  <span aria-hidden>💡</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
            {hintsUsed < RIFTLE_HINT_GATES.length ? (
              rows.length >= RIFTLE_HINT_GATES[hintsUsed] ? (
                <button onClick={revealHint} className="btn-ghost text-sm">
                  💡 Reveal a hint ({hintsUsed + 1}/{RIFTLE_HINT_GATES.length})
                </button>
              ) : (
                <span className="text-xs text-slate-500">
                  💡 Next hint unlocks after {RIFTLE_HINT_GATES[hintsUsed]} {RIFTLE_HINT_GATES[hintsUsed] === 1 ? "guess" : "guesses"}
                </span>
              )
            ) : (
              <span className="text-xs text-slate-500">All hints revealed — good luck!</span>
            )}
            <Link href="/browse" className="text-sm text-brand-400 hover:underline">
              Explore every card in the database →
            </Link>
          </div>
        </div>
      )}

      {/* Board */}
      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="mb-1 grid grid-cols-[1.6fr_repeat(6,1fr)] gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <div className="text-left">Card</div>
              {COLS.map((c) => <div key={c}>{COL_LABEL[c]}</div>)}
            </div>
            <div className="space-y-1">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1.6fr_repeat(6,1fr)] gap-1">
                  <div className="flex h-11 items-center gap-2 overflow-hidden rounded-md bg-ink-900 px-2">
                    {r.imageThumbUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageThumbUrl} alt="" className="h-9 w-7 shrink-0 rounded-sm object-cover" loading="lazy" />
                    )}
                    <span className="truncate text-xs font-semibold text-white">{r.name}</span>
                  </div>
                  {COLS.map((c) => <div key={c}>{cell(r.cells[c])}</div>)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-600">🟩 exact match · ▲▼ the answer is higher / lower · guesses come from base prints only.</p>

      {/* Result */}
      {done && (
        <div className={`mt-5 rounded-xl border p-5 text-center ${done === "win" ? "border-brand-500/40 bg-brand-500/5" : "border-rose-500/30 bg-rose-500/5"}`}>
          <p className="text-lg font-extrabold text-white">
            {done === "win" ? `Got it in ${rows.length}/${attempts}! 🎉` : "Out of guesses!"}
          </p>
          {answer && (
            <div className="mt-3 flex items-center justify-center gap-3">
              {answer.imageThumbUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={answer.imageThumbUrl} alt={answer.name} className="h-24 w-[68px] rounded-md object-cover" />
              )}
              <div className="text-left">
                <div className="font-bold text-white">{answer.name}</div>
                <div className="text-xs text-slate-400">{answer.setCode} · {answer.collectorNumber} · {answer.rarity} {answer.type}</div>
                <Link href={answer.slug ? `/card/${answer.slug}` : `/card/${answer.id}`} className="mt-1 inline-block text-xs text-brand-400 hover:underline">
                  See live prices →
                </Link>
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button onClick={share} className="btn-primary">{copied ? "✓ Copied!" : "Share result"}</button>
            <Link href="/browse" className="btn-ghost text-sm">Browse all cards →</Link>
            <Link href="/learn" className="btn-ghost text-sm">Learn Riftbound →</Link>
          </div>
          <p className="mt-3 text-xs text-slate-500">New card at midnight AEST. Come back tomorrow!</p>
        </div>
      )}
    </div>
  );
}
