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
          950: "#050B18",
          900: "#0A1628",
          800: "#0F2040",
          700: "#1A2E55",
          600: "#1E3A6E",
        },
        accent: {
          blue: "#3B82F6",
          cyan: "#06B6D4",
          green: "#10B981",
          red: "#EF4444",
          amber: "#F59E0B",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
