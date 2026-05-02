import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        kilani: {
          gold: "#C9A84C",
          white: "#FFFFFF",
          black: "#1A1A1A",
          soft: "#F5F5F5",
        },
      },
      fontFamily: {
        sans: ["var(--font-lato)", "Lato", "sans-serif"],
        body: ["var(--font-lato)", "Lato", "sans-serif"],
        heading: ["var(--font-raleway)", "Raleway", "sans-serif"],
      },
    },
  },
} satisfies Config;
