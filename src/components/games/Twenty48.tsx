"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameResultExtras, GameShell, useBestScore, useShare } from "./shared";

// Riftbound 2048 — the classic slide-and-merge puzzle, climbing the rarity ladder
// instead of numbers: two Commons make an Uncommon, two Uncommons a Rare, and on
// up to Legend and beyond. Pure client logic, instant, endlessly replayable.
// Arrow keys / WASD on desktop, swipe on touch.
type Dir = "up" | "down" | "left" | "right";
type Cell = number | null; // tile level (0 = Common), null = empty

const LADDER = [
  { short: "Com", name: "Common", color: "#9aa0aa" },
  { short: "Unc", name: "Uncommon", color: "#30a46c" },
  { short: "Rare", name: "Rare", color: "#3b82f6" },
  { short: "Epic", name: "Epic", color: "#a855f7" },
  { short: "Show", name: "Showcase", color: "#f5a524" },
  { short: "Leg", name: "Legend", color: "#ef4444" },
  { short: "Champ", name: "Champion", color: "#ec4899" },
  { short: "Myth", name: "Mythic", color: "#14b8a6" },
  { short: "★", name: "Ascendant", color: "#fbbf24" },
  { short: "★★", name: "Transcendent", color: "#fde047" },
];
const tier = (lvl: number) => LADDER[Math.min(lvl, LADDER.length - 1)];

function emptyBoard(): Cell[] {
  return Array<Cell>(16).fill(null);
}
function spawn(grid: Cell[]): Cell[] {
  const empty: number[] = [];
  grid.forEach((v, i) => v === null && empty.push(i));
  if (!empty.length) return grid;
  const g = [...grid];
  g[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 0 : 1;
  return g;
}
function lineIndices(dir: Dir): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const line: number[] = [];
    for (let j = 0; j < 4; j++) {
      const [r, c] =
        dir === "left" ? [i, j] : dir === "right" ? [i, 3 - j] : dir === "up" ? [j, i] : [3 - j, i];
      line.push(r * 4 + c);
    }
    out.push(line);
  }
  return out;
}
function slideLine(line: Cell[]): { line: Cell[]; gained: number } {
  const tiles = line.filter((x): x is number => x !== null);
  const out: Cell[] = [];
  let gained = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const merged = tiles[i] + 1;
      out.push(merged);
      gained += 2 ** (merged + 1); // two level-k tiles → +value(k+1)
      i++;
    } else {
      out.push(tiles[i]);
    }
  }
  while (out.length < 4) out.push(null);
  return { line: out, gained };
}
function applyMove(grid: Cell[], dir: Dir): { grid: Cell[]; gained: number; moved: boolean } {
  const next = [...grid];
  let gained = 0;
  let moved = false;
  for (const idx of lineIndices(dir)) {
    const { line, gained: g } = slideLine(idx.map((k) => grid[k]));
    gained += g;
    idx.forEach((k, j) => {
      if (next[k] !== line[j]) moved = true;
      next[k] = line[j];
    });
  }
  return { grid: next, gained, moved };
}
function canMove(grid: Cell[]): boolean {
  if (grid.some((v) => v === null)) return true;
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      const v = grid[r * 4 + c];
      if (c < 3 && v === grid[r * 4 + c + 1]) return true;
      if (r < 3 && v === grid[(r + 1) * 4 + c]) return true;
    }
  return false;
}

export function Twenty48() {
  const [grid, setGrid] = useState<Cell[]>(emptyBoard);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const { best, record } = useBestScore("rc_game_2048_best");
  const { copied, share } = useShare();
  const gridRef = useRef(grid);
  const overRef = useRef(over);
  gridRef.current = grid;
  overRef.current = over;

  const newGame = useCallback(() => {
    setGrid(spawn(spawn(emptyBoard())));
    setScore(0);
    setOver(false);
  }, []);

  useEffect(() => { newGame(); }, [newGame]);

  const doMove = useCallback(
    (dir: Dir) => {
      if (overRef.current) return;
      const { grid: moved, gained, moved: changed } = applyMove(gridRef.current, dir);
      if (!changed) return;
      const withSpawn = spawn(moved);
      setGrid(withSpawn);
      setScore((s) => {
        const ns = s + gained;
        record(ns);
        return ns;
      });
      if (!canMove(withSpawn)) setOver(true);
    },
    [record]
  );

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
      };
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      doMove(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doMove]);

  // Touch swipe
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  };

  const topTier = tier(Math.max(0, ...grid.filter((v): v is number => v !== null)));

  return (
    <GameShell
      emoji="🧬"
      title="Riftbound 2048"
      tagline="Merge cards up the rarity ladder — Common to Legend and beyond."
      bestLabel={`score ${score} · best ${best}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm text-slate-400">
          Highest tier: <span className="font-bold" style={{ color: topTier.color }}>{topTier.name}</span>
        </div>
        <button onClick={newGame} className="btn-ghost text-sm">↻ New game</button>
      </div>

      <div
        className="relative mx-auto aspect-square w-full max-w-md touch-none select-none rounded-xl bg-ink-900 p-2"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="grid h-full grid-cols-4 grid-rows-4 gap-2">
          {grid.map((v, i) => {
            const t = v != null ? tier(v) : null;
            return (
              <div key={i} className="grid place-items-center rounded-lg bg-ink-850/60">
                {t && (
                  <div
                    className="animate-fade-up grid h-full w-full place-items-center rounded-lg text-center font-extrabold leading-none shadow-md"
                    style={{ backgroundColor: t.color, color: "#0a0c10" }}
                  >
                    <span className="px-0.5 text-[clamp(10px,3.5vw,15px)]">{t.short}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {over && (
          <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-ink-950/85 p-4 text-center">
            <div>
              <p className="text-3xl" aria-hidden>🧬</p>
              <h2 className="mt-1 text-xl font-extrabold text-white">Board locked!</h2>
              <p className="mt-1 text-sm text-slate-300">
                Score <span className="font-bold text-white">{score}</span> · best {best} · reached{" "}
                <span className="font-bold" style={{ color: topTier.color }}>{topTier.name}</span>
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <button onClick={newGame} className="btn-primary">▶ Play again</button>
                <button
                  onClick={() => share(`🧬 Riftbound 2048 — I scored ${score} and reached ${topTier.name}!\nriftcompare.com/games/twenty48`)}
                  className="btn-ghost text-sm"
                >
                  {copied ? "✓ Copied!" : "Share score"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">
        Arrow keys / WASD, or swipe on touch. Two matching tiles merge into the next rarity up.
      </p>

      {over && (
        <div className="mx-auto max-w-md">
          <GameResultExtras game="twenty48" score={score} />
          <p className="mt-4 text-center text-xs text-slate-600">
            Want the real thing? <Link href="/browse" className="text-brand-400 hover:underline">Browse every Riftbound card →</Link>
          </p>
        </div>
      )}
    </GameShell>
  );
}
