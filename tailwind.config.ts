import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#E31837",
          50: "#fde9ec",
          100: "#fbd3d9",
          200: "#f5a7b3",
          300: "#ef7b8d",
          400: "#e94f67",
          500: "#E31837",
          600: "#c1102c",
          700: "#970e23",
          800: "#6d0a19",
          900: "#43060f",
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
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(227,24,55,0.4), 0 0 24px rgba(227,24,55,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
