import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // CSFloat-inspired dark palette
        ink: {
          950: "#0b0e14",
          900: "#0f131c",
          850: "#141925",
          800: "#1a2030",
          700: "#222a3d",
          600: "#2c3650",
        },
        // Australia-themed: green & gold on a dark (CSFloat-style) base.
        brand: {
          DEFAULT: "#16a34a",
          400: "#34d17e",
          500: "#16a34a",
          600: "#15803d",
        },
        accent: "#f5c518", // gold — used for prices & highlights
        gold: "#f7c948",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.25)",
        glow: "0 0 0 1px rgba(22,163,74,0.45), 0 8px 30px rgba(22,163,74,0.22)",
      },
    },
  },
  plugins: [],
};

export default config;
