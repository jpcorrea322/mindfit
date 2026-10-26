import colors from "tailwindcss/colors";

// Dark navy theme. The app's markup is written with light-theme class names
// (bg-white cards, slate text, pale tinted pills), so the palette is remapped per
// utility here: backgrounds and borders go dark, text goes light, vivid hues stay vivid.
const navy = {
  50:  "#f5f7fd",
  100: "#e8edf9",
  200: "#d3dbef",
  300: "#b4c0de",
  400: "#7c8bb3",
  500: "#5b6b94",
  600: "#3a4a78",
  700: "#2c3b6b",
  800: "#1a2546",
  900: "#0e1630",
  950: "#070b1a",
};
const CARD = navy[900];

const HUES = ["red","orange","amber","yellow","lime","green","emerald","teal","cyan","sky","blue","indigo","violet","purple","fuchsia","pink","rose"];

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`;
};
const mapHues = (fn) => Object.fromEntries(HUES.map(h => [h, fn(colors[h])]));

// Pale tints become translucent glows of the hue; solid shades are kept
const bgHue = (c) => ({ ...c, 50: rgba(c[500], 0.10), 100: rgba(c[500], 0.16), 200: rgba(c[500], 0.26), 300: rgba(c[500], 0.4) });
// Dark text shades flip to their light counterparts so they read on navy
const textHue = (c) => ({ ...c, 500: c[400], 600: c[400], 700: c[300], 800: c[200], 900: c[100] });
const borderHue = (c) => ({ ...c, 100: rgba(c[500], 0.22), 200: rgba(c[500], 0.32), 300: rgba(c[500], 0.5) });

const bgSlate     = { 50: "#121b38", 100: "#18233f", 200: "#22305a", 300: "#2c3b6b", 400: navy[500], 500: navy[400], 600: navy[400], 700: navy[300], 800: navy[200], 900: "#02040c", 950: "#02040c" };
const textSlate   = { 50: navy[950], 100: navy[900], 200: navy[700], 300: "#46557f", 400: navy[400], 500: "#95a3c8", 600: navy[300], 700: navy[200], 800: navy[100], 900: navy[50], 950: "#ffffff" };
const borderSlate = { 50: "#141e3c", 100: "#1a2546", 200: "#223058", 300: "#2e3e6e", 400: navy[500], 500: navy[400], 600: navy[400], 700: navy[300], 800: navy[200], 900: navy[100], 950: navy[50] };

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  future: {
    // Hover styles only on devices that can hover, so taps don't leave them stuck on
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: { navy },
      backgroundColor: { ...mapHues(bgHue), white: CARD, slate: bgSlate, gray: bgSlate },
      textColor: { ...mapHues(textHue), slate: textSlate, gray: textSlate },
      borderColor: { ...mapHues(borderHue), white: CARD, slate: borderSlate, gray: borderSlate },
      ringColor: { ...mapHues(textHue), slate: textSlate },
      ringOffsetColor: { DEFAULT: CARD },
    },
  },
  plugins: [],
}
