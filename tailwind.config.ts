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
        // Restrained green accent (used sparingly), muted gold for prices. Lower
        // saturation than before so nothing reads as "bright/tacky".
        brand: {
          DEFAULT: "#3aa06a",
          400: "#5bb98a",
          500: "#3aa06a",
          600: "#2f8456",
        },
        accent: "#cbab63", // muted gold — prices & highlights
        gold: "#cbab63",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // Flat, neutral elevation — no coloured glow.
        card: "0 1px 0 rgba(255,255,255,0.02), 0 6px 20px rgba(0,0,0,0.35)",
        glow: "0 0 0 1px rgba(255,255,255,0.08), 0 8px 28px rgba(0,0,0,0.5)",
      },
    },
  },
  plugins: [],
};

export default config;
