import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "media",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic tokens — values come from CSS vars that flip in dark mode.
        bg: "rgb(var(--bg) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        faint: "rgb(var(--faint) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        brand: "rgb(var(--brand) / <alpha-value>)",
      },
      boxShadow: {
        // Warm, layered elevation (single light source) — real utilities so
        // hover:/focus: variants compile (hover:shadow-lift is the card lift).
        soft: "0 1px 2px rgb(92 62 36 / 0.05), 0 8px 20px rgb(92 62 36 / 0.06)",
        lift: "0 2px 6px rgb(92 62 36 / 0.07), 0 18px 36px rgb(92 62 36 / 0.11)",
      },
    },
  },
  plugins: [],
};

export default config;
