import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#bcd2ff",
          300: "#8eb4ff",
          400: "#598bff",
          500: "#3464f6",
          600: "#1f47eb",
          700: "#1936d7",
          800: "#1b2fae",
          900: "#1c2d89",
          950: "#161d54",
        },
        ink: {
          50: "#f6f7f9",
          100: "#eceef2",
          200: "#d5d9e2",
          300: "#b0b8c9",
          400: "#8591aa",
          500: "#65738f",
          600: "#505c76",
          700: "#424b60",
          800: "#3a4252",
          900: "#1f2430",
          950: "#14171f",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.04)",
        pop: "0 8px 24px rgba(16,24,40,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
