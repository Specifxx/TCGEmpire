"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
// Import from the server-free shared module — importing the VALUE RIFTLE_HINT_GATES
// from "@/lib/riftle" dragged prisma into this client bundle and crashed the page
// at load (uncatchable by error boundaries). See lib/riftle-shared.ts.
import type { Feedback, RiftleCard } from "@/lib/riftle-shared";
import { RIFTLE_HINT_GATES } from "@/lib/riftle-shared";

// Riftle — free guess-the-card game with two modes:
//   • Daily: one card per Sydney day, shared by everyone; progress + streak persist.
//   • Unlimited: an endless run of random cards (its own stats), so you can keep
//     playing after the daily is done.
// Each game's answer is resolved server-side from a seed, so it never reaches the
// client. State persists in localStorage; the share button copies an emoji grid.
type Mode = "daily" | "unlimited";
type SavedDaily = { day: string; rows: Feedback[]; done: "win" | "lose" | null; answer: RiftleCard | null; hintsUsed?: number };
type SavedUnlimited = { seed: string; rows: Feedback[]; done: "win" | "lose" | null; answer: RiftleCard | null; hintsUsed?: number };
type Stats = { played: number; wins: number; streak: number; lastWinDay: string | null };

const KEY = "rc_riftle";
const KEY_STATS = "rc_riftle_stats";
const KEY_U = "rc_riftle_unlimited";
const KEY_U_STATS = "rc_riftle_unlimited_stats";
const KEY_MODE = "rc_riftle_mode";
const COLS = ["set", "num", "type", "domain", "rarity", "cost", "might"] as const;
const COL_LABEL: Record<(typeof COLS)[number], string> = {
  set: "Set", num: "#", type: "Type", domain: "Domain", rarity: "Rarity", cost: "Cost", might: "Might",
};

const EMPTY_STATS: Stats = { played: 0, wins: 0, streak: 0, lastWinDay: null };
function loadStatsFrom(key: string): Stats {
  // Validate the parsed shape: JSON.parse("null"/"5"/"true") returns a non-object
  // WITHOUT throwing, and returning that would make the render read `.played` on a
  // primitive and crash the whole page. Coerce anything unexpected to empty stats.
  try {
    const v = JSON.parse(localStorage.getItem(key) || "") as Partial<Stats> | null;
    if (!v || typeof v !== "object") return { ...EMPTY_STATS };
    return {
      played: Number(v.played) || 0,
      wins: Number(v.wins) || 0,
      streak: Number(v.streak) || 0,
      lastWinDay: typeof v.lastWinDay === "string" ? v.lastWinDay : null,
    };
  } catch {
    return { ...EMPTY_STATS };
  }
}
function genSeed(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

export function Riftle() {
  const [day, setDay] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(8);
  const [names, setNames] = useState<string[]>([]);

  const [mode, setMode] = useState<Mode>("daily");
  const [seed, setSeed] = useState<string | null>(null); // current Unlimited game's seed

  const [rows, setRows] = useState<Feedback[]>([]);
  const [done, setDone] = useState<"win" | "lose" | null>(null);
  const [answer, setAnswer] = useState<RiftleCard | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [hintsUsed, setHintsUsed] = useState(0);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<Stats>({ ...EMPTY_STATS });
  const [uStats, setUStats] = useState<Stats>({ ...EMPTY_STATS });
  const inputRef = useRef<HTMLInputElement>(null);

  // Load puzzle meta, restore the daily game, then re-open whichever mode was last used.
  useEffect(() => {
    fetch("/api/riftle")
      .then((r) => r.json())
      .then((d) => {
        setDay(d.day);
        setAttempts(d.attempts ?? 8);
        setNames(d.names ?? []);
        setStats(loadStatsFrom(KEY_STATS));
        setUStats(loadStatsFrom(KEY_U_STATS));

        // Restore today's daily progress into the board by default.
        let restoredDailyHints = 0;
        try {
          const saved = JSON.parse(localStorage.getItem(KEY) || "") as SavedDaily;
          if (saved.day === d.day) {
            setRows(saved.rows ?? []);
            setDone(saved.done ?? null);
            setAnswer(saved.answer ?? null);
            setHintsUsed(saved.hintsUsed ?? 0);
            restoredDailyHints = saved.hintsUsed ?? 0;
          }
        } catch { /* fresh day */ }

        // If the player was last in Unlimited mode, switch them back into it.
        const lastMode = (localStorage.getItem(KEY_MODE) as Mode) || "daily";
        if (lastMode === "unlimited") {
          openUnlimited();
        } else if (restoredDailyHints > 0) {
          fetchHints(null).then(setHints);
        }
      })
      .catch(() => setError("Couldn't load today's puzzle — refresh to try again."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the active game to its mode's slot.
  function persist(nextRows: Feedback[], nextDone: "win" | "lose" | null, nextAnswer: RiftleCard | null, nextHints = hintsUsed) {
    try {
      if (mode === "unlimited") {
        if (!seed) return;
        localStorage.setItem(KEY_U, JSON.stringify({ seed, rows: nextRows, done: nextDone, answer: nextAnswer, hintsUsed: nextHints } satisfies SavedUnlimited));
      } else {
        if (!day) return;
        localStorage.setItem(KEY, JSON.stringify({ day, rows: nextRows, done: nextDone, answer: nextAnswer, hintsUsed: nextHints } satisfies SavedDaily));
      }
    } catch { /* storage full */ }
  }

  // Fetch the hint list for a given game (null seed = daily). No state read, so it's
  // safe to call right after a mode switch where `seed`/`mode` haven't settled yet.
  async function fetchHints(forSeed: string | null): Promise<string[]> {
    const qs = forSeed ? `?hints=1&seed=${encodeURIComponent(forSeed)}` : "?hints=1";
    try { return (await fetch(`/api/riftle${qs}`).then((r) => r.json())).hints ?? []; } catch { return []; }
  }

  async function revealHint() {
    if (done || hintsUsed >= RIFTLE_HINT_GATES.length) return;
    if (rows.length < RIFTLE_HINT_GATES[hintsUsed]) return; // not unlocked yet
    if (hints.length === 0) setHints(await fetchHints(mode === "unlimited" ? seed : null));
    const next = hintsUsed + 1;
    setHintsUsed(next);
    persist(rows, done, answer, next);
  }

  function resetBoard() {
    setRows([]); setDone(null); setAnswer(null); setHints([]); setHintsUsed(0); setInput(""); setError(null);
  }

  // Start a brand-new Unlimited game (random seed).
  function startUnlimited() {
    const s = genSeed();
    setMode("unlimited");
    setSeed(s);
    resetBoard();
    try {
      localStorage.setItem(KEY_MODE, "unlimited");
      localStorage.setItem(KEY_U, JSON.stringify({ seed: s, rows: [], done: null, answer: null, hintsUsed: 0 } satisfies SavedUnlimited));
    } catch { /* storage full */ }
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  // Enter Unlimited mode, resuming an in-progress game if there is one.
  function openUnlimited() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY_U) || "") as SavedUnlimited;
      if (saved?.seed) {
        setMode("unlimited");
        setSeed(saved.seed);
        setRows(saved.rows ?? []);
        setDone(saved.done ?? null);
        setAnswer(saved.answer ?? null);
        setHintsUsed(saved.hintsUsed ?? 0);
        setHints([]);
        setInput(""); setError(null);
        try { localStorage.setItem(KEY_MODE, "unlimited"); } catch { /* full */ }
        if ((saved.hintsUsed ?? 0) > 0) fetchHints(saved.seed).then(setHints);
        return;
      }
    } catch { /* none saved */ }
    startUnlimited();
  }

  // Enter Daily mode, restoring today's progress.
  function openDaily() {
    setMode("daily");
    setSeed(null);
    try { localStorage.setItem(KEY_MODE, "daily"); } catch { /* full */ }
    let used = 0;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "") as SavedDaily;
      if (saved.day === day) {
        setRows(saved.rows ?? []); setDone(saved.done ?? null); setAnswer(saved.answer ?? null);
        setHintsUsed(saved.hintsUsed ?? 0); used = saved.hintsUsed ?? 0;
      } else { resetBoard(); }
    } catch { resetBoard(); }
    setHints([]);
    setInput(""); setError(null);
    if (used > 0) fetchHints(null).then(setHints);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === "unlimited") openUnlimited();
    else openDaily();
  }

  function finish(win: boolean) {
    if (mode === "unlimited") {
      const s = loadStatsFrom(KEY_U_STATS);
      const nx: Stats = { played: s.played + 1, wins: s.wins + (win ? 1 : 0), streak: win ? s.streak + 1 : 0, lastWinDay: s.lastWinDay };
      try { localStorage.setItem(KEY_U_STATS, JSON.stringify(nx)); } catch { /* full */ }
      setUStats(nx);
    } else {
      const s = loadStatsFrom(KEY_STATS);
      const nx: Stats = { played: s.played + 1, wins: s.wins + (win ? 1 : 0), streak: win ? s.streak + 1 : 0, lastWinDay: win ? day : s.lastWinDay };
      try { localStorage.setItem(KEY_STATS, JSON.stringify(nx)); } catch { /* full */ }
      setStats(nx);
    }
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
        body: JSON.stringify(mode === "unlimited" && seed ? { name, seed } : { name }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Something went wrong"); return; }
      const nextRows = [...rows, d.feedback as Feedback];
      setRows(nextRows);
      setInput("");
      if (d.feedback.correct) {
        setDone("win"); setAnswer(d.card ?? null); persist(nextRows, "win", d.card ?? null); finish(true);
      } else if (nextRows.length >= attempts) {
        const revealUrl = mode === "unlimited" && seed ? `/api/riftle?reveal=1&seed=${encodeURIComponent(seed)}` : "/api/riftle?reveal=1";
        const rev = await fetch(revealUrl).then((r) => r.json()).catch(() => null);
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
    const grid = rows
      // A cell can be missing on rows saved before a column ("#") was added — fall
      // back to a blank square instead of throwing on `.state` of undefined.
      .map((r) => COLS.map((c) => { const cell = r.cells[c]; return !cell ? "⬜" : cell.state === "hit" ? "🟩" : cell.hint ? (cell.hint === "higher" ? "🔼" : "🔽") : "⬛"; }).join(""))
      .join("\n");
    const score = done === "win" ? `${rows.length}/${attempts}` : `X/${attempts}`;
    const tag = mode === "unlimited" ? "Riftle ∞" : `Riftle ${day}`;
    // Daily shares carry ?r=<result> so the link unfurls with a custom OG card
    // (see app/riftle/generateMetadata). Unlimited has no shared answer → plain link.
    const url =
      mode === "unlimited"
        ? "riftcompare.com/riftle"
        : `riftcompare.com/riftle?r=${done === "win" ? rows.length : "x"}`;
    // The streak is the most motivating (and viral) line in a Wordle-style share.
    // "win streak" (not "day streak"): it counts consecutive WINS and only resets on a
    // loss — skipped days preserve it, so it isn't a consecutive-calendar-day streak.
    const streakLine = mode !== "unlimited" && done === "win" && stats.streak > 1 ? `🔥 ${stats.streak} win streak\n` : "";
    const text = `${tag} ${score}\n${streakLine}${grid}\n${url}`;
    const flash = () => { setCopied(true); setTimeout(() => setCopied(false), 1800); };
    // Native share sheet on mobile (better on the platforms people actually share to);
    // clipboard fallback everywhere else.
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ text }).then(flash).catch(() => { navigator.clipboard?.writeText(text).then(flash); });
    } else {
      navigator.clipboard?.writeText(text).then(flash);
    }
  }

  const shownStats = mode === "unlimited" ? uStats : stats;
  const ready = mode === "unlimited" ? !!seed : !!day;

  // `c` can be undefined for rows saved before a column was added (e.g. "#") —
  // render a neutral placeholder instead of crashing the restored game.
  const cell = (c: Feedback["cells"][(typeof COLS)[number]] | undefined) =>
    c ? (
      <div className={`flex h-11 items-center justify-center gap-0.5 rounded-md px-1 text-center text-[11px] font-semibold sm:text-xs ${c.state === "hit" ? "bg-brand-500/25 text-brand-200 ring-1 ring-brand-500/50" : "bg-ink-800 text-slate-300"}`}>
        <span className="truncate">{c.value}</span>
        {c.hint && <span className="text-slate-400">{c.hint === "higher" ? "▲" : "▼"}</span>}
      </div>
    ) : (
      <div className="flex h-11 items-center justify-center rounded-md bg-ink-800 text-[11px] text-slate-600">—</div>
    );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-white">
            🃏 Riftle{" "}
            <span className="chip bg-brand-500/15 text-[11px] font-bold uppercase tracking-wide text-brand-300">
              {mode === "unlimited" ? "Unlimited" : "Daily"}
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {mode === "unlimited"
              ? `Guess a random Riftbound card in ${attempts} tries — play as many as you like.`
              : `Guess the Riftbound card of the day in ${attempts} tries. A new card every midnight Sydney time.`}
          </p>
        </div>
        <div className="flex items-center gap-3 text-center text-xs text-slate-400">
          <Link href="/games" className="btn-ghost text-xs">🎮 More games</Link>
          <div><div className="text-base font-extrabold text-white">{shownStats.played}</div>played</div>
          <div><div className="text-base font-extrabold text-white">{shownStats.wins}</div>wins</div>
          <div><div className="text-base font-extrabold text-gold">🔥 {shownStats.streak}</div>streak</div>
        </div>
      </div>

      {/* Mode toggle + (Unlimited) new-game */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-ink-700 bg-ink-900 p-0.5 text-sm">
          <button
            onClick={() => switchMode("daily")}
            className={`rounded-md px-3 py-1.5 font-semibold transition-colors ${mode === "daily" ? "bg-brand-500/20 text-brand-200" : "text-slate-400 hover:text-white"}`}
          >
            Daily
          </button>
          <button
            onClick={() => switchMode("unlimited")}
            className={`rounded-md px-3 py-1.5 font-semibold transition-colors ${mode === "unlimited" ? "bg-brand-500/20 text-brand-200" : "text-slate-400 hover:text-white"}`}
          >
            ♾️ Unlimited
          </button>
        </div>
        {/* Skip the current card any time — abandoning mid-game doesn't count a loss. */}
        {mode === "unlimited" && !done && (
          <button onClick={startUnlimited} disabled={busy} className="btn-ghost text-sm" title="Deal a fresh card">
            ↻ New game
          </button>
        )}
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
              const exact = names.find((n) => n.toLowerCase() === input.trim().toLowerCase());
              if (exact) submit(exact);
              else if (suggestions.length) submit(suggestions[0]);
            }}
            placeholder={ready ? `Guess ${rows.length + 1} of ${attempts} — type a card name…` : "Loading…"}
            disabled={!ready || busy}
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
      {error && <p role="alert" className="mt-2 text-sm text-rose-400">{error}</p>}

      {/* Hints + a way out to the full database for anyone who wants to explore */}
      {!done && ready && (
        <div className="mt-3 space-y-2">
          {hintsUsed > 0 && hints.length > 0 && (
            <ul className="space-y-1.5">
              {hints.slice(0, hintsUsed).map((h, i) => {
                // The final hint is a straight giveaway: the card's own art, sent
                // as "IMG:<url>" so it renders as an image rather than text.
                const imgSrc = h.startsWith("IMG:") ? h.slice(4) : null;
                return (
                  <li key={i} className="flex items-start gap-2 rounded-lg border border-gold/25 bg-gold/[0.06] px-3 py-2 text-sm text-amber-100/90">
                    <span aria-hidden>{imgSrc ? "🃏" : "💡"}</span>
                    {imgSrc ? (
                      <span className="flex items-center gap-2">
                        <span className="font-semibold">Last hint — here&apos;s the card:</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgSrc} alt="" className="h-16 w-12 rounded-md object-cover ring-1 ring-gold/40" loading="lazy" decoding="async" />
                      </span>
                    ) : (
                      <span>{h}</span>
                    )}
                  </li>
                );
              })}
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
          <div className="min-w-[620px]">
            <div className="mb-1 grid grid-cols-[1.6fr_repeat(7,1fr)] gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <div className="text-left">Card</div>
              {COLS.map((c) => <div key={c}>{COL_LABEL[c]}</div>)}
            </div>
            <div className="space-y-1">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1.6fr_repeat(7,1fr)] gap-1">
                  <div className="flex h-11 items-center gap-2 overflow-hidden rounded-md bg-ink-900 px-2">
                    {r.imageThumbUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageThumbUrl} alt="" aria-hidden="true" className="h-9 w-7 shrink-0 rounded-sm object-cover" loading="lazy" decoding="async" />
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
            {mode === "unlimited" ? (
              <button onClick={startUnlimited} className="btn-primary">▶ Play again</button>
            ) : (
              <button onClick={() => switchMode("unlimited")} className="btn-primary">♾️ Play unlimited</button>
            )}
            <button onClick={share} className="btn-ghost text-sm">{copied ? "✓ Copied!" : "Share result"}</button>
            <Link href="/browse" className="btn-ghost text-sm">Browse all cards →</Link>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {mode === "unlimited" ? "Keep going — there's always another card." : "New daily card at midnight Sydney time. Come back tomorrow!"}
          </p>

          {/* Chain the daily loop: don't dead-end at "come back tomorrow" — send them to
              the other daily habit (the market wrap). */}
          {mode !== "unlimited" && (
            <div className="mt-3 border-t border-ink-800 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">While you&apos;re here</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Link href="/market" className="chip border border-ink-700 px-3 py-1.5 text-xs hover:border-brand-500">📊 Today&apos;s market wrap</Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
