import type { AvailabilityPreference } from "@sous/types";

/**
 * Local per-day state on the Availability settings screen. This is
 * the shape consumed both by the screen's `days` map and by the
 * `DayAvailabilitySheet` editor, which is why it lives in `types.ts`
 * rather than being re-exported from the screen module (the sheet
 * and the screen would otherwise introduce a circular import).
 *
 * Fields mirror `StaffAvailabilityDTO` minus the server-owned
 * identifiers (`id`, `orgId`, `locationId`, `staffId`, timestamps).
 */
export interface DayState {
  preference: AvailabilityPreference;
  availableFrom: string | null;
  availableTo: string | null;
  notes: string;
}

export function defaultDay(): DayState {
  return {
    preference: "unavailable",
    availableFrom: null,
    availableTo: null,
    notes: "",
  };
}
