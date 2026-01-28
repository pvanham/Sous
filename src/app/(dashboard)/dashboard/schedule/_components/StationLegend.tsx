"use client";

import { cn } from "@/lib/utils";
import { getStationBgClasses, getStationBorderClass } from "@/lib/utils/station-colors";

interface StationLegendProps {
  /** List of station names to display in the legend */
  stations: string[];
  /** Optional className for custom styling */
  className?: string;
}

/**
 * StationLegend - Displays a horizontal list of station names with their corresponding color swatches.
 * Shows only the stations that exist in the current kitchen config.
 */
export function StationLegend({ stations, className }: StationLegendProps) {
  if (stations.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 text-sm",
        className
      )}
    >
      <span className="font-sans font-medium text-slate-600 dark:text-slate-400">
        Stations:
      </span>
      {stations.map((station) => (
        <div key={station} className="flex items-center gap-1.5">
          <div
            className={cn(
              "w-3 h-3 rounded",
              getStationBgClasses(station),
              getStationBorderClass(station)
            )}
          />
          <span className="text-slate-700 dark:text-slate-300">{station}</span>
        </div>
      ))}
    </div>
  );
}
