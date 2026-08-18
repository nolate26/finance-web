import type { Config } from "tailwindcss";

/**
 * Manual de Identidad Corporativa — PATRIA INVESTMENTS / MONEDA PATRIA INVESTMENTS.
 * Esta es la ÚNICA paleta permitida en la plataforma: no usar colores genéricos de
 * Tailwind (slate-800, blue-600, etc.) ni defaults de Recharts.
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts}",
  ],
  theme: {
    extend: {
      colors: {
        patria: {
          // Main blues
          "dark-blue":       "#0D0D38", // rgb(13, 13, 56)
          blue:              "#001EAF", // rgb(0, 30, 175)
          "king-blue":       "#2044DC", // rgb(32, 68, 220)
          "dark-sky-blue":   "#4571FF", // rgb(69, 113, 255)
          "sky-blue":        "#88AAFF", // rgb(136, 170, 255)
          // Secondary
          orange:            "#FF6B06", // rgb(255, 107, 6)
          "light-orange":    "#FFBB8D", // rgb(255, 187, 141)
          pink:              "#F8485E", // rgb(248, 72, 94)
          "light-pink":      "#FF99AF", // rgb(255, 153, 175)
          turquoise:         "#46E8E0", // rgb(70, 232, 224)
          "light-turquoise": "#B6FFE3", // rgb(182, 255, 227)
        },
      },
      fontFamily: {
        // Regla 1 — Aptos, solo para títulos principales.
        primary:   ["Aptos", "'Aptos Display'", "'Segoe UI'", "system-ui", "sans-serif"],
        // Reglas 2/4/5 y ejes de gráficos — Arial para todo lo demás.
        secondary: ["Arial", "Helvetica", "sans-serif"],
        // Default del proyecto = Arial (Regla 4: cuerpos de tabla y texto general).
        sans:      ["Arial", "Helvetica", "sans-serif"],
        mono:      ["var(--font-mono)", "'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
