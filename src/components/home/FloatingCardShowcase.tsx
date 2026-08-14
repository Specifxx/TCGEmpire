import Link from "next/link";
import Image from "next/image";
import { formatMoney } from "@/lib/format";

// The hero's floating chase-card showcase — a real card, at its real live price,
// presented as a stacked/tilted product card (the shape CSFloat uses for skins).
//
// EVERY NUMBER ON IT IS REAL. The card, its image, its price and its store count
// all come from the database at render time; there is no mock, no placeholder and
// no "from $X" rounded for effect. If the featured card has no live price the
// whole component renders nothing rather than showing a card with a blank or
// invented figure — a price-comparison site whose hero shows a fake price is
// worse than one whose hero shows nothing.
//
// WIDE DESKTOP ONLY (≥1400px), and that is deliberate rather than laziness. The
// hero was rebuilt to be search-first and centred (see CinematicHero's header: it
// went from 4 CTAs + 4 stat boxes down to H1 → subhead → search → one stat line),
// so this is positioned absolutely OUTSIDE that column and only where there is
// genuinely spare horizontal room. It never pushes the search box down, never
// reflows the centred composition, and never appears on mobile. See the comment
// on the breakpoint below for the measurements the 1400px cut came from.
//
// Decorative-but-informative: it is a real link to a real card page, so it is
// not aria-hidden — but the stacked ghost layers behind it are.

export interface FeaturedCard {
  slug: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  imageUrl: string;
  priceCents: number;
  currency: string;
  storeCount: number;
}

export function FloatingCardShowcase({ card }: { card: FeaturedCard | null }) {
  if (!card) return null;

  // 1400px, and it is a MEASURED threshold rather than a guessed one. The naive
  // bound is the H1's container — a centred max-w-4xl (896px) block — which would
  // force this to 2xl (1536px) and hide it from every 1440px laptop and every
  // 1512px MacBook Pro. But the container is not what collides: the H1's actual
  // rendered text is 874px across two lines, this card's vertical band is only
  // 205→585px, and the only H1 line inside that band is the SECOND, shorter one.
  //
  // Measured horizontal gap from that line to this card's left edge, forcing the
  // card visible at each width (Chromium, Range.getClientRects over the H1's text
  // nodes, so glyph extents rather than box edges):
  //
  //   1280 →   7px    1366 →  50px    1440 →  87px    1512 → 123px
  //   1536 → 135px    1600 → 167px    1728 → 231px    1920 → 327px
  //
  // Nothing actually intersects even at 1280, but 7px reads as a near-miss, so
  // the cut is at 1400 (≥67px of clearance) — comfortable, and it still reaches
  // the two most common laptop widths. Subheadline and search bar are max-w-2xl
  // (672px) and never come close at any width.
  return (
    <div
      className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 min-[1400px]:block"
      // Above the background layers, below the hero's own text column — so even
      // if a future copy change did collide, the text stays readable.
      style={{ zIndex: 5 }}
    >
      {/* WIDTH ONLY — no fixed height. The first cut of this pinned the wrapper
          to h-[380px] with the card as `absolute inset-0`, which silently clipped
          nothing and instead let the content spill: the image alone is
          236×330 (aspect-[5/7] inside p-3) and the name/set/price block adds
          ~73px, so the real content is ~426px and the price rendered BELOW the
          bordered panel, visually detached from the card it belongs to. Sizing
          from the content instead of guessing a height makes that class of bug
          impossible — the border always wraps everything inside it. */}
      <div className="relative w-[240px]">
        {/* Stacked ghosts — depth only, no content, never announced. inset-0 ties
            them to the real card's height, so they track it automatically if the
            card's content ever changes. */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-2xl border border-ink-700/60 bg-ink-900/50"
          style={{ transform: "translate(18px, 16px) rotate(6deg) scale(0.94)" }}
        />
        <div
          aria-hidden
          className="absolute inset-0 rounded-2xl border border-ink-700/80 bg-ink-900/70"
          style={{ transform: "translate(9px, 8px) rotate(3deg) scale(0.97)" }}
        />

        {/* The real card — statically positioned, so IT is what gives the wrapper
            its height. `animate-float` is a slow drift; the global
            prefers-reduced-motion block in globals.css disables it outright. */}
        <Link
          href={`/card/${card.slug}`}
          className="animate-float pointer-events-auto relative z-10 block rounded-2xl border border-ink-700 bg-ink-900/95 p-3 shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur transition-transform duration-300 hover:-translate-y-1 hover:border-brand-500/60"
        >
          <div className="relative aspect-[5/7] w-full overflow-hidden rounded-xl bg-ink-950">
            <Image
              src={card.imageUrl}
              alt={`${card.name} — Riftbound ${card.setCode} ${card.collectorNumber}`}
              width={216}
              height={302}
              sizes="240px"
              className="h-full w-full object-cover"
              priority
            />
            <span className="absolute left-2 top-2 rounded-md bg-ink-950/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold backdrop-blur">
              Chase card
            </span>
          </div>

          <div className="mt-2.5 px-0.5">
            <div className="truncate text-sm font-bold text-white">{card.name}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              {card.setCode} · {card.collectorNumber}
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <span className="num text-lg font-extrabold leading-none text-accent">
                {formatMoney(card.priceCents, card.currency)}
              </span>
              {/* Omitted entirely at zero rather than rendered as "0 stores",
                  which next to a live price reads as a contradiction (and is one
                  — a price came from somewhere). Only ever states a count it can
                  actually stand behind. */}
              {card.storeCount > 0 && (
                <span className="text-[11px] text-slate-500">
                  {card.storeCount === 1 ? "1 store" : `${card.storeCount} stores`}
                </span>
              )}
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
