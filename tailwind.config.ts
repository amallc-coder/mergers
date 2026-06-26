import type { Config } from "tailwindcss";

// "Clinilytics" provider-grade aesthetic: warm cream canvas, muted earth tones,
// dark-green primary, rust accents, monospace everything. The `brand` (green)
// and `ink` (warm taupe) ramps are consumed throughout the component library,
// so remapping them here re-skins the whole app.
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Canvas + surfaces
        canvas: "#f3eee3",
        panel: "#fbf9f3",
        // Primary — dark olive green
        brand: {
          50: "#eef2ea",
          100: "#dde5d3",
          200: "#c3d0b4",
          300: "#a1b48b",
          400: "#809566",
          500: "#647a4c",
          600: "#4d6139",
          700: "#3e4f30",
          800: "#333f29",
          900: "#2b3524",
          950: "#161c11",
        },
        // Neutrals — warm taupe/stone
        ink: {
          50: "#f6f3ec",
          100: "#ece6d8",
          200: "#ddd4c0",
          300: "#c5b99f",
          400: "#9c9079",
          500: "#7b7160",
          600: "#615949",
          700: "#4d4639",
          800: "#39342a",
          900: "#27221a",
          950: "#17140d",
        },
        // Rust / terracotta accent (warnings, A/R, negatives)
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
        // Ochre / amber accent (pending, caution)
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
        sans: ["var(--font-mono)", "ui-monospace", "monospace"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(39,34,26,0.04)",
        pop: "0 8px 24px rgba(39,34,26,0.12)",
      },
      borderRadius: {
        xl: "0.625rem",
      },
    },
  },
  plugins: [],
};

export default config;
