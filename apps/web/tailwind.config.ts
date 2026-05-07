import type { Config } from "tailwindcss";
import sousPreset from "@sous/config/tailwind-preset";

const config: Config = {
  presets: [sousPreset],
  content: ["./src/**/*.{ts,tsx}"],
  // The shared preset already defines colors, fonts, and border-radius.
  // Add any web-only theme extensions here.
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
