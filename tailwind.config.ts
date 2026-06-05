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
        brand: {
          DEFAULT: "#6c5ce7",
          400: "#8b7cf0",
          500: "#6c5ce7",
          600: "#5a48d6",
        },
        accent: "#00d1b2",
        gold: "#f7c948",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.25)",
        glow: "0 0 0 1px rgba(108,92,231,0.4), 0 8px 30px rgba(108,92,231,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
