/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          // Dark Blue - Primary color from Nigel (#311082)
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#311082", // Main brand color
          700: "#280d6b",
          800: "#1f0a54",
          900: "#16073d",
          950: "#0d0426",
        },
        accent: {
          // Green - Accent color from Nigel (#7AD801)
          50: "#f7fee7",
          100: "#ecfccb",
          200: "#d9f99d",
          300: "#bef264",
          400: "#a3e635",
          500: "#7AD801", // Main accent color
          600: "#65b801",
          700: "#4d8b01",
          800: "#3d6e01",
          900: "#2e5201",
          950: "#1f3601",
        },
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
      },
      fontFamily: {
        sans: [
          "DM Sans",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        display: ["Outfit", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-brand": "0 0 80px -12px rgba(14, 165, 233, 0.35)",
        "card-lg": "0 25px 50px -12px rgba(0, 0, 0, 0.45)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "40px 40px",
        "grid-sm": "28px 28px",
      },
    },
  },
  plugins: [],
};
