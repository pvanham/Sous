/**
 * Warm Industrial Station Color System
 *
 * Design principles:
 * - Muted earth tones (Sage, Terracotta, Mustard, Slate Blue)
 * - Glass-like backgrounds (10% opacity)
 * - Solid 4px left border accent
 * - High-contrast text colors
 * - Works in both light and dark modes
 */

export interface StationColorScheme {
  /** Light mode background (glass-like transparency) */
  bg: string;
  /** Light mode text color */
  text: string;
  /** Dark mode background (glass-like transparency) */
  darkBg: string;
  /** Dark mode text color */
  darkText: string;
  /** Border color (4px left accent) */
  border: string;
}

/**
 * Core station color palette - Muted Earth Tones
 * Maps station names to their color schemes
 */
const stationColorMap: Record<string, StationColorScheme> = {
  // Heat stations - Warm earth tones
  Grill: {
    bg: "bg-amber-700/10",
    text: "text-amber-800",
    darkBg: "dark:bg-amber-700/10",
    darkText: "dark:text-amber-400",
    border: "border-l-4 border-amber-700",
  },
  Sauté: {
    bg: "bg-orange-700/10",
    text: "text-orange-800",
    darkBg: "dark:bg-orange-700/10",
    darkText: "dark:text-orange-400",
    border: "border-l-4 border-orange-700",
  },
  Fry: {
    bg: "bg-yellow-700/10",
    text: "text-yellow-800",
    darkBg: "dark:bg-yellow-700/10",
    darkText: "dark:text-yellow-400",
    border: "border-l-4 border-yellow-700",
  },

  // Prep stations - Sage/Green earth tones
  Prep: {
    bg: "bg-emerald-700/10",
    text: "text-emerald-800",
    darkBg: "dark:bg-emerald-700/10",
    darkText: "dark:text-emerald-400",
    border: "border-l-4 border-emerald-700",
  },
  Salad: {
    bg: "bg-teal-700/10",
    text: "text-teal-800",
    darkBg: "dark:bg-teal-700/10",
    darkText: "dark:text-teal-400",
    border: "border-l-4 border-teal-700",
  },

  // Assembly & Service - Slate/Cool tones
  Assembly: {
    bg: "bg-slate-600/10",
    text: "text-slate-700",
    darkBg: "dark:bg-slate-600/10",
    darkText: "dark:text-slate-300",
    border: "border-l-4 border-slate-600",
  },
  Service: {
    bg: "bg-stone-600/10",
    text: "text-stone-700",
    darkBg: "dark:bg-stone-600/10",
    darkText: "dark:text-stone-300",
    border: "border-l-4 border-stone-600",
  },
  Expo: {
    bg: "bg-zinc-600/10",
    text: "text-zinc-700",
    darkBg: "dark:bg-zinc-600/10",
    darkText: "dark:text-zinc-300",
    border: "border-l-4 border-zinc-600",
  },

  // Specialty stations - Mustard/Warm accents
  Pastry: {
    bg: "bg-amber-600/10",
    text: "text-amber-700",
    darkBg: "dark:bg-amber-600/10",
    darkText: "dark:text-amber-300",
    border: "border-l-4 border-amber-600",
  },
  Bar: {
    bg: "bg-rose-700/10",
    text: "text-rose-800",
    darkBg: "dark:bg-rose-700/10",
    darkText: "dark:text-rose-400",
    border: "border-l-4 border-rose-700",
  },
  Bakery: {
    bg: "bg-yellow-600/10",
    text: "text-yellow-700",
    darkBg: "dark:bg-yellow-600/10",
    darkText: "dark:text-yellow-300",
    border: "border-l-4 border-yellow-600",
  },

  // Front of house - Neutral/Cool tones
  Register: {
    bg: "bg-stone-500/10",
    text: "text-stone-700",
    darkBg: "dark:bg-stone-500/10",
    darkText: "dark:text-stone-300",
    border: "border-l-4 border-stone-500",
  },
  Host: {
    bg: "bg-slate-500/10",
    text: "text-slate-700",
    darkBg: "dark:bg-slate-500/10",
    darkText: "dark:text-slate-300",
    border: "border-l-4 border-slate-500",
  },

  // Default/General
  General: {
    bg: "bg-stone-500/10",
    text: "text-stone-700",
    darkBg: "dark:bg-stone-500/10",
    darkText: "dark:text-stone-300",
    border: "border-l-4 border-stone-500",
  },
  default: {
    bg: "bg-stone-500/10",
    text: "text-stone-700",
    darkBg: "dark:bg-stone-500/10",
    darkText: "dark:text-stone-300",
    border: "border-l-4 border-stone-500",
  },
};

/**
 * Extended color pool for dynamically assigned stations
 * Uses muted earth tones only
 */
const colorPool = [
  "amber",
  "orange",
  "yellow",
  "emerald",
  "teal",
  "slate",
  "stone",
  "zinc",
  "rose",
] as const;

/**
 * Get a deterministic color from the pool based on station name
 */
function getColorFromPool(station: string): StationColorScheme {
  // Simple hash to get consistent color for same station name
  let hash = 0;
  for (let i = 0; i < station.length; i++) {
    hash = (hash << 5) - hash + station.charCodeAt(i);
    hash = hash & hash;
  }
  const colorIndex = Math.abs(hash) % colorPool.length;
  const color = colorPool[colorIndex];

  // Use 700 shade for borders and 10% opacity for backgrounds (muted)
  return {
    bg: `bg-${color}-700/10`,
    text: `text-${color}-800`,
    darkBg: `dark:bg-${color}-700/10`,
    darkText: `dark:text-${color}-400`,
    border: `border-l-4 border-${color}-700`,
  };
}

/**
 * Get the full Tailwind class string for a station's "glass pill" styling
 *
 * @param station - The station name
 * @returns Combined Tailwind classes for background, text, and border
 */
export function getStationClasses(station: string): string {
  const scheme = stationColorMap[station] ?? getColorFromPool(station);
  return `${scheme.bg} ${scheme.darkBg} ${scheme.text} ${scheme.darkText} ${scheme.border}`;
}

/**
 * Get just the station color scheme object (for custom usage)
 */
export function getStationColorScheme(station: string): StationColorScheme {
  return stationColorMap[station] ?? getColorFromPool(station);
}

/**
 * Get the background classes only (for legends/swatches)
 */
export function getStationBgClasses(station: string): string {
  const scheme = stationColorMap[station] ?? getColorFromPool(station);
  return `${scheme.bg} ${scheme.darkBg}`;
}

/**
 * Get the text classes only
 */
export function getStationTextClasses(station: string): string {
  const scheme = stationColorMap[station] ?? getColorFromPool(station);
  return `${scheme.text} ${scheme.darkText}`;
}

/**
 * Get the border class only
 */
export function getStationBorderClass(station: string): string {
  const scheme = stationColorMap[station] ?? getColorFromPool(station);
  return scheme.border;
}

// Legacy exports for backward compatibility
export const stationColors: Record<string, string> = new Proxy(
  {},
  {
    get(_, prop) {
      if (typeof prop === "string") {
        return getStationClasses(prop);
      }
      return undefined;
    },
  },
);

/**
 * @deprecated Use getStationClasses() instead
 */
export function getStationColor(station: string): string {
  return getStationClasses(station);
}

/**
 * @deprecated Use getStationBgClasses() instead
 */
export const stationBgColors: Record<string, string> = new Proxy(
  {},
  {
    get(_, prop) {
      if (typeof prop === "string") {
        return getStationBgClasses(prop);
      }
      return undefined;
    },
  },
);

/**
 * @deprecated Use getStationBgClasses() instead
 */
export function getStationBgClass(station: string): string {
  return getStationBgClasses(station);
}
