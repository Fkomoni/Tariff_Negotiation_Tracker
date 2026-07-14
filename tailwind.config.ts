import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // SPARK design system's primary (Crimson) — adopted as this app's
        // brand scale, same shape as before, new hue.
        brand: {
          DEFAULT: "#C8102E",
          50: "#fae7ea",
          100: "#f5d4d9",
          200: "#ecabb6",
          300: "#e28392",
          400: "#d9586d",
          500: "#C8102E",
          600: "#a80d26",
          700: "#860b1f",
          800: "#600816",
          900: "#3c050e",
        },
        // SPARK's accent orange — used for pending/warning emphasis
        // (stat-card accents, etc.) where Tailwind's built-in amber isn't
        // specific enough to the brand.
        accent: {
          DEFAULT: "#E87722",
          50: "#fdf1e7",
          100: "#fbe0c6",
          600: "#c25f14",
        },
        ink: {
          950: "#0b0710",
          900: "#120d16",
          850: "#181119",
          800: "#1f1720",
          700: "#2a2029",
          600: "#3a2d38",
          500: "#544456",
          400: "#7a6a7c",
          300: "#a396a4",
          200: "#cbc2cb",
          100: "#e6e0e6",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(200,16,46,0.4), 0 0 24px rgba(200,16,46,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
