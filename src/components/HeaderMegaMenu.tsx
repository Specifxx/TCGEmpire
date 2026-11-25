"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { HeaderMenu } from "./nav-groups";

// The header's dropdown menus (owner, 2026-11-09: "I prefer drop-down menus for navigation"). One list drives them
// (HEADER_MENUS in nav-groups.ts, picked from NAV_GROUPS) so header, rail, phone menu and launcher agree.
//
// Every panel is in the server HTML, closed with the `hidden` attribute dropped by CSS state, never removed: the links are
// real <a href>s a crawler reads without running script. The label is a link to the section's page; the chevron button opens on click or Enter/Space/ArrowDown; on hover with a short
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
        const next = e.relatedTarget as Node | null;
        if (next && !root.current?.contains(next)) setOpen(null);
      }}
    >
      {menus.map((m, i) => {
        const isOpen = open === i;
        const panel = `${uid}-p${i}`;
        return (
          <div key={m.label} className="relative" onMouseEnter={() => later(i, open === null ? OPEN_DELAY : 0)}>
            {/* The label is a link to the section's own page (owner, 2026-11-23: "every time I click on the drop downs, I expect
                it to be a link"); hover still opens the panel, and the chevron beside it is the button that toggles it. */}
            <div className={`inline-flex items-center rounded-lg hover:bg-ink-800 ${isOpen ? "bg-ink-800" : ""}`}>
              <Link
                href={m.href}
                prefetch={false}
                onClick={() => { clear(); setOpen(null); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setOpen(i); requestAnimationFrame(() => document.getElementById(panel)?.querySelector<HTMLElement>("a")?.focus()); }
                }}
                className={`whitespace-nowrap rounded-l-lg py-2 pl-2.5 pr-1 text-sm font-medium hover:text-white [@media(pointer:coarse)]:py-3.5 ${isOpen ? "text-white" : "text-slate-200"}`}
              >
                {m.label}
              </Link>
              <button
                type="button"
                ref={(el) => { triggers.current[i] = el; }}
                aria-label={`${m.label} menu`}
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
                className={`inline-flex items-center self-stretch rounded-r-lg pl-1 pr-2.5 hover:text-white [@media(pointer:coarse)]:px-3 ${isOpen ? "text-white" : "text-slate-200"}`}
              >
                <svg viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg>
              </button>
            </div>
            <div
              id={panel}
              data-open={isOpen}
              // Safari and Firefox on macOS do not focus a link on mousedown, so the root's onBlur saw a null relatedTarget
              // and closed the panel BEFORE the click landed: the items looked right and could not be clicked (owner,
              // 2026-11-16). Keep focus where it is on mousedown; the link's own click still navigates.
              onMouseDown={(e) => e.preventDefault()}
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
                          <Link href={l.href} prefetch={false} onClick={() => setOpen(null)} className="mm-link">
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
