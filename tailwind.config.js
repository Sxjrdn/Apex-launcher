/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bgTop: "#0b0813",
        bgBottom: "#040206",
        surface: "#110b1a",
        surface2: "#170f24",
        surface3: "#211533",
        borderSoft: "rgba(168, 85, 247, 0.18)",
        borderStrong: "rgba(168, 85, 247, 0.45)",
        accent: "#9333ea",
        accentLight: "#c084fc",
        accentDark: "#581c87",
        muted: "#9385a4",
      },
    },
  },
  plugins: [],
};