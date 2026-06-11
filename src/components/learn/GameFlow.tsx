"use client";

import { useState } from "react";

// "The shape of a game" — a step-through of how a Riftbound game flows at a high
// level. Deliberately altitude-controlled: it teaches the structure (what each
// phase is FOR) and defers exact rules to the official tutorial, so we never
// assert rules text we can't verify.
const STEPS = [
  {
    icon: "🃏",
    title: "Start with your Legend",
    body: "Your Legend defines your deck: its domains, its Champion, its game plan. You and your opponent each bring a full deck built around one.",
  },
  {
    icon: "💠",
    title: "Channel your runes",
    body: "Runes are your resources — their colours match your deck's domains, and they power everything you play. More runes online means bigger turns.",
  },
  {
    icon: "⚔️",
    title: "Deploy units, spells & gear",
    body: "Spend energy to put units on the board, fire off one-shot spells, and equip gear that sticks around. Units carry might — their muscle in a fight.",
  },
  {
    icon: "🏰",
    title: "Battle for battlefields",
    body: "Games are decided at the battlefields — the contested locations each deck brings. Move in, fight for control, and use your tricks at the right moment.",
  },
  {
    icon: "🏆",
    title: "Win the game",
    body: "Control the battlefields, win the fights that matter, and you take the game. The official 15-minute tutorial teaches the exact turn structure and scoring.",
  },
] as const;

export function GameFlow() {
  const [step, setStep] = useState(0);
  const s = STEPS[step];

  return (
    <div className="card-surface p-5">
      {/* Progress */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((x, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            aria-label={`Step ${i + 1}: ${x.title}`}
            className={`h-2 flex-1 rounded-full transition-all duration-300 ${i <= step ? "bg-brand-500" : "bg-ink-700 hover:bg-ink-600"}`}
          />
        ))}
      </div>

      <div key={step} className="animate-fade-up mt-4 min-h-[120px]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-2xl" aria-hidden>{s.icon}</span>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-brand-400">Step {step + 1} of {STEPS.length}</div>
            <h3 className="font-extrabold text-white">{s.title}</h3>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{s.body}</p>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => setStep((v) => Math.max(0, v - 1))} disabled={step === 0} className="btn-ghost text-sm disabled:opacity-40">
          ← Back
        </button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep((v) => Math.min(STEPS.length - 1, v + 1))} className="btn-primary text-sm">
            Next →
          </button>
        ) : (
          <a
            href="https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/how-to-play-get-started/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-sm"
          >
            Learn the full rules (15 min) ↗
          </a>
        )}
      </div>
    </div>
  );
}
