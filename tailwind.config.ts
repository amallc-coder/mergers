import type { Config } from "tailwindcss";

// Clinilytics design system — warm "bone / paper / clay / graphite" palette.
// Token NAMES are preserved (canvas, panel, ink, brand, rust, ochre) so existing
// markup keeps working, but their hex values are realigned to the design-system
// standard: page = bone, surfaces = paper, borders = line, text ramp graphite →
// slate → muted, primary/active = graphite (ink-900), accent = clay, healthy = good.
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Page background (bone) + card surface (paper).
        canvas: "#F4F0E8",
        panel: "#FBF9F4",
        // Design-system tokens, available by name.
        bone: "#F4F0E8",
        paper: "#FBF9F4",
        mist: "#ECE8DE",
        line: "#E4DED2",
        graphite: "#0F0E0C",
        slate: "#57534A",
        muted: "#8B857A",
        good: "#5C8A6E",

        // Primary status / "healthy" green, centered on the design-system `good`.
        brand: {
          50: "#EEF3EE",
          100: "#D9E6DD",
          200: "#BCD2C3",
          300: "#94B79F",
          400: "#739D80",
          500: "#5C8A6E",
          600: "#4A7158",
          700: "#3C5A47",
          800: "#32493B",
          900: "#293A31",
          950: "#16231B",
        },
        // Warm neutral ramp: 100=mist, 200=line, 400=muted, 600=slate, 900=graphite.
        ink: {
          50: "#F7F4EE",
          100: "#ECE8DE",
          200: "#E4DED2",
          300: "#CFC8BB",
          400: "#8B857A",
          500: "#746F64",
          600: "#57534A",
          700: "#46423A",
          800: "#2C2A25",
          900: "#0F0E0C",
          950: "#080706",
        },
        // Accent — clay / terracotta (the design-system primary accent). `rust`
        // keeps its name so existing accent/alert markup adopts clay automatically.
        rust: {
          50: "#FBEEE8",
          100: "#F4D8CB",
          200: "#E3B5A2",
          300: "#D89372",
          400: "#CE7650",
          500: "#C4623C",
          600: "#A54E2D",
          700: "#833D24",
          800: "#5E2D1B",
          900: "#3F1F13",
        },
        clay: {
          DEFAULT: "#C4623C",
          50: "#FBEEE8",
          100: "#F4D8CB",
          200: "#E3B5A2",
          500: "#C4623C",
          600: "#A54E2D",
          700: "#833D24",
        },
        // Ochre / amber accent (warnings).
        ochre: {
          50: "#FBF4E2",
          100: "#F1E2B6",
          200: "#E0C77E",
          300: "#CBA64E",
          400: "#B48A2F",
          500: "#946D25",
          600: "#75561F",
        },
        // Chart / sparkline palette (confirmed).
        chart: {
          ink: "#0F0E0C",
          green: "#5C8A6E",
          taupe: "#46423A",
          clay: "#C4623C",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightish: "-0.015em",
        widest: "0.2em",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,14,12,0.04)",
        panel: "0 1px 2px rgba(15,14,12,0.04)",
        pop: "0 8px 24px -6px rgba(15,14,12,0.18), 0 2px 6px -2px rgba(15,14,12,0.10)",
        modal: "0 8px 24px -6px rgba(15,14,12,0.18), 0 2px 6px -2px rgba(15,14,12,0.10)",
      },
      borderRadius: {
        chip: "0.5rem",
        panel: "0.625rem",
        xl: "0.625rem",
      },
    },
  },
  plugins: [],
};

export default config;
