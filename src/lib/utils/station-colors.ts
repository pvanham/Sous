/**
 * Station color mapping for shift cards and schedule views.
 * Each station has background, border, and dark mode variants.
 */
export const stationColors: Record<string, string> = {
  Grill: "bg-red-200 border-red-400 dark:bg-red-900/50 dark:border-red-700",
  Prep: "bg-green-200 border-green-400 dark:bg-green-900/50 dark:border-green-700",
  Assembly: "bg-blue-200 border-blue-400 dark:bg-blue-900/50 dark:border-blue-700",
  Register: "bg-purple-200 border-purple-400 dark:bg-purple-900/50 dark:border-purple-700",
  default: "bg-gray-200 border-gray-400 dark:bg-gray-800/50 dark:border-gray-600",
};

/**
 * Get the full station color classes (background + border) for a station.
 */
export function getStationColor(station: string): string {
  return stationColors[station] ?? stationColors.default;
}

/**
 * Station background-only colors for legend swatches.
 */
export const stationBgColors: Record<string, string> = {
  Grill: "bg-red-300 dark:bg-red-700",
  Prep: "bg-green-300 dark:bg-green-700",
  Assembly: "bg-blue-300 dark:bg-blue-700",
  Register: "bg-purple-300 dark:bg-purple-700",
  default: "bg-gray-300 dark:bg-gray-600",
};

/**
 * Get the background-only color class for a station (used in legends/swatches).
 */
export function getStationBgClass(station: string): string {
  return stationBgColors[station] ?? stationBgColors.default;
}
