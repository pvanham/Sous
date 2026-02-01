"use client";

import { cn } from "@/lib/utils";
import type { AvailabilityPreference } from "@/types/staff-availability";

interface AvailabilitySlotProps {
  preference: AvailabilityPreference;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Individual slot component for the availability grid.
 * Displays visual state (preferred/available/unavailable) and handles click-to-toggle.
 */
export function AvailabilitySlot({
  preference,
  onClick,
  disabled = false,
}: AvailabilitySlotProps) {
  // Get display content based on preference
  const getContent = () => {
    switch (preference) {
      case "preferred":
        return (
          <span className="text-lg" aria-label="Preferred">
            ★
          </span>
        );
      case "available":
        return (
          <span className="text-lg" aria-label="Available">
            ✓
          </span>
        );
      case "unavailable":
      default:
        return (
          <span className="text-lg text-muted-foreground" aria-label="Unavailable">
            ✗
          </span>
        );
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-16 w-full rounded-md border-2 transition-all duration-150",
        "flex items-center justify-center",
        "hover:scale-105 hover:shadow-md",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none",
        // Preference-based styling
        preference === "preferred" && [
          "bg-green-100 border-green-500 text-green-700",
          "dark:bg-green-900/30 dark:border-green-600 dark:text-green-400",
        ],
        preference === "available" && [
          "bg-blue-100 border-blue-500 text-blue-700",
          "dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-400",
        ],
        preference === "unavailable" && [
          "bg-gray-100 border-gray-300",
          "dark:bg-gray-800 dark:border-gray-600",
        ]
      )}
      title={`Click to change from ${preference}`}
    >
      {getContent()}
    </button>
  );
}
