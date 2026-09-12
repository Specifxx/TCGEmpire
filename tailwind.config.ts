import type { Config } from "tailwindcss";

// THEMEABLE TOKENS. Every neutral below is `rgb(var(--c-<name>) / <alpha-value>)`
// rather than a hex, so the light theme can remap the whole palette from
// globals.css (`:root` = dark, `:root[data-theme="light"]` = light) without a
// single className changing — the same `text-white` / `bg-ink-900` /
// `text-slate-400` renders correctly in both. `<alpha-value>` keeps the
// `bg-ink-900/95`-style opacity modifiers working. The dark values in
// globals.css are the exact hexes that used to live here, so dark mode is
// pixel-identical. tests/theme.test.ts pins that every variable named here is
// defined in both palettes and that the light one clears WCAG AA where the
// dark one does. See src/lib/theme-shared.ts for how the attribute is set.
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Clean, low-saturation dark palette (CSFloat-style): near-black surfaces,
        // cool grey borders, restrained accents — no neon.
        ink: {
          950: v("ink-950"), // dark #0a0c10
          900: v("ink-900"), // dark #0e1116
          850: v("ink-850"), // dark #13171f
          800: v("ink-800"), // dark #191e28
          700: v("ink-700"), // dark #252b38
          600: v("ink-600"), // dark #333b4d
        },
        // The single sharp accent — RiftCompare green, used sparingly for primary
        // actions + active states. Everything else stays neutral graphite.
        brand: {
          DEFAULT: "#1ea65c",
          // 400 is the LINK shade (text-brand-400, ~300 usages). #34d17e is fine
          // on dark ink and unreadable on white, so it alone is themed; 500/600
          // are fills and borders and stay fixed.
          400: v("brand-400"), // dark #34d17e
          500: "#1ea65c",
          600: "#188a4c",
        },
        // Muted greys, LIFTED to clear WCAG AA on this palette's surfaces.
        //
        // Tailwind's stock slate-500 (#64748b) measures 4.11:1 on ink-950 and
        // 3.97:1 on ink-900 — under the 4.5:1 body-text floor — and slate-600 is
        // far worse. Between them they were 548 + 112 usages, i.e. most of the
        // site's secondary text, and the single largest accessibility failure in
        // the audit. These replacements keep the same visual ramp (400 lighter
        // than 500 lighter than 600) and the same restrained, low-saturation
        // character, while clearing 4.5:1 on both surfaces with margin:
        //   500 #8593a6 → 6.05:1 on ink-900
        //   600 #76828f → 4.82:1 on ink-900
        // Changing the token rather than 660 class names means it cannot be
        // half-applied, and a new component that reaches for text-slate-500 is
        // accessible by default.
        // The full ramp is themed (not just 500/600): text-slate-400 alone is
        // ~630 usages, and Tailwind's stock #94a3b8 is 2.5:1 on white.
        slate: {
          100: v("slate-100"), // dark: Tailwind stock #f1f5f9
          200: v("slate-200"), // dark: stock #e2e8f0
          300: v("slate-300"), // dark: stock #cbd5e1
          400: v("slate-400"), // dark: stock #94a3b8
          500: v("slate-500"), // dark #8593a6 (lifted, see above)
          600: v("slate-600"), // dark #76828f (lifted, see above)
          700: v("slate-700"), // dark: stock #334155
          800: v("slate-800"), // dark: stock #1e293b
          900: v("slate-900"), // dark: stock #0f172a
        },
        // `text-white` is the primary text colour (~900 usages); in the light
        // theme it is near-black ink. bg-black overlays are NOT themed on purpose.
        white: v("white"),
        // "accent" now reads as the high-contrast NUMERAL colour — a near-white ink
        // for prices, so figures stay crisp and neutral like a trading desk.
        accent: v("accent"), // dark #eef1f5
        // Muted brass — reserved for genuine gold/foil semantics only, never UI chrome.
        gold: v("gold"), // dark #caa85a
        // Market deltas: gains/losses on the terminal. Calm, not neon.
        up: v("up"), // dark #3fb950
        down: v("down"), // dark #f0506e
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        // Headings: Fraunces, a sharp flared serif — the Beaufort-style look-alike
        // (see the note in layout.tsx). Applied via the `h1`-`h3` base-style rule in
        // globals.css, not per-component, so it lands sitewide in one place. Body
        // copy stays Inter — the Spiegel-style look-alike.
        display: ["var(--font-display)", "Georgia", "Cambria", "Times New Roman", "serif"],
        // Monospace — prices, tickers, tabular figures (the terminal voice).
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      // Tightened radius scale: the default Tailwind curves (12–24px) read soft and
      // consumer-app; a terminal squares off. One scale change sharpens every panel,
      // card and button sitewide without touching a component.
      borderRadius: {
        md: "4px",
        lg: "6px",
        xl: "8px",
        "2xl": "10px",
        "3xl": "12px",
      },
      boxShadow: {
        // Flat panels: a hairline top highlight + a quiet drop. No coloured glow.
        card: "var(--shadow-card)", // dark: 0 1px 0 rgba(255,255,255,0.02), 0 1px 2px rgba(0,0,0,0.4)
        // Kept for API compatibility, neutralised to a quiet elevation (no neon).
        glow: "var(--shadow-glow)", // dark: 0 1px 0 rgba(255,255,255,0.03), 0 4px 12px rgba(0,0,0,0.45)
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        // REMOVED: `float`. Nothing referenced `animate-float` once the hero's
        // floating chase-card showcase became the affiliate rails, and this
        // entry was a live hazard rather than dead weight: globals.css declared
        // its OWN `.animate-float` (rc-float, 14px/7s) after @tailwind
        // utilities, so this 4px/4s version was permanently shadowed. Deleting
        // only the CSS half would have left the class name working with
        // different motion, which is worse than either.
        // Slow, organic drift for the blurred hero "aurora" blobs.
        blob: {
          "0%,100%": { transform: "translate(0px,0px) scale(1)" },
          "33%": { transform: "translate(26px,-18px) scale(1.08)" },
          "66%": { transform: "translate(-20px,14px) scale(0.94)" },
        },
        // Gentle brand-glow breathing for emphasis chips/icons.
        "glow-pulse": {
          "0%,100%": { opacity: "0.5", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.06)" },
        },
        // Continuous right-to-left ticker. Translates by exactly -50%: the
        // caller renders its track content TWICE back-to-back (see
        // MarketPulse.tsx), so -50% is precisely one full copy's width and the
        // loop point is seamless regardless of how many cards are in it.
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        // A sheen travelling across gold text. Drives ONLY the `.premium-shimmer`
        // utility in globals.css, which supplies the gradient and the
        // background-clip:text plumbing this animates the position of.
        //
        // DEFINED HERE AND NOWHERE ELSE, on purpose. globals.css once carried its
        // own copy of a `float` keyframe that silently shadowed this config's
        // version (it declares rules after @tailwind utilities), leaving one class
        // name with two different motions — see the tombstone near the bottom of
        // globals.css. The utility class lives there, the motion lives here.
        "premium-shimmer": {
          "0%": { backgroundPosition: "180% 50%" },
          "100%": { backgroundPosition: "-80% 50%" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        "fade-in": "fade-in 0.6s ease-out both",
        blob: "blob 16s ease-in-out infinite",
        "glow-pulse": "glow-pulse 3.4s ease-in-out infinite",
        marquee: "marquee 42s linear infinite",
        // Slow enough to read as a sheen rather than a blink. Every consumer must
        // also carry motion-reduce:animate-none, matching the marquee in
        // MarketPulse.tsx — the app's only other infinite animation.
        "premium-shimmer": "premium-shimmer 5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
