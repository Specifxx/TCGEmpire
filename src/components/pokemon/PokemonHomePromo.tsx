"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import { pokemonSectionOn } from "@/lib/pokemon/flag";

// The six homepages' one line about the Pokémon section (2026-10-01, owner:
// "in the homepage … something like try out our Pokemon sealed products").
// Static copy and links only: no data read, so it cannot slow or break a
// Riftbound homepage, and it renders nothing while the section is off.
// `pokemon_promo_click` (by `target`) is how the POC's homepage reach is
// measured against the section's own traffic.
const LINKS = [
  { href: "/pokemon/sealed?type=booster-box", label: "Booster boxes", target: "booster-box" },
  { href: "/pokemon/sealed?type=etb", label: "Elite Trainer Boxes", target: "etb" },
  { href: "/pokemon/sets", label: "By set", target: "sets" },
];

export function PokemonHomePromo() {
  if (!pokemonSectionOn()) return null;
  const click = (target: string) => trackEvent("pokemon_promo_click", { surface: "home", target });
  return (
    <section
      aria-label="Pokémon sealed prices"
      className="card-surface flex flex-wrap items-center gap-x-4 gap-y-3 border-l-2 border-rose-500 bg-ink-900 px-5 py-4"
    >
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-ink-950 bg-gradient-to-b from-rose-500 from-50% to-white to-50% shadow" />
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-sm font-extrabold text-white">
          New: Pokémon sealed prices <span className="chip ml-1 bg-sky-500/15 align-middle text-[10px] font-semibold text-sky-300">Beta</span>
        </p>
        <p className="text-xs text-slate-400">
          Booster boxes, Elite Trainer Boxes and bundles, compared on TCGplayer and eBay in your market.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} onClick={() => click(l.target)} className="chip tap-link bg-ink-800 text-slate-300 hover:bg-ink-700 hover:text-white">
            {l.label}
          </Link>
        ))}
        <Link href="/pokemon" onClick={() => click("hub")} className="btn-primary px-3 py-1.5 text-xs">
          Try Pokémon sealed →
        </Link>
      </div>
    </section>
  );
}
