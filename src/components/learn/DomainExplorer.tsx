"use client";

import Link from "next/link";
import { useState } from "react";

// Interactive explorer for the six domains (plus Colorless): tap a domain to see
// its identity, a real example Legend from the database, and a jump into the
// browse page filtered to it. Colors come from the shared DOMAINS palette so the
// whole site agrees on what Fury-red or Calm-green looks like.
export interface DomainInfoProp {
  key: string;
  label: string;
  color: string;
  color2: string;
  blurb: string;
  count: number;
  example: { name: string; href: string; img: string | null } | null;
}

export function DomainExplorer({ domains }: { domains: DomainInfoProp[] }) {
  const [active, setActive] = useState(0);
  const d = domains[active];
  if (!d) return null;

  return (
    <div>
      {/* Selector chips */}
      <div className="flex flex-wrap gap-2">
        {domains.map((x, i) => (
          <button
            key={x.key}
            onClick={() => setActive(i)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-all ${
              i === active
                ? "scale-105 border-transparent text-white shadow-lg"
                : "border-ink-700 text-slate-300 hover:border-ink-500 hover:text-white"
            }`}
            style={i === active ? { background: `linear-gradient(135deg, ${x.color}55, ${x.color2})` } : undefined}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: x.color }} />
            {x.label}
          </button>
        ))}
      </div>

      {/* Detail panel */}
      <div
        key={d.key} // remount so the fade-up animation replays on switch
        className="animate-fade-up mt-4 overflow-hidden rounded-2xl border border-ink-700"
        style={{ background: `radial-gradient(120% 120% at 0% 0%, ${d.color}26, transparent 55%), linear-gradient(160deg, ${d.color2}33, transparent 70%)` }}
      >
        <div className="flex flex-wrap items-center gap-5 p-5">
          {d.example?.img && (
            <Link href={d.example.href} className="group shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={d.example.img}
                alt={d.example.name}
                className="h-40 w-[114px] rounded-lg object-cover shadow-xl ring-1 ring-white/10 transition-transform group-hover:scale-105"
                loading="lazy"
              />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: d.color }} />
              <h3 className="text-lg font-extrabold text-white">{d.label}</h3>
              <span className="chip bg-ink-900/70 text-xs text-slate-300">{d.count} cards</span>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">{d.blurb}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              {d.example && (
                <Link href={d.example.href} className="font-semibold text-white underline-offset-2 hover:underline">
                  See {d.example.name} →
                </Link>
              )}
              <Link href={`/browse?domain=${d.key}`} className="font-semibold text-brand-400 hover:underline">
                Browse all {d.label} cards →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
