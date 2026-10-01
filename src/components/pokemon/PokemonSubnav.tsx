"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The Pokémon section's own navigation strip, under the site header on every
// /pokemon page (app/pokemon/layout.tsx). The section keeps its links to
// itself: the site header and rail stay Riftbound's, and this is how a visitor
// moves around inside Pokémon and back out.
const TABS = [
  { href: "/pokemon", label: "Overview", exact: true },
  { href: "/pokemon/sealed", label: "All sealed" },
  { href: "/pokemon/sets", label: "Sets" },
] as const;

export function PokemonSubnav() {
  const pathname = usePathname() ?? "";
  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-ink-800 bg-ink-900/70 px-3 py-2">
      <span className="flex items-center gap-2 text-sm font-extrabold text-white">
        <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full border-2 border-ink-950 bg-gradient-to-b from-rose-500 from-50% to-white to-50% shadow" />
        Pokémon TCG
        <span className="chip bg-sky-500/15 text-[10px] font-semibold text-sky-300">Beta</span>
      </span>
      <nav aria-label="Pokémon section" className="flex flex-wrap gap-1">
        {TABS.map((t) => {
          const on = active(t.href, "exact" in t ? t.exact : false);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`tap-link rounded-md px-2.5 py-1 text-sm font-semibold transition-colors ${
                on ? "bg-brand-500/15 text-brand-300" : "text-slate-400 hover:bg-ink-800 hover:text-white"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Link href="/" className="tap-link ml-auto text-xs font-semibold text-slate-400 hover:text-white">
        Riftbound prices →
      </Link>
    </div>
  );
}
