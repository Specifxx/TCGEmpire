"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameLoading, GameResultExtras, GameShell, RunRecap, useBestScore, useGameCards, useShare, type GameCard } from "./shared";

// Space Invaders — the classic formation shooter, invaders reskinned as real
// Riftbound cards (pricier cards score more when shot down, the same "reading
// the market IS the game" rule Card Smash and Higher or Lower already use).
// Movement is TICK-DRIVEN, not requestAnimationFrame/canvas: every other game
// in this arcade is plain DOM + timers (see Card Smash's setInterval loop),
// and 24 invaders + a handful of bullets re-rendering at ~17fps is nowhere
// near enough DOM to need canvas. One setInterval steps a mutable snapshot
// held in a ref (positions, bullets, alive flags) and mirrors it into state
// once per tick for rendering — same "ref is truth, state is for render"
// split Card Smash uses for phase/lives, just applied to the whole frame.
const COLS = 6;
const ROWS = 4;
const TOTAL = COLS * ROWS;
const TICK_MS = 55;
const LIVES = 3;

// Percent-of-field units throughout — the field itself is a responsive
// aspect-ratio box, so everything scales with it for free.
const CELL_W = 12;
const CELL_H = 10;
const MAX_FORMATION_X = 100 - COLS * CELL_W; // how far the block can drift sideways
const START_Y = 6;
const ROW_DESCENT = 6;
const SHIP_Y = 90;
const SHIP_W = 9;
const DANGER_Y = SHIP_Y - CELL_H * 0.6; // invaders reaching this line cost a life
const PLAYER_SPEED = 3.2;
const PLAYER_BULLET_SPEED = 5.5;
const ENEMY_BULLET_SPEED = 2.6;
const FIRE_COOLDOWN_MS = 260;
const MAX_PLAYER_BULLETS = 2;
const HIT_HALF_W = CELL_W * 0.55;
const HIT_HALF_H = CELL_H * 0.55;

const tierPts = (cents: number) => (cents >= 2000 ? 25 : cents >= 500 ? 12 : 5);

type Bullet = { id: number; x: number; y: number };
type Snapshot = {
  alive: boolean[]; // TOTAL cells, row-major
  formationX: number;
  formationY: number;
  playerX: number;
  playerBullets: Bullet[];
  enemyBullets: Bullet[];
};

function freshAlive(): boolean[] {
  return Array<boolean>(TOTAL).fill(true);
}

export function SpaceInvaders() {
  const { cards, currency, error, reload } = useGameCards(TOTAL);
  const { best, record } = useBestScore("rc_game_invaders_best");
  const { copied, share } = useShare();

  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [wave, setWave] = useState(1);
  const [shot, setShot] = useState<GameCard[]>([]);

  // Mutable, tick-authoritative state. React state above is a per-tick mirror
  // of this for rendering — reading `snap` inside the tick handler instead
  // would close over a stale frame the way CardSmash's phaseRef comment warns
  // about, so every tick reads and writes gameRef only.
  const gameRef = useRef<Snapshot>({
    alive: freshAlive(),
    formationX: 0,
    formationY: START_Y,
    playerX: 50 - SHIP_W / 2,
    playerBullets: [],
    enemyBullets: [],
  });
  const dirRef = useRef<1 | -1>(1);
  const stepCounterRef = useRef(0);
  const moveInputRef = useRef<-1 | 0 | 1>(0);
  const lastShotAt = useRef(0);
  const bulletSeq = useRef(0);
  const phaseRef = useRef(phase);
  const waveRef = useRef(1);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  phaseRef.current = phase;

  const stopLoop = useCallback(() => {
    if (tickTimer.current) clearInterval(tickTimer.current);
    tickTimer.current = null;
  }, []);
  useEffect(() => stopLoop, [stopLoop]);

  const cell = useCallback((col: number, row: number) => row * COLS + col, []);

  const endGame = useCallback(
    (finalScore: number) => {
      stopLoop();
      setPhase("over");
      record(finalScore);
    },
    [record, stopLoop]
  );

  const fire = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    const now = performance.now();
    if (now - lastShotAt.current < FIRE_COOLDOWN_MS) return;
    const g = gameRef.current;
    if (g.playerBullets.length >= MAX_PLAYER_BULLETS) return;
    lastShotAt.current = now;
    g.playerBullets = [...g.playerBullets, { id: bulletSeq.current++, x: g.playerX + SHIP_W / 2, y: SHIP_Y - 2 }];
  }, []);

  const tick = useCallback(() => {
    if (!cards) return;
    const g = gameRef.current;

    // 1. Player movement.
    g.playerX = Math.max(0, Math.min(100 - SHIP_W, g.playerX + moveInputRef.current * PLAYER_SPEED));

    // 2. Bullets travel; drop anything off-field.
    g.playerBullets = g.playerBullets.map((b) => ({ ...b, y: b.y - PLAYER_BULLET_SPEED })).filter((b) => b.y > 0);
    g.enemyBullets = g.enemyBullets.map((b) => ({ ...b, y: b.y + ENEMY_BULLET_SPEED })).filter((b) => b.y < 100);

    // 3. Formation march — speeds up as the wave clears and as waves progress,
    // exactly the classic Space Invaders tempo.
    const aliveCount = g.alive.reduce((n, a) => n + (a ? 1 : 0), 0);
    const aliveRatio = aliveCount / TOTAL;
    const baseTicksPerStep = Math.max(3, 15 - waveRef.current * 2);
    const ticksPerStep = Math.max(2, Math.round(baseTicksPerStep * (0.35 + 0.65 * aliveRatio)));
    stepCounterRef.current++;
    if (aliveCount > 0 && stepCounterRef.current >= ticksPerStep) {
      stepCounterRef.current = 0;
      const nextX = g.formationX + dirRef.current * 2.4;
      if (nextX < 0 || nextX > MAX_FORMATION_X) {
        dirRef.current = dirRef.current === 1 ? -1 : 1;
        g.formationY += ROW_DESCENT;
      } else {
        g.formationX = nextX;
      }
    }

    // 4. Invaders reaching the danger line (or the player) end the run outright
    // — no partial credit, same as the original.
    if (aliveCount > 0 && g.formationY + (ROWS - 1) * CELL_H >= DANGER_Y) {
      setScore((s) => { endGame(s); return s; });
      setSnap({ ...g });
      return;
    }

    // 5. Random enemy fire — one alive invader per column can fire, so pick a
    // live column's LOWEST alive row (the "front line"), matching the visual
    // logic of who's actually exposed to fire from.
    const fireChance = 0.02 + waveRef.current * 0.006;
    if (aliveCount > 0 && Math.random() < fireChance) {
      const liveCols = Array.from({ length: COLS }, (_, c) => c).filter((c) =>
        Array.from({ length: ROWS }, (_, r) => r).some((r) => g.alive[cell(c, r)])
      );
      if (liveCols.length) {
        const col = liveCols[Math.floor(Math.random() * liveCols.length)];
        let frontRow = ROWS - 1;
        for (let r = ROWS - 1; r >= 0; r--) if (g.alive[cell(col, r)]) { frontRow = r; break; }
        const x = g.formationX + col * CELL_W + CELL_W / 2;
        const y = g.formationY + frontRow * CELL_H + CELL_H;
        g.enemyBullets = [...g.enemyBullets, { id: bulletSeq.current++, x, y }];
      }
    }

    // 6. Collisions: player bullets vs invaders.
    let gained = 0;
    const newlyHit: GameCard[] = [];
    const survivingPlayerBullets: Bullet[] = [];
    for (const b of g.playerBullets) {
      let consumed = false;
      for (let r = 0; r < ROWS && !consumed; r++) {
        for (let c = 0; c < COLS && !consumed; c++) {
          const idx = cell(c, r);
          if (!g.alive[idx]) continue;
          const ix = g.formationX + c * CELL_W + CELL_W / 2;
          const iy = g.formationY + r * CELL_H + CELL_H / 2;
          if (Math.abs(b.x - ix) < HIT_HALF_W && Math.abs(b.y - iy) < HIT_HALF_H) {
            g.alive[idx] = false;
            consumed = true;
            const card = cards[idx % cards.length];
            gained += tierPts(card.priceCents);
            newlyHit.push(card);
          }
        }
      }
      if (!consumed) survivingPlayerBullets.push(b);
    }
    g.playerBullets = survivingPlayerBullets;
    if (gained > 0) setScore((s) => s + gained);
    if (newlyHit.length) setShot((arr) => [...arr, ...newlyHit.filter((c) => !arr.some((a) => a.id === c.id))]);

    // 7. Collisions: enemy bullets vs ship.
    const shipCx = g.playerX + SHIP_W / 2;
    const survivingEnemyBullets: Bullet[] = [];
    let hitShip = false;
    for (const b of g.enemyBullets) {
      if (!hitShip && Math.abs(b.x - shipCx) < SHIP_W * 0.55 && b.y >= SHIP_Y - 2) {
        hitShip = true;
        continue;
      }
      survivingEnemyBullets.push(b);
    }
    g.enemyBullets = survivingEnemyBullets;
    if (hitShip) {
      setLives((l) => {
        const nl = l - 1;
        if (nl <= 0) setScore((s) => { endGame(s); return s; });
        return nl;
      });
    }

    // 8. Wave clear — a fresh, faster wave with the same dealt hand.
    const aliveNow = g.alive.some(Boolean);
    if (!aliveNow) {
      g.alive = freshAlive();
      g.formationX = 0;
      g.formationY = START_Y;
      dirRef.current = 1;
      stepCounterRef.current = 0;
      waveRef.current += 1;
      setWave(waveRef.current);
    }

    setSnap({ ...g });
  }, [cards, cell, endGame]);

  const start = useCallback(() => {
    if (!cards) return;
    stopLoop();
    gameRef.current = { alive: freshAlive(), formationX: 0, formationY: START_Y, playerX: 50 - SHIP_W / 2, playerBullets: [], enemyBullets: [] };
    dirRef.current = 1;
    stepCounterRef.current = 0;
    waveRef.current = 1;
    moveInputRef.current = 0;
    setScore(0);
    setLives(LIVES);
    setWave(1);
    setShot([]);
    setSnap({ ...gameRef.current });
    setPhase("playing");
    tickTimer.current = setInterval(tick, TICK_MS);
  }, [cards, stopLoop, tick]);

  // Keyboard: arrows/WASD to move, Space to fire.
  useEffect(() => {
    const held = new Set<string>();
    const resolveDir = () => {
      const left = held.has("ArrowLeft") || held.has("a") || held.has("A");
      const right = held.has("ArrowRight") || held.has("d") || held.has("D");
      moveInputRef.current = left === right ? 0 : left ? -1 : 1;
    };
    const onDown = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D", " ", "Spacebar"].includes(e.key)) e.preventDefault();
      if (e.key === " " || e.key === "Spacebar") { fire(); return; }
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
  }, [fire]);

  if (!cards) {
    return (
      <GameShell emoji="👾" title="Space Invaders" tagline="Shoot down the formation before it reaches you. Pricier cards score more.">
        <GameLoading error={error} retry={reload} />
      </GameShell>
    );
  }

  const s = snap ?? gameRef.current;

  return (
    <GameShell emoji="👾" title="Space Invaders" tagline="Classic formation shooter — pricier cards score more when shot down." bestLabel={`best ${best}`}>
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="font-bold text-white">⭐ {score}</span>
        <span className="text-slate-400">wave {wave}</span>
        <span className="text-slate-400">{"❤️".repeat(Math.max(0, lives))}{"🤍".repeat(Math.max(0, LIVES - lives))}</span>
      </div>

      <div
        className="relative mx-auto aspect-[3/4] w-full max-w-md touch-none select-none overflow-hidden rounded-xl bg-ink-900"
        onPointerDown={(e) => {
          // Tap/click the field itself fires — the on-screen buttons below
          // handle movement, this keeps a mouse/touch player from needing to
          // find a tiny fire button mid-fight.
          if (phase === "playing") { e.preventDefault(); fire(); }
        }}
      >
        {/* Danger line */}
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-rose-500/30" style={{ top: `${DANGER_Y}%` }} />

        {/* Invaders — indexed over the full TOTAL grid (wrapping into `cards`
            with modulo, matching the tick loop's scoring lookup) rather than
            `cards.map`, so rendering and collision always agree on which grid
            cells exist even on the rare deal that comes back under TOTAL. */}
        {Array.from({ length: TOTAL }, (_, idx) => {
          if (!s.alive[idx]) return null;
          const card = cards[idx % cards.length];
          const col = idx % COLS;
          const row = Math.floor(idx / COLS);
          return (
            <div
              key={idx}
              className="pointer-events-none absolute overflow-hidden rounded-sm border border-ink-700 bg-ink-850"
              style={{
                left: `${s.formationX + col * CELL_W}%`,
                top: `${s.formationY + row * CELL_H}%`,
                width: `${CELL_W - 1.2}%`,
                height: `${CELL_H - 1.2}%`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.img} alt="" aria-hidden="true" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            </div>
          );
        })}

        {/* Bullets */}
        {s.playerBullets.map((b) => (
          <div key={`p${b.id}`} className="pointer-events-none absolute h-2.5 w-1 -translate-x-1/2 rounded-full bg-brand-400" style={{ left: `${b.x}%`, top: `${b.y}%` }} />
        ))}
        {s.enemyBullets.map((b) => (
          <div key={`e${b.id}`} className="pointer-events-none absolute h-2.5 w-1 -translate-x-1/2 rounded-full bg-rose-500" style={{ left: `${b.x}%`, top: `${b.y}%` }} />
        ))}

        {/* Ship */}
        <div
          className="pointer-events-none absolute grid place-items-center text-xl"
          style={{ left: `${s.playerX}%`, top: `${SHIP_Y}%`, width: `${SHIP_W}%` }}
          aria-hidden
        >
          🚀
        </div>

        {/* Start / overlay */}
        {phase !== "playing" && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-ink-950/85 p-4 text-center">
            <div>
              {phase === "ready" ? (
                <>
                  <p className="text-4xl" aria-hidden>👾</p>
                  <h2 className="mt-1 text-xl font-extrabold text-white">Space Invaders</h2>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-slate-300">
                    Move with ◀▶ or A/D, fire with Space or a tap. Clear the formation before it reaches the line — pricier cards are worth more.
                  </p>
                  <button onClick={start} className="btn-primary mt-4">▶ Start</button>
                </>
              ) : (
                <>
                  <p className="text-3xl" aria-hidden>{lives <= 0 ? "💥" : "🛬"}</p>
                  <h2 className="mt-1 text-xl font-extrabold text-white">{lives <= 0 ? "Ship destroyed!" : "Overrun!"}</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    Score <span className="font-bold text-white">{score}</span> · wave {wave} · best {best}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <button onClick={start} className="btn-primary">▶ Play again</button>
                    <button
                      onClick={() => share(`👾 Space Invaders — I scored ${score} on wave ${wave} defending against Riftbound cards!\nriftcompare.com/games/space-invaders`)}
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

      {/* Touch controls */}
      {phase === "playing" && (
        <div className="mt-3 flex items-center justify-center gap-3 sm:hidden">
          <TouchButton label="◀" onDown={() => (moveInputRef.current = -1)} onUp={() => (moveInputRef.current = 0)} />
          <button onPointerDown={(e) => { e.preventDefault(); fire(); }} className="btn-primary h-14 w-20 text-lg">🔫</button>
          <TouchButton label="▶" onDown={() => (moveInputRef.current = 1)} onUp={() => (moveInputRef.current = 0)} />
        </div>
      )}

      {phase === "over" && (
        <div className="mx-auto max-w-md">
          <GameResultExtras game="space-invaders" score={score} />
          <RunRecap cards={shot} currency={currency} title="🛒 The cards you shot down" />
          <p className="mt-4 text-center text-xs text-slate-600">
            Real cards, real prices. <Link href="/movers" className="text-brand-400 hover:underline">See today&apos;s movers →</Link>
          </p>
        </div>
      )}
    </GameShell>
  );
}

// A press-and-hold control that keeps working if the pointer drifts off the
// button while held (pointer capture) — a plain onTouchStart/End pair loses
// the "up" event the instant a finger slides a few pixels during a fast game.
function TouchButton({ label, onDown, onUp }: { label: string; onDown: () => void; onUp: () => void }) {
  return (
    <button
      className="btn-ghost h-14 w-16 select-none text-xl"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onDown(); }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label === "◀" ? "Move left" : "Move right"}
    >
      {label}
    </button>
  );
}
