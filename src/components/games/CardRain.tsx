"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameLoading, GameResultExtras, GameShell, RunRecap, useBestScore, useGameCards, useShare, type GameCard } from "./shared";

// Card Rain — real Riftbound cards fall from the sky and you slide a deck box
// along the bottom to catch them, with power-ups dropping in alongside. Points
// scale with each card's REAL live market price (the same "reading the market
// IS the game" rule Card Smash and Higher or Lower already use), so the quickest
// route to a high score is recognising which cards are actually worth chasing.
// Drop a card and it costs a life — three of those and the run is over.
//
// TICK-DRIVEN DOM, not canvas/requestAnimationFrame: every other game in this
// arcade is plain DOM + timers (see Card Smash's setInterval loop), and a dozen
// falling cards re-rendering at 20fps is nowhere near enough DOM to need canvas.
// One setInterval steps a mutable snapshot held in a ref (box position, falling
// items, power-up timers) and mirrors it into state once per tick for rendering
// — the same "ref is truth, state is for render" split Card Smash uses for
// phase/lives, just applied to the whole frame.
const TICK_MS = 50;
const LIVES = 3;
const MAX_LIVES = 5; // ❤️ power-ups can top you up past the starting three
const HAND = 18; // cards dealt per run; spawns draw from this hand at random

// Percent-of-field units throughout — the field is a responsive aspect-ratio
// box, so everything scales with it for free.
const BOX_Y = 87; // top edge of the catcher
const BOX_H = 10;
const BOX_W = 18;
const BOX_W_WIDE = 29; // while 📦 Wide Box is active
const BOX_SPEED = 4.2; // per tick, with a key held

const CARD_W = 9;
const CARD_H = 13;
const POWER_W = 8;
const POWER_H = 8;

// Difficulty curve. Level 1 drops a card every ~900ms at ~27% of the field per
// second (about 3.7s of reaction time); by level 8 that's roughly halved, which
// is where a good run starts losing lives.
const BASE_FALL = 1.35; // per tick
const FALL_PER_LEVEL = 0.16;
const FALL_JITTER = 0.22; // ±, so a wave of cards never falls as one flat line
const BASE_SPAWN_MS = 900;
const SPAWN_PER_LEVEL_MS = 70;
const SPAWN_FLOOR_MS = 320;
const CATCHES_PER_LEVEL = 12;
const POWER_CHANCE = 0.16; // share of spawns that are a power-up, not a card
// …but a run can end in well under a minute, and at that rate a player can
// finish one having never seen a power-up at all — the headline feature,
// invisible. Measured in a browser: two full runs produced ONE power-up between
// them. So the first few spawns are guaranteed to include one, after which the
// plain probability takes over.
const FIRST_POWER_BY_SPAWN = 4;

// Power-up durations (ms). Life is instant, so it has no entry here.
const POWER_MS: Record<TimedPower, number> = { magnet: 7000, slow: 6000, double: 8000, wide: 9000 };
const SLOW_FACTOR = 0.55;
const MAGNET_PULL = 1.6; // per tick, toward the box's centre
const COMBO_BONUS_EVERY = 10; // consecutive catches
const COMBO_BONUS = 25;

type TimedPower = "magnet" | "slow" | "double" | "wide";
type PowerKind = TimedPower | "life";

// Weighted so the run-saving one is the rarest. Labels/emoji live here too, so
// the falling token, the HUD chip and the how-to-play copy can never drift into
// describing different power-ups.
const POWERS: { kind: PowerKind; emoji: string; label: string; weight: number }[] = [
  { kind: "magnet", emoji: "🧲", label: "Magnet", weight: 25 },
  { kind: "double", emoji: "✨", label: "2× points", weight: 25 },
  { kind: "slow", emoji: "⏳", label: "Slow-mo", weight: 20 },
  // NOT 📦 — that is the catcher itself, and two identical boxes on the field
  // reads as "there are two of me", not "catch this to grow".
  { kind: "wide", emoji: "↔️", label: "Wide box", weight: 20 },
  { kind: "life", emoji: "❤️", label: "Extra life", weight: 10 },
];
const POWER_BY_KIND = new Map(POWERS.map((p) => [p.kind, p]));
const POWER_WEIGHT_TOTAL = POWERS.reduce((n, p) => n + p.weight, 0);

function rollPower(): PowerKind {
  let roll = Math.random() * POWER_WEIGHT_TOTAL;
  for (const p of POWERS) {
    roll -= p.weight;
    if (roll <= 0) return p.kind;
  }
  return POWERS[0].kind;
}

// Same three price tiers the rest of the arcade scores on.
const tierPts = (cents: number) => (cents >= 2000 ? 25 : cents >= 500 ? 12 : 5);

type Falling =
  | { id: number; kind: "card"; idx: number; x: number; y: number; vy: number }
  | { id: number; kind: "power"; power: PowerKind; x: number; y: number; vy: number };

type Timers = Record<TimedPower, number>; // performance.now() deadlines
type Snapshot = { boxX: number; items: Falling[] };

const freshTimers = (): Timers => ({ magnet: 0, slow: 0, double: 0, wide: 0 });

export function CardRain() {
  const { cards, currency, error, reload } = useGameCards(HAND);
  const { best, record } = useBestScore("rc_game_card_rain_best");
  const { copied, share } = useShare();

  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [level, setLevel] = useState(1);
  const [combo, setCombo] = useState(0);
  const [caught, setCaught] = useState<GameCard[]>([]);
  // Remaining ms per timed power-up, mirrored for the HUD chips.
  const [powerLeft, setPowerLeft] = useState<Timers>(freshTimers);

  // Mutable, tick-authoritative state. The React state above is a per-tick
  // mirror for rendering — reading `snap` inside the tick handler would close
  // over a stale frame the way CardSmash's phaseRef comment warns about, so
  // every tick reads and writes these refs only.
  const gameRef = useRef<Snapshot>({ boxX: 50 - BOX_W / 2, items: [] });
  const timersRef = useRef<Timers>(freshTimers());
  // Score lives in a ref as well as state. The tick that ends a run has to hand
  // its FINAL total to endGame(), and reading that out of a queued state
  // updater double-counts the same tick's points (the updater already ran).
  const scoreRef = useRef(0);
  const moveInputRef = useRef<-1 | 0 | 1>(0);
  const seqRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const spawnCountRef = useRef(0);
  const powersSpawnedRef = useRef(0);
  const catchesRef = useRef(0);
  const comboRef = useRef(0);
  const levelRef = useRef(1);
  const livesRef = useRef(LIVES);
  const phaseRef = useRef(phase);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  phaseRef.current = phase;

  const stopLoop = useCallback(() => {
    if (tickTimer.current) clearInterval(tickTimer.current);
    tickTimer.current = null;
  }, []);
  useEffect(() => stopLoop, [stopLoop]);

  const endGame = useCallback(
    (finalScore: number) => {
      stopLoop();
      setPhase("over");
      record(finalScore);
    },
    [record, stopLoop]
  );

  const boxWidth = useCallback((now: number) => (timersRef.current.wide > now ? BOX_W_WIDE : BOX_W), []);

  const tick = useCallback(() => {
    if (!cards) return;
    const g = gameRef.current;
    const now = performance.now();
    const bw = boxWidth(now);
    const slow = timersRef.current.slow > now;
    const magnet = timersRef.current.magnet > now;
    const doubled = timersRef.current.double > now;

    // 1. Catcher movement. Keyboard nudges it; a pointer drag sets it directly
    //    (see onPointerMove below), so both can drive the same value.
    g.boxX = Math.max(0, Math.min(100 - bw, g.boxX + moveInputRef.current * BOX_SPEED));
    const boxCx = g.boxX + bw / 2;

    // 2. Spawn. Interval tightens with the level, floored so it stays playable.
    const spawnEvery = Math.max(SPAWN_FLOOR_MS, BASE_SPAWN_MS - (levelRef.current - 1) * SPAWN_PER_LEVEL_MS);
    if (now - lastSpawnRef.current >= spawnEvery) {
      lastSpawnRef.current = now;
      spawnCountRef.current += 1;
      const vy = (BASE_FALL + (levelRef.current - 1) * FALL_PER_LEVEL) * (1 + (Math.random() * 2 - 1) * FALL_JITTER);
      const isPower =
        Math.random() < POWER_CHANCE ||
        (powersSpawnedRef.current === 0 && spawnCountRef.current >= FIRST_POWER_BY_SPAWN);
      if (isPower) powersSpawnedRef.current += 1;
      const w = isPower ? POWER_W : CARD_W;
      const x = Math.random() * (100 - w);
      g.items = [
        ...g.items,
        isPower
          ? { id: seqRef.current++, kind: "power", power: rollPower(), x, y: -POWER_H, vy }
          : { id: seqRef.current++, kind: "card", idx: Math.floor(Math.random() * cards.length), x, y: -CARD_H, vy },
      ];
    }

    // 3. Fall, drift toward the box under 🧲, then resolve each item as caught,
    //    dropped, or still in the air.
    const survivors: Falling[] = [];
    let gained = 0;
    let lifeLost = 0;
    let lifeGained = 0;
    const newlyCaught: GameCard[] = [];
    let comboNow = comboRef.current;

    for (const it of g.items) {
      const w = it.kind === "power" ? POWER_W : CARD_W;
      const h = it.kind === "power" ? POWER_H : CARD_H;
      let { x } = it;
      const y = it.y + it.vy * (slow ? SLOW_FACTOR : 1);
      if (magnet) {
        const cx = x + w / 2;
        const delta = boxCx - cx;
        x += Math.max(-MAGNET_PULL, Math.min(MAGNET_PULL, delta));
        x = Math.max(0, Math.min(100 - w, x));
      }

      // Caught: the item's bottom edge has reached the box's mouth (but not
      // fallen past it) and its centre is over the box.
      const bottom = y + h;
      const centre = x + w / 2;
      const overBox = Math.abs(centre - boxCx) <= bw / 2 + w * 0.25;
      if (bottom >= BOX_Y && y <= BOX_Y + BOX_H && overBox) {
        if (it.kind === "card") {
          const card = cards[it.idx % cards.length];
          comboNow += 1;
          gained += tierPts(card.priceCents) * (doubled ? 2 : 1);
          if (comboNow % COMBO_BONUS_EVERY === 0) gained += COMBO_BONUS;
          newlyCaught.push(card);
          catchesRef.current += 1;
        } else if (it.power === "life") {
          lifeGained += 1;
        } else {
          // Re-catching an active power-up extends it rather than restarting a
          // shorter remainder — a strictly better outcome for the player, and
          // the obvious reading of "caught another one".
          const t = timersRef.current;
          t[it.power] = Math.max(t[it.power], now) + POWER_MS[it.power];
        }
        continue;
      }

      // Dropped off the bottom. A missed CARD costs a life and breaks the
      // combo; a missed power-up is just a missed bonus.
      if (y > 100) {
        if (it.kind === "card") {
          lifeLost += 1;
          comboNow = 0;
        }
        continue;
      }

      survivors.push({ ...it, x, y });
    }
    g.items = survivors;

    // 4. Bank the tick's results.
    if (gained > 0) {
      scoreRef.current += gained;
      setScore(scoreRef.current);
    }
    if (newlyCaught.length) {
      setCaught((arr) => [...arr, ...newlyCaught.filter((c) => !arr.some((a) => a.id === c.id))]);
    }
    if (comboNow !== comboRef.current) {
      comboRef.current = comboNow;
      setCombo(comboNow);
    }
    if (lifeGained > 0) {
      livesRef.current = Math.min(MAX_LIVES, livesRef.current + lifeGained);
      setLives(livesRef.current);
    }
    if (lifeLost > 0) {
      livesRef.current = Math.max(0, livesRef.current - lifeLost);
      setLives(livesRef.current);
      if (livesRef.current <= 0) {
        endGame(scoreRef.current);
        setSnap({ boxX: g.boxX, items: g.items });
        return;
      }
    }

    // 5. Level up on catches, not on a clock — so a player who keeps catching
    //    is the one who gets a harder game, and a cautious one isn't punished.
    const nextLevel = Math.floor(catchesRef.current / CATCHES_PER_LEVEL) + 1;
    if (nextLevel !== levelRef.current) {
      levelRef.current = nextLevel;
      setLevel(nextLevel);
    }

    // 6. Mirror the frame (positions + power countdowns) for rendering.
    setPowerLeft({
      magnet: Math.max(0, timersRef.current.magnet - now),
      slow: Math.max(0, timersRef.current.slow - now),
      double: Math.max(0, timersRef.current.double - now),
      wide: Math.max(0, timersRef.current.wide - now),
    });
    setSnap({ boxX: g.boxX, items: g.items });
  }, [boxWidth, cards, endGame]);

  const start = useCallback(() => {
    if (!cards) return;
    stopLoop();
    gameRef.current = { boxX: 50 - BOX_W / 2, items: [] };
    timersRef.current = freshTimers();
    moveInputRef.current = 0;
    seqRef.current = 0;
    // Give the player the full first interval before the first card lands
    // rather than dropping one on the very first tick.
    lastSpawnRef.current = performance.now();
    spawnCountRef.current = 0;
    powersSpawnedRef.current = 0;
    catchesRef.current = 0;
    comboRef.current = 0;
    levelRef.current = 1;
    livesRef.current = LIVES;
    scoreRef.current = 0;
    setScore(0);
    setLives(LIVES);
    setLevel(1);
    setCombo(0);
    setCaught([]);
    setPowerLeft(freshTimers());
    setSnap({ ...gameRef.current });
    setPhase("playing");
    // Put the whole field on screen before the first card lands. Measured on a
    // 375×667 phone: the page chrome above the field is ~349px, so the catcher
    // sat 126px BELOW the fold — in a catcher, not being able to see your own
    // catcher is the whole game. Centring the field fixes every small screen
    // without shrinking the playfield on a large one.
    fieldRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    tickTimer.current = setInterval(tick, TICK_MS);
  }, [cards, stopLoop, tick]);

  // Keyboard: arrows or A/D. No fire button — this is a catcher, the only input
  // is where the box is.
  useEffect(() => {
    const held = new Set<string>();
    const resolveDir = () => {
      const left = held.has("ArrowLeft") || held.has("a") || held.has("A");
      const right = held.has("ArrowRight") || held.has("d") || held.has("D");
      moveInputRef.current = left === right ? 0 : left ? -1 : 1;
    };
    const onDown = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(e.key)) e.preventDefault();
      held.add(e.key);
      resolveDir();
    };
    const onUp = (e: KeyboardEvent) => {
      held.delete(e.key);
      resolveDir();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  // Pointer drag: the box centres on the finger/cursor. This is the natural
  // control for a catcher (and the only one that feels right on a phone), so it
  // writes straight to the authoritative ref rather than going through the
  // keyboard's -1/0/1 input.
  const dragTo = useCallback(
    (clientX: number) => {
      const el = fieldRef.current;
      if (!el || phaseRef.current !== "playing") return;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      const pct = ((clientX - r.left) / r.width) * 100;
      const bw = boxWidth(performance.now());
      gameRef.current.boxX = Math.max(0, Math.min(100 - bw, pct - bw / 2));
    },
    [boxWidth]
  );

  if (!cards) {
    return (
      <GameShell emoji="🌧️" title="Card Rain" tagline="Catch the falling cards. Pricier cards score more.">
        <GameLoading error={error} retry={reload} />
      </GameShell>
    );
  }

  const s = snap ?? gameRef.current;
  // Width comes from the mirrored countdown, not the ref — a ref read during
  // render is invisible to React and would leave the box drawn at the wrong
  // width until some other state happened to re-render it.
  const bw = powerLeft.wide > 0 ? BOX_W_WIDE : BOX_W;
  const activePowers = (Object.keys(POWER_MS) as TimedPower[]).filter((k) => powerLeft[k] > 0);

  return (
    <GameShell
      emoji="🌧️"
      title="Card Rain"
      tagline="Cards fall from the sky — catch them for points, grab the power-ups, don't drop three."
      bestLabel={`best ${best}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="font-bold text-white">⭐ {score}</span>
        <span className="text-slate-400">
          level {level}
          {combo >= 3 && <span className="ml-2 font-semibold text-brand-300">🔥 {combo}</span>}
        </span>
        <span className="text-slate-400">
          {"❤️".repeat(Math.max(0, lives))}
          {"🤍".repeat(Math.max(0, LIVES - lives))}
        </span>
      </div>

      <div
        ref={fieldRef}
        className="relative mx-auto aspect-[3/4] w-full max-w-md touch-none select-none overflow-hidden rounded-xl bg-gradient-to-b from-ink-900 to-ink-950"
        onPointerDown={(e) => {
          if (phase !== "playing") return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragTo(e.clientX);
        }}
        onPointerMove={(e) => {
          // Only while actually dragging — e.buttons is 0 for a hover, and a
          // touch always reports a held contact.
          if (e.buttons === 0) return;
          dragTo(e.clientX);
        }}
      >
        {/* Falling items */}
        {s.items.map((it) =>
          it.kind === "card" ? (
            <div
              key={it.id}
              className="pointer-events-none absolute overflow-hidden rounded-sm border border-ink-700 bg-ink-850 shadow-lg"
              style={{ left: `${it.x}%`, top: `${it.y}%`, width: `${CARD_W}%`, height: `${CARD_H}%` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cards[it.idx % cards.length].img}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          ) : (
            <div
              key={it.id}
              className="pointer-events-none absolute grid place-items-center rounded-full border border-gold/50 bg-gold/15 text-lg"
              style={{ left: `${it.x}%`, top: `${it.y}%`, width: `${POWER_W}%`, height: `${POWER_H}%` }}
              aria-hidden
            >
              {POWER_BY_KIND.get(it.power)?.emoji}
            </div>
          )
        )}

        {/* The catcher */}
        <div
          className="pointer-events-none absolute grid place-items-center rounded-lg border-2 border-brand-400/70 bg-brand-500/20 text-xl transition-[width] duration-200"
          style={{ left: `${s.boxX}%`, top: `${BOX_Y}%`, width: `${bw}%`, height: `${BOX_H}%` }}
          aria-hidden
        >
          📦
        </div>

        {/* Active power-up chips */}
        {phase === "playing" && activePowers.length > 0 && (
          <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1">
            {activePowers.map((k) => (
              <span
                key={k}
                className="rounded-full border border-gold/40 bg-ink-950/80 px-2 py-0.5 text-[10px] font-bold text-gold"
              >
                {POWER_BY_KIND.get(k)?.emoji} {POWER_BY_KIND.get(k)?.label} {Math.ceil(powerLeft[k] / 1000)}s
              </span>
            ))}
          </div>
        )}

        {/* Start / game-over overlay */}
        {phase !== "playing" && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-ink-950/85 p-4 text-center">
            <div>
              {phase === "ready" ? (
                <>
                  <p className="text-4xl" aria-hidden>🌧️</p>
                  <h2 className="mt-1 text-xl font-extrabold text-white">Card Rain</h2>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-slate-300">
                    Drag (or use ◀▶ / A-D) to slide your deck box and catch the falling cards. Pricier cards are
                    worth more. Catch the power-ups — and don&apos;t drop three.
                  </p>
                  <div className="mx-auto mt-3 flex max-w-xs flex-wrap justify-center gap-1.5">
                    {POWERS.map((p) => (
                      <span key={p.kind} className="rounded-full bg-ink-800 px-2 py-1 text-[10px] font-semibold text-slate-300">
                        <span aria-hidden>{p.emoji}</span> {p.label}
                      </span>
                    ))}
                  </div>
                  <button onClick={start} className="btn-primary mt-4">▶ Start</button>
                </>
              ) : (
                <>
                  <p className="text-3xl" aria-hidden>📦</p>
                  <h2 className="mt-1 text-xl font-extrabold text-white">Cards everywhere!</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    Score <span className="font-bold text-white">{score}</span> · level {level} · best {best}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <button onClick={start} className="btn-primary">▶ Play again</button>
                    <button
                      onClick={() =>
                        share(
                          `🌧️ Card Rain — I caught ${score} points of Riftbound cards and made it to level ${level}!\nriftcompare.com/games/card-rain`
                        )
                      }
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

      {/* Touch controls — the drag above is the primary phone control, but the
          buttons stay for anyone who'd rather not cover the field with a hand. */}
      {phase === "playing" && (
        <div className="mt-3 flex items-center justify-center gap-6 sm:hidden">
          <TouchButton label="◀" onDown={() => (moveInputRef.current = -1)} onUp={() => (moveInputRef.current = 0)} />
          <TouchButton label="▶" onDown={() => (moveInputRef.current = 1)} onUp={() => (moveInputRef.current = 0)} />
        </div>
      )}

      {phase === "over" && (
        <div className="mx-auto max-w-md">
          <GameResultExtras game="card-rain" score={score} />
          <RunRecap cards={caught} currency={currency} title="🛒 The cards you caught" />
          <p className="mt-4 text-center text-xs text-slate-600">
            Real cards, real prices. <Link href="/movers" className="text-brand-400 hover:underline">See today&apos;s movers →</Link>
          </p>
        </div>
      )}
    </GameShell>
  );
}

// A press-and-hold control that keeps working if the pointer drifts off the
// button while held (pointer capture) — a plain onTouchStart/End pair loses the
// "up" event the instant a finger slides a few pixels during a fast game.
function TouchButton({ label, onDown, onUp }: { label: string; onDown: () => void; onUp: () => void }) {
  return (
    <button
      className="btn-ghost h-14 w-20 select-none text-xl"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label === "◀" ? "Move left" : "Move right"}
    >
      {label}
    </button>
  );
}
