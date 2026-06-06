"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// A small click-to-open nav dropdown used to group secondary tabs on desktop.
export function NavDropdown({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; desc?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-ink-800 hover:text-white"
      >
        {label}
        <svg className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-ink-700 bg-ink-850/95 p-1 shadow-2xl backdrop-blur">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 hover:bg-ink-800"
            >
              <div className="text-sm font-medium text-white">{it.label}</div>
              {it.desc && <div className="text-xs text-slate-500">{it.desc}</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
