import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Clean, low-saturation dark palette (CSFloat-style): near-black surfaces,
        // cool grey borders, restrained accents — no neon.
        ink: {
          950: "#0a0c10",
          900: "#0e1116",
          850: "#13171f",
          800: "#191e28",
          700: "#252b38",
          600: "#333b4d",
        },
        // The single sharp accent — RiftCompare green, used sparingly for primary
        // actions + active states. Everything else stays neutral graphite.
        brand: {
          DEFAULT: "#1ea65c",
          400: "#34d17e",
          500: "#1ea65c",
          600: "#188a4c",
        },
        // "accent" now reads as the high-contrast NUMERAL colour — a near-white ink
        // for prices, so figures stay crisp and neutral like a trading desk.
        accent: "#eef1f5",
        // Muted brass — reserved for genuine gold/foil semantics only, never UI chrome.
        gold: "#caa85a",
        // Market deltas: gains/losses on the terminal. Calm, not neon.
        up: "#3fb950",
        down: "#f0506e",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        // Headings: JetBrains Mono (same face as prices/tickers) — applied via the
        // `h1`-`h3` base-style rule in globals.css, not per-component, so it lands
        // sitewide in one place. Body copy stays Inter.
        display: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
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
        card: "0 1px 0 rgba(255,255,255,0.02), 0 1px 2px rgba(0,0,0,0.4)",
        // Kept for API compatibility, neutralised to a quiet elevation (no neon).
        glow: "0 1px 0 rgba(255,255,255,0.03), 0 4px 12px rgba(0,0,0,0.45)",
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
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
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
        // Seamless horizontal ticker: the track holds two identical halves and
        // slides exactly one half-width, so the loop point is invisible.
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        "fade-in": "fade-in 0.6s ease-out both",
        float: "float 4s ease-in-out infinite",
        blob: "blob 16s ease-in-out infinite",
        "glow-pulse": "glow-pulse 3.4s ease-in-out infinite",
        marquee: "marquee 22s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
