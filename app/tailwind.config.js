/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      colors: {
        bp: {
          bg: "#0d1f2e",
          bgDeep: "#04101a",
          surface: "#0a1925",
          surfaceTransparent: "rgba(8,22,35,.6)",
          surfaceTop: "rgba(8,22,35,.85)",
          line: "#1e4566",
          gridFine: "#1a3850",
          gridBold: "#2a5476",
          text: "#cfe4f0",
          textDim: "#7da4c0",
          textMuted: "#5a7d96",
          cyan: "#5dd5ff",
          ok: "#5dd5a0",
          warn: "#cfa518",
          err: "#dc3c28",
        },
        wire: {
          L: "#8a3a1f",
          N: "#1e5fb4",
          PEa: "#cfa518",
          PEb: "#2a7a3a",
          err: "#dc3c28",
        },
        plastic: {
          light: "#ece6d6",
          base: "#dfd9c8",
          baseMid: "#cdc6b3",
          baseDark: "#bcb59f",
          shadow: "#bdb6a3",
          ink: "#16120e",
          inkSoft: "#1c1814",
          slot: "#16130f",
          lever: "#0f0c09",
        },
      },
      letterSpacing: {
        widest2: ".22em",
        wider2: ".18em",
      },
      keyframes: {
        ledpulse: { "0%, 100%": { opacity: "1" }, "50%": { opacity: ".35" } },
        errpulse: { "0%, 100%": { opacity: "1" }, "50%": { opacity: ".55" } },
        faultpulse: { "0%, 100%": { opacity: "1" }, "50%": { opacity: ".4" } },
      },
      animation: {
        ledpulse: "ledpulse 1.6s ease-in-out infinite",
        errpulse: "errpulse 1.6s ease-in-out infinite",
        faultpulse: "faultpulse 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
