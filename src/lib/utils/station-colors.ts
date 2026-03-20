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
    darkBg: "dark:bg-amber-500/20",
    darkText: "dark:text-amber-200",
    border: "border-l-4 border-amber-500",
  },
  Sauté: {
    bg: "bg-orange-700/10",
    text: "text-orange-800",
    darkBg: "dark:bg-orange-500/20",
    darkText: "dark:text-orange-200",
    border: "border-l-4 border-orange-500",
  },
  Fry: {
    bg: "bg-yellow-600/10",
    text: "text-yellow-800",
    darkBg: "dark:bg-yellow-500/20",
    darkText: "dark:text-yellow-200",
    border: "border-l-4 border-yellow-400",
  },

  // Prep stations - Sage/Green earth tones
  Prep: {
    bg: "bg-emerald-700/10",
    text: "text-emerald-800",
    darkBg: "dark:bg-emerald-500/20",
    darkText: "dark:text-emerald-200",
    border: "border-l-4 border-emerald-500",
  },
  Salad: {
    bg: "bg-teal-700/10",
    text: "text-teal-800",
    darkBg: "dark:bg-teal-500/20",
    darkText: "dark:text-teal-200",
    border: "border-l-4 border-teal-500",
  },

  // Assembly & Service - Slate/Cool tones
  Assembly: {
    bg: "bg-slate-600/10",
    text: "text-slate-700",
    darkBg: "dark:bg-blue-500/20",
    darkText: "dark:text-blue-200",
    border: "border-l-4 border-blue-500",
  },
  Service: {
    bg: "bg-stone-600/10",
    text: "text-stone-700",
    darkBg: "dark:bg-stone-500/20",
    darkText: "dark:text-stone-200",
    border: "border-l-4 border-stone-400",
  },
  Expo: {
    bg: "bg-zinc-600/10",
    text: "text-zinc-700",
    darkBg: "dark:bg-violet-500/20",
    darkText: "dark:text-violet-200",
    border: "border-l-4 border-violet-500",
  },

  // Specialty stations - Mustard/Warm accents
  Pastry: {
    bg: "bg-pink-600/10",
    text: "text-pink-800",
    darkBg: "dark:bg-pink-500/20",
    darkText: "dark:text-pink-200",
    border: "border-l-4 border-pink-500",
  },
  Bar: {
    bg: "bg-rose-700/10",
    text: "text-rose-800",
    darkBg: "dark:bg-rose-500/20",
    darkText: "dark:text-rose-200",
    border: "border-l-4 border-rose-500",
  },
  Bakery: {
    bg: "bg-yellow-600/10",
    text: "text-yellow-700",
    darkBg: "dark:bg-lime-500/20",
    darkText: "dark:text-lime-200",
    border: "border-l-4 border-lime-500",
  },

  // Front of house - Neutral/Cool tones
  Register: {
    bg: "bg-stone-500/10",
    text: "text-stone-700",
    darkBg: "dark:bg-cyan-500/20",
    darkText: "dark:text-cyan-200",
    border: "border-l-4 border-cyan-500",
  },
  Host: {
    bg: "bg-slate-500/10",
    text: "text-slate-700",
    darkBg: "dark:bg-indigo-500/20",
    darkText: "dark:text-indigo-200",
    border: "border-l-4 border-indigo-500",
  },

  // Default/General
  General: {
    bg: "bg-stone-500/10",
    text: "text-stone-700",
    darkBg: "dark:bg-stone-500/20",
    darkText: "dark:text-stone-200",
    border: "border-l-4 border-stone-400",
  },
  default: {
    bg: "bg-stone-500/10",
    text: "text-stone-700",
    darkBg: "dark:bg-stone-500/20",
    darkText: "dark:text-stone-200",
    border: "border-l-4 border-stone-400",
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

  // Use 500 shade for borders, 10% light / 20% dark opacity for backgrounds
  return {
    bg: `bg-${color}-700/10`,
    text: `text-${color}-800`,
    darkBg: `dark:bg-${color}-500/20`,
    darkText: `dark:text-${color}-200`,
    border: `border-l-4 border-${color}-500`,
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
