import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#060A28",
          900: "#09103A",
          800: "#0D1852",
          700: "#0F1A5C",
          600: "#1A2870",
        },
        brand: {
          cobalt: "#1E4ED8",
          royal: "#2B5CE0",
          sky: "#5080FF",
          pale: "#8AAFFF",
        },
        accent: {
          blue: "#2B5CE0",
          sky: "#5080FF",
          green: "#10B981",
          red: "#EF4444",
          amber: "#F59E0B",
        },
      },
      fontFamily: {
        sans: ["'Figtree'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
