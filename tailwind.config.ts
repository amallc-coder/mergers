import type { Config } from "tailwindcss";

// Provider-grade aesthetic: light warm canvas, near-white cards, muted sage
// green primary, rust/ochre accents. Base font is a clean sans; numbers use
// tabular figures (.tnum / tabular-nums).
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#f4f2ec",
        panel: "#fcfbf8",
        // Primary — muted sage green
        brand: {
          50: "#eef3ea",
          100: "#dde8d3",
          200: "#c2d4b3",
          300: "#a0bb8b",
          400: "#7d9e64",
          500: "#62854a",
          600: "#4f6c3b",
          700: "#405730",
          800: "#354528",
          900: "#2c3a23",
          950: "#16200f",
        },
        // Neutrals — soft warm gray
        ink: {
          50: "#f6f5f0",
          100: "#eeece4",
          200: "#e1ddd0",
          300: "#c8c3b4",
          400: "#9c978a",
          500: "#7a766b",
          600: "#5f5c52",
          700: "#4b4841",
          800: "#383631",
          900: "#262420",
          950: "#161512",
        },
        // Rust / terracotta accent
        rust: {
          50: "#f7e9e2",
          100: "#efd2c5",
          200: "#e0a98f",
          300: "#cf8264",
          400: "#bd5f3e",
          500: "#a94a2c",
          600: "#8f3c23",
          700: "#73301d",
          800: "#5a271a",
          900: "#3f1d14",
        },
        // Ochre / amber accent
        ochre: {
          50: "#f7efd9",
          100: "#eddfb4",
          200: "#dcc47c",
          300: "#c9a64d",
          400: "#b48a2f",
          500: "#946d25",
          600: "#75561f",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(38,36,31,0.04), 0 1px 3px rgba(38,36,31,0.03)",
        pop: "0 8px 24px rgba(38,36,31,0.12)",
      },
      borderRadius: {
        xl: "0.625rem",
      },
    },
  },
  plugins: [],
};

export default config;
