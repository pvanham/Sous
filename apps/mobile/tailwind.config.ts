import type { Config } from "tailwindcss";
import sousPreset from "@sous/config/tailwind-preset";

const config: Config = {
  presets: [sousPreset],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
