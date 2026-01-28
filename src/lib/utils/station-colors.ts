/**
 * Modern Industrial Station Color System
 *
 * Design principles:
 * - Glass-like backgrounds (10-15% opacity)
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
 * Core station color palette
 * Maps station names to their color schemes
 */
const stationColorMap: Record<string, StationColorScheme> = {
  // Heat stations
  Grill: {
    bg: "bg-rose-500/15",
    text: "text-rose-700",
    darkBg: "dark:bg-rose-500/15",
    darkText: "dark:text-rose-300",
    border: "border-l-4 border-rose-500",
  },
  Sauté: {
    bg: "bg-orange-500/15",
    text: "text-orange-700",
    darkBg: "dark:bg-orange-500/15",
    darkText: "dark:text-orange-300",
    border: "border-l-4 border-orange-500",
  },
  Fry: {
    bg: "bg-amber-500/15",
    text: "text-amber-700",
    darkBg: "dark:bg-amber-500/15",
    darkText: "dark:text-amber-300",
    border: "border-l-4 border-amber-500",
  },

  // Prep stations
  Prep: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-700",
    darkBg: "dark:bg-emerald-500/15",
    darkText: "dark:text-emerald-300",
    border: "border-l-4 border-emerald-500",
  },
  Salad: {
    bg: "bg-teal-500/15",
    text: "text-teal-700",
    darkBg: "dark:bg-teal-500/15",
    darkText: "dark:text-teal-300",
    border: "border-l-4 border-teal-500",
  },

  // Assembly & Service
  Assembly: {
    bg: "bg-blue-500/15",
    text: "text-blue-700",
    darkBg: "dark:bg-blue-500/15",
    darkText: "dark:text-blue-300",
    border: "border-l-4 border-blue-500",
  },
  Service: {
    bg: "bg-indigo-500/15",
    text: "text-indigo-700",
    darkBg: "dark:bg-indigo-500/15",
    darkText: "dark:text-indigo-300",
    border: "border-l-4 border-indigo-500",
  },
  Expo: {
    bg: "bg-cyan-500/15",
    text: "text-cyan-700",
    darkBg: "dark:bg-cyan-500/15",
    darkText: "dark:text-cyan-300",
    border: "border-l-4 border-cyan-500",
  },

  // Specialty stations
  Pastry: {
    bg: "bg-violet-500/15",
    text: "text-violet-700",
    darkBg: "dark:bg-violet-500/15",
    darkText: "dark:text-violet-300",
    border: "border-l-4 border-violet-500",
  },
  Bar: {
    bg: "bg-fuchsia-500/15",
    text: "text-fuchsia-700",
    darkBg: "dark:bg-fuchsia-500/15",
    darkText: "dark:text-fuchsia-300",
    border: "border-l-4 border-fuchsia-500",
  },
  Bakery: {
    bg: "bg-pink-500/15",
    text: "text-pink-700",
    darkBg: "dark:bg-pink-500/15",
    darkText: "dark:text-pink-300",
    border: "border-l-4 border-pink-500",
  },

  // Front of house
  Register: {
    bg: "bg-purple-500/15",
    text: "text-purple-700",
    darkBg: "dark:bg-purple-500/15",
    darkText: "dark:text-purple-300",
    border: "border-l-4 border-purple-500",
  },
  Host: {
    bg: "bg-sky-500/15",
    text: "text-sky-700",
    darkBg: "dark:bg-sky-500/15",
    darkText: "dark:text-sky-300",
    border: "border-l-4 border-sky-500",
  },

  // Default/General
  General: {
    bg: "bg-slate-500/15",
    text: "text-slate-700",
    darkBg: "dark:bg-slate-500/15",
    darkText: "dark:text-slate-300",
    border: "border-l-4 border-slate-500",
  },
  default: {
    bg: "bg-slate-500/15",
    text: "text-slate-700",
    darkBg: "dark:bg-slate-500/15",
    darkText: "dark:text-slate-300",
    border: "border-l-4 border-slate-500",
  },
};

/**
 * Extended color pool for dynamically assigned stations
 * Used when a station name doesn't match any preset
 */
const colorPool = [
  "rose",
  "pink",
  "fuchsia",
  "purple",
  "violet",
  "indigo",
  "blue",
  "sky",
  "cyan",
  "teal",
  "emerald",
  "green",
  "lime",
  "yellow",
  "amber",
  "orange",
  "red",
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

  return {
    bg: `bg-${color}-500/15`,
    text: `text-${color}-700`,
    darkBg: `dark:bg-${color}-500/15`,
    darkText: `dark:text-${color}-300`,
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
  }
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
  }
);

/**
 * @deprecated Use getStationBgClasses() instead
 */
export function getStationBgClass(station: string): string {
  return getStationBgClasses(station);
}
