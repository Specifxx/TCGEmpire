// RiftCompare's brand colours, for the places Tailwind's tokens cannot reach:
// generated OG images, HTML email, the route progress bar, the raster icon
// scripts. The site's own UI reads the same values through tailwind.config.ts /
// globals.css (`brand-*`, `ink-*`, `--rc-flame`); keep the two in step.
//
// GREEN again since 2026-11-20 (owner: "bring back the green theme for Rift
// Compare … I don't like the orange kind of logo and orange text"). The brand
// is the pre-rebrand RiftCompare green (#1EA65C, text #34D17E on dark), and the
// logo gradient is the RC mark's own (#6AF0A6 at the top to #1EA65C). The
// Riftbound teal ink from the 2026-10-16 rebrand stays. DECISIONS.md,
// "Rift Compare is green again", 2026-11-20.

/** Primary action fill: buttons, active states. Takes dark ink (`NAVY`). */
export const GREEN = "#1EA65C";
/** Hover fill, and the green used as TEXT on dark surfaces. */
export const GREEN_LIGHT = "#34D17E";
/** The wordmark gradient's top colour. Decoration only. */
export const FLAME_TOP = "#6AF0A6";
/** Riftbound's section teal: hero bands and share-image backgrounds. */
export const TEAL = "#013951";
/** Ink on a green fill. */
export const NAVY = "#1E3043";
/** The page colour of the dark theme (globals.css --page-bg). */
export const PAGE_DARK = "#05161f";

/** The wordmark gradient as [offset 0-1, colour] stops, top to bottom. */
export const FLAME_STOPS: readonly (readonly [number, string])[] = [
  [0, FLAME_TOP],
  [0.58, GREEN],
  [1, GREEN],
];
/** The same gradient as CSS, for inline styles (OG images, email). */
export const FLAME_CSS = `linear-gradient(180deg, ${FLAME_TOP} 0%, ${GREEN} 58%, ${GREEN} 100%)`;
