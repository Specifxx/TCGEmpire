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
        // Friendly, vibrant green accent + a warm gold for prices.
        brand: {
          DEFAULT: "#1ea65c",
          400: "#34d17e",
          500: "#1ea65c",
          600: "#188a4c",
        },
        accent: "#ecc14e", // warm gold — prices & highlights
        gold: "#f2c84f",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // Soft elevation + a gentle brand glow for the bubbly look.
        card: "0 1px 0 rgba(255,255,255,0.03), 0 8px 24px rgba(0,0,0,0.35)",
        glow: "0 0 0 1px rgba(52,209,126,0.25), 0 10px 30px rgba(52,209,126,0.16)",
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
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        "fade-in": "fade-in 0.6s ease-out both",
        float: "float 4s ease-in-out infinite",
        blob: "blob 16s ease-in-out infinite",
        "glow-pulse": "glow-pulse 3.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
