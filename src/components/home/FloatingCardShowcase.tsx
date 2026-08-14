import Link from "next/link";
import Image from "next/image";
import { formatMoney } from "@/lib/format";

// The hero's floating chase-card showcase — a real card, at its real live price,
// presented as a stacked/tilted product card (the shape CSFloat uses for skins).
// Rendered twice, once pinned to each side of the centred hero column.
//
// EVERY NUMBER ON IT IS REAL. The card, its image, its price and its store count
// all come from the database at render time; there is no mock, no placeholder and
// no "from $X" rounded for effect. If the featured card has no live price the
// whole component renders nothing rather than showing a card with a blank or
// invented figure — a price-comparison site whose hero shows a fake price is
// worse than one whose hero shows nothing. Each side is independent: one can
// render while the other stays empty.
//
// WIDE DESKTOP ONLY (≥1400px), and that is deliberate rather than laziness. The
// hero was rebuilt to be search-first and centred (see CinematicHero's header: it
// went from 4 CTAs + 4 stat boxes down to H1 → subhead → search → one stat line),
// so these are positioned absolutely OUTSIDE that column and only where there is
// genuinely spare horizontal room. They never push the search box down, never
// reflow the centred composition, and never appear on mobile. See the comment on
// the breakpoint below for the measurements the 1400px cut came from.
//
// Decorative-but-informative: each is a real link to a real card page, so it is
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

export function FloatingCardShowcase({
  card,
  side,
}: {
  card: FeaturedCard | null;
  side: "left" | "right";
}) {
  if (!card) return null;

  const isLeft = side === "left";
  // Mirrored so the pair reads as a matched set rather than two copies of the
  // same object: the stack fans away from the hero on each side, and the idle
  // tilt leans outward rather than both leaning left.
  const dir = isLeft ? -1 : 1;

  // 1400px, and it is a MEASURED threshold rather than a guessed one. The naive
  // bound is the H1's container — a centred max-w-4xl (896px) block — which would
  // force this to 2xl (1536px) and hide it from every 1440px laptop and every
  // 1512px MacBook Pro. But the container is not what collides: the H1's actual
  // rendered text is 874px across two lines, each card's vertical band is only
  // ~400px tall and centred on the SEARCH BAR, and the only H1 line inside that
  // band is the second, shorter one.
  //
  // Measured horizontal gap from that line to the nearer card edge, forcing the
  // cards visible at each width (Chromium, Range.getClientRects over the H1's
  // text nodes, so glyph extents rather than box edges). The composition is
  // symmetric, so both sides clear by the same amount:
  //
  //   1280 →  27px    1366 →  67px    1400 →  87px    1440 → 107px
  //   1512 → 143px    1600 → 187px    1920 → 347px
  //
  // Nothing actually intersects even at 1280, but the cut is at 1400 so the
  // clearance is comfortable rather than a near-miss. Subheadline and search bar
  // are max-w-2xl (672px) and never come close at any width.
  return (
    <div
      data-rc-showcase={side}
      className={[
        "pointer-events-none absolute top-1/2 hidden -translate-y-1/2 min-[1400px]:block",
        // 32px, not 16px. The ghost stack fans OUTWARD — rotated 6° and pushed
        // 18px away from the hero — so the wrapper's own box understates how far
        // the composition actually reaches: rotating a 240×400 box by 6° widens
        // its half-width to 120·cos6 + 200·sin6 = 140px, and at a 16px inset that
        // put the outer ghost's corner 14px past the viewport edge on both sides.
        // The shell clips it (no horizontal scroll — that was measured), but a
        // faint decorative panel sliced off by the screen edge reads as a
        // rendering bug rather than depth. 32px puts it ~2px inside.
        isLeft ? "left-8" : "right-8",
      ].join(" ")}
      // Above the background layers, below the hero's own text column — so even
      // if a future copy change did collide, the text stays readable.
      style={{ zIndex: 5 }}
    >
      {/* WIDTH ONLY — no fixed height. The first cut of this pinned the wrapper
          to h-[380px] with the card as `absolute inset-0`, which silently clipped
          nothing and instead let the content spill: the image alone is
          216×302 (aspect-[5/7] inside p-3) and the name/set/price block adds
          ~73px, so the real content is ~400px and the price rendered BELOW the
          bordered panel, visually detached from the card it belonged to. Sizing
          from the content instead of guessing a height makes that class of bug
          impossible — the border always wraps everything inside it. */}
      <div className="relative w-[240px]">
        {/* Stacked ghosts — depth only, no content, never announced. inset-0 ties
            them to the real card's height, so they track it automatically if the
            card's content ever changes. */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-2xl border border-ink-700/60 bg-ink-900/50"
          style={{ transform: `translate(${18 * dir}px, 16px) rotate(${6 * dir}deg) scale(0.94)` }}
        />
        <div
          aria-hidden
          className="absolute inset-0 rounded-2xl border border-ink-700/80 bg-ink-900/70"
          style={{ transform: `translate(${9 * dir}px, 8px) rotate(${3 * dir}deg) scale(0.97)` }}
        />

        {/* The real card — statically positioned, so IT is what gives the wrapper
            its height. The float is a slow drift; the global
            prefers-reduced-motion block in globals.css disables it outright. The
            two sides are deliberately out of phase (negative delay = start
            mid-cycle, no initial pause) so they don't bob in lockstep. */}
        <Link
          href={`/card/${card.slug}`}
          className={[
            isLeft ? "animate-float-mirror" : "animate-float",
            "pointer-events-auto relative z-10 block rounded-2xl border border-ink-700 bg-ink-900/95 p-3",
            "shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur transition-transform duration-300",
            "hover:-translate-y-1 hover:border-brand-500/60",
          ].join(" ")}
          style={isLeft ? { animationDelay: "-3.5s" } : undefined}
        >
          <div className="relative aspect-[5/7] w-full overflow-hidden rounded-xl bg-ink-950">
            <Image
              src={card.imageUrl}
              alt={`${card.name} — Riftbound ${card.setCode} ${card.collectorNumber}`}
              width={216}
              height={302}
              sizes="240px"
              className="h-full w-full object-cover"
              // NOT `priority`. next/image's priority emits a <link rel="preload">
              // into the document <head> unconditionally — it has no idea the
              // element is display:none below 1400px — so every phone visitor was
              // downloading a card image they could never see. Default lazy
              // loading is driven by intersection, and a display:none element
              // never intersects, so mobile now fetches nothing at all while
              // wide desktop still loads it immediately (it starts in-viewport).
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
