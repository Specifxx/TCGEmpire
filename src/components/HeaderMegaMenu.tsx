"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { HeaderMenu } from "./nav-groups";

// The header's dropdown menus (owner, 2026-11-09: "I prefer drop-down menus for navigation"). One list drives them
// (HEADER_MENUS in nav-groups.ts, picked from NAV_GROUPS) so header, rail, phone menu and launcher agree.
//
// Every panel is in the server HTML, closed with the `hidden` attribute dropped by CSS state, never removed: the links are
// real <a href>s a crawler reads without running script. Open on click or Enter/Space/ArrowDown; on hover with a short
// intent delay (so a diagonal move to the panel does not close it); Escape closes and returns focus to the trigger; Left/Right
// move between triggers; focus leaving the menu or a click outside closes it. Shown from 1440px only (the lg-xl header row has no
// slack and the inline search needs its width); below that the Sealed link and the rail / phone menu carry the same destinations.
const OPEN_DELAY = 90;
const CLOSE_DELAY = 160;

export function HeaderMegaMenu({ menus, className = "" }: { menus: HeaderMenu[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const later = useCallback((v: number | null, ms: number) => {
    clear();
    timer.current = setTimeout(() => setOpen(v), ms);
  }, []);

  useEffect(() => {
    if (open === null) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => clear, []);

  return (
    <div
      ref={root}
      className={`items-center gap-0.5 ${className}`}
      onMouseLeave={() => later(null, CLOSE_DELAY)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open !== null) {
          e.stopPropagation();
          const i = open;
          setOpen(null);
          triggers.current[i]?.focus();
        }
      }}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(null);
      }}
    >
      {menus.map((m, i) => {
        const isOpen = open === i;
        const panel = `${uid}-p${i}`;
        return (
          <div key={m.label} className="relative" onMouseEnter={() => later(i, open === null ? OPEN_DELAY : 0)}>
            <button
              type="button"
              ref={(el) => { triggers.current[i] = el; }}
              aria-expanded={isOpen}
              aria-controls={panel}
              aria-haspopup="true"
              onClick={() => { clear(); setOpen(isOpen ? null : i); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setOpen(i); requestAnimationFrame(() => document.getElementById(panel)?.querySelector<HTMLElement>("a")?.focus()); }
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const n = (i + (e.key === "ArrowRight" ? 1 : menus.length - 1)) % menus.length;
                  triggers.current[n]?.focus();
                  if (open !== null) setOpen(n);
                }
              }}
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-ink-800 hover:text-white [@media(pointer:coarse)]:py-3.5 ${isOpen ? "bg-ink-800 text-white" : "text-slate-200"}`}
            >
              {m.label}
              <svg viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg>
            </button>
            <div
              id={panel}
              data-open={isOpen}
              className={`absolute left-1/2 top-full z-header -translate-x-1/2 pt-2 ${isOpen ? "block" : "hidden"}`}
              style={{ minWidth: `${Math.max(16, m.columns.length * 13)}rem` }}
            >
              <div className="grid gap-x-6 gap-y-4 rounded-xl border border-ink-700 bg-ink-900 p-4 shadow-2xl" style={{ gridTemplateColumns: `repeat(${m.columns.length}, minmax(0, 1fr))` }}>
                {m.columns.map((c) => (
                  <div key={c.title}>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{c.title}</p>
                    <ul className="space-y-0.5">
                      {c.links.map((l) => (
                        <li key={l.href}>
                          <Link href={l.href} prefetch={false} onClick={() => setOpen(null)} className="block whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-slate-200 hover:bg-ink-800 hover:text-white focus-visible:bg-ink-800 focus-visible:text-white">
                            {l.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
