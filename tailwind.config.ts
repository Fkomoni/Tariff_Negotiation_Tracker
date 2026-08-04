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
        // Structural navy from the design reference — sidebar, login panel,
        // headings. Distinct from the `ink` scale above (a purple-black tuned
        // to the crimson brand); this is the blue-black the new screens use.
        navy: {
          DEFAULT: "#1A1A2E",
          950: "#101024",
          900: "#1A1A2E",
          800: "#262640",
          700: "#33334f",
          600: "#43435f",
          400: "#8b8ba3",
          300: "#a8a8bd",
          200: "#c7c7d6",
        },
        // Neutral surfaces/lines from the design reference.
        surface: {
          page: "#F7F8FA",
          card: "#FFFFFF",
          muted: "#F4F5F7",
        },
        line: {
          DEFAULT: "#DADDE3",
          subtle: "#E6E8EC",
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
        // Orange-tinted lift for the primary action, matching the design
        // reference's raised Sign In / Submit buttons.
        cta: "0 8px 20px -6px rgba(232,119,34,0.55)",
        card: "0 1px 2px rgba(16,16,36,0.04), 0 8px 24px -12px rgba(16,16,36,0.12)",
        panel: "0 12px 40px -16px rgba(16,16,36,0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
