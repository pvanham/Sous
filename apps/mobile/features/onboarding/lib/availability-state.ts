import type { StaffAvailabilityDTO } from "@sous/types";

import { defaultDay, type DayState } from "@/features/settings/types";

// ─────────────────────────────────────────────────────────────
// Cross-screen availability helpers.
//
// The settings → Availability screen and the onboarding wizard's
// Availability step both consume the same `StaffAvailabilityDTO[]`
// shape from `/me/availability` and both convert it into the local
// per-day `DayState` map. Lifting the conversion + comparison into
// this module keeps the two screens visually + behaviourally
// identical without duplicating logic.
// ─────────────────────────────────────────────────────────────

export const DAYS: ReadonlyArray<{ id: number; label: string; short: string }> = [
  { id: 0, label: "Sunday", short: "Sun" },
  { id: 1, label: "Monday", short: "Mon" },
  { id: 2, label: "Tuesday", short: "Tue" },
  { id: 3, label: "Wednesday", short: "Wed" },
  { id: 4, label: "Thursday", short: "Thu" },
  { id: 5, label: "Friday", short: "Fri" },
  { id: 6, label: "Saturday", short: "Sat" },
];

export const DEFAULT_FROM = "07:00";
export const DEFAULT_TO = "23:00";

/**
 * Hydrate a 7-day map from the canonical availability rows. Missing
 * days (no `StaffAvailabilityDTO` for that index) are treated as
 * `unavailable` — that matches the scheduler's interpretation on
 * the server.
 */
export function buildDayStates(
  rows: StaffAvailabilityDTO[],
): Record<number, DayState> {
  const state: Record<number, DayState> = {};
  for (let d = 0; d <= 6; d++) state[d] = defaultDay();
  for (const row of rows) {
    if (row.preference === "unavailable") continue;
    if (!row.availableFrom || !row.availableTo) continue;
    state[row.dayOfWeek] = {
      preference: row.preference,
      availableFrom: row.availableFrom,
      availableTo: row.availableTo,
      notes: row.notes ?? "",
    };
  }
  return state;
}

export function daysEqual(a: DayState, b: DayState): boolean {
  return (
    a.preference === b.preference &&
    a.availableFrom === b.availableFrom &&
    a.availableTo === b.availableTo &&
    (a.notes ?? "") === (b.notes ?? "")
  );
}

/**
 * `true` when every day in the map is `unavailable` — used by the
 * onboarding resume logic to detect whether the user already
 * entered availability in a prior session.
 */
export function isAvailabilityEmpty(
  days: Record<number, DayState>,
): boolean {
  for (let d = 0; d <= 6; d++) {
    const state = days[d];
    if (state && state.preference !== "unavailable") return false;
  }
  return true;
}

/**
 * Convert the local `DayState` map back into the wire payload the
 * `/me/availability` PUT endpoint expects. Excludes unavailable
 * days (the server treats absence as unavailable) and drops empty
 * notes so the payload doesn't ship `notes: ""`.
 */
export function daysToPayload(
  days: Record<number, DayState>,
): Array<{
  dayOfWeek: number;
  availableFrom: string;
  availableTo: string;
  preference: DayState["preference"];
  notes?: string;
}> {
  const payload: Array<{
    dayOfWeek: number;
    availableFrom: string;
    availableTo: string;
    preference: DayState["preference"];
    notes?: string;
  }> = [];
  for (const [key, state] of Object.entries(days)) {
    if (state.preference === "unavailable") continue;
    if (!state.availableFrom || !state.availableTo) continue;
    payload.push({
      dayOfWeek: Number(key),
      availableFrom: state.availableFrom,
      availableTo: state.availableTo,
      preference: state.preference,
      notes: state.notes ? state.notes : undefined,
    });
  }
  return payload;
}
