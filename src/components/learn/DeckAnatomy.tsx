"use client";

import Link from "next/link";
import { useState } from "react";

// Interactive deck-anatomy diagram: every part of a tournament Riftbound deck as a
// proportional, clickable stack. Counts and descriptions match our deck-building
// guide (the source of truth for this page) — we describe what each part IS and
// link the official tutorial for exact rules.
const PARTS = [
  {
    key: "legend",
    label: "Legend",
    count: "1",
    n: 1,
    color: "#f5a524",
    desc: "Your identity card. It sets the deck's direction and which Champion you build around — every deck starts here.",
  },
  {
    key: "champion",
    label: "Champion",
    count: "1",
    n: 1,
    color: "#e5484d",
    desc: "Your signature unit, tied to your Legend (e.g. Master Yi, Tempered for Master Yi, Wuju Bladesman).",
  },
  {
    key: "main",
    label: "Main deck",
    count: "~40",
    n: 40,
    color: "#34d17e",
    desc: "Your Units, Spells and Gear — where most of your strategy lives. This is the pile you draw from all game.",
  },
  {
    key: "runes",
    label: "Runes",
    count: "12",
    n: 12,
    color: "#3b82f6",
    desc: "Your resource cards. Their colours must match your deck's domains — that's how you reliably cast your cards.",
  },
  {
    key: "battlefields",
    label: "Battlefields",
    count: "3",
    n: 3,
    color: "#a855f7",
    desc: "The locations you contest during the game. Fights happen here.",
  },
  {
    key: "side",
    label: "Sideboard",
    count: "up to 8",
    n: 8,
    color: "#8b8f9a",
    desc: "Extra cards you can swap in between games at tournaments to tune your deck to each matchup.",
  },
] as const;

const TOTAL = PARTS.reduce((s, p) => s + p.n, 0);

export function DeckAnatomy() {
  const [active, setActive] = useState(2); // start on the main deck — the big one
  const part = PARTS[active];

  return (
    <div className="card-surface p-5">
      {/* Proportional stack */}
      <div className="flex h-12 w-full gap-1 overflow-hidden rounded-lg" role="tablist" aria-label="Deck parts">
        {PARTS.map((p, i) => (
          <button
            key={p.key}
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            title={`${p.label} (${p.count})`}
            className={`group relative min-w-[26px] rounded-md transition-all duration-300 ${i === active ? "ring-2 ring-white/70" : "opacity-70 hover:opacity-100"}`}
            style={{ flexGrow: p.n, backgroundColor: `${p.color}40`, boxShadow: `inset 0 0 0 1.5px ${p.color}` }}
          >
            <span className="absolute inset-0 grid place-items-center text-[10px] font-extrabold uppercase tracking-wide text-white/90 sm:text-xs">
              {p.n >= 8 ? p.label : ""}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-wide text-slate-600">
        <span>tap a segment</span>
        <span>{TOTAL}-card tournament list</span>
      </div>

      {/* Detail */}
      <div key={part.key} className="animate-fade-up mt-4 flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-900/60 p-4">
        <span className="mt-0.5 h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: part.color }} />
        <div>
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-extrabold text-white">{part.label}</h3>
            <span className="text-xs font-bold" style={{ color: part.color }}>{part.count} {part.n === 1 ? "card" : "cards"}</span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">{part.desc}</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Want the full breakdown with costs? Read{" "}
        <Link href="/guides/how-a-riftbound-deck-is-built" className="font-semibold text-brand-400 hover:underline">
          How a Riftbound deck is built →
        </Link>{" "}
        or price any list in the{" "}
        <Link href="/deck" className="font-semibold text-brand-400 hover:underline">
          deck builder →
        </Link>
      </p>
    </div>
  );
}
