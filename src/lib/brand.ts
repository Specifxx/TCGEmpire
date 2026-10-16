// RiftCompare's brand colours, for the places Tailwind's tokens cannot reach:
// generated OG images, HTML email, the route progress bar, the raster icon
// scripts. The site's own UI reads the same values through tailwind.config.ts /
// globals.css (`brand-*`, `ink-*`, `--rc-flame`); keep the two in step.
//
// Taken from the official Riftbound site (playriftbound.com, 2026-10-16
// rebrand, DECISIONS.md "The Riftbound rebrand"): its theme object defines
// primary #EF7D00, dark1 #013951, dark2 #1E3043; the buttons hover to #F29733;
// the RIFTBOUND wordmark is a vertical gradient from #D7A63E gold at the top to
// #EF7D00 by ~58% of the letter height, solid orange below it.

/** Primary action fill: buttons, active states. Takes dark ink (`NAVY`). */
export const ORANGE = "#EF7D00";
/** Hover fill, and the orange used as TEXT on dark surfaces (7:1+). */
export const ORANGE_LIGHT = "#F29733";
/** The wordmark gradient's top colour. Decoration only: gold as a UI colour
 *  still means Premium (`gold`, #caa85a). */
export const FLAME_GOLD = "#D7A63E";
/** Riftbound's section teal: hero bands and share-image backgrounds. */
export const TEAL = "#013951";
/** Ink on an orange fill, as the official buttons set it. */
export const NAVY = "#1E3043";
/** The page colour of the dark theme (globals.css --page-bg). */
export const PAGE_DARK = "#05161f";

/** The wordmark gradient as [offset 0-1, colour] stops, top to bottom. */
export const FLAME_STOPS: readonly (readonly [number, string])[] = [
  [0, FLAME_GOLD],
  [0.58, ORANGE],
  [1, ORANGE],
];
/** The same gradient as CSS, for inline styles (OG images, email). */
export const FLAME_CSS = `linear-gradient(180deg, ${FLAME_GOLD} 0%, ${ORANGE} 58%, ${ORANGE} 100%)`;
