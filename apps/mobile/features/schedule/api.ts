import type { ShiftDTO, StaffDTO } from "@sous/types";
import { apiClient } from "@/lib/api-client";

// ─────────────────────────────────────────────────────────────
// Schedule tab — server-state access layer.
//
// Responsibilities
//   - Fetch the calling staff member's shifts for a given week.
//   - Fetch the full roster (everyone scheduled) for a given shift,
//     so the staff member can see who they are working alongside.
//
// Backend contract (live as of SHI-10)
//   GET /shifts?weekStart=YYYY-MM-DD
//     • Auth: Clerk JWT (Authorization: Bearer ...) — attached by the
//       Axios interceptor in `lib/api-client.ts`.
//     • `weekStart` is an ISO calendar date (YYYY-MM-DD) interpreted
//       as midnight UTC. The server returns shifts whose `start`
//       falls inside `[weekStart, weekStart + 7d)`. The caller's
//       `staffId` is resolved server-side from the Clerk JWT — we
//       never send a staffId from the client.
//     • 200 → ShiftDTO[]   (empty array allowed; also empty when the
//             caller is a manager/owner with no Staff row)
//     • 400 → { error } when weekStart is missing/malformed
//     • 401 → { error } when the JWT is missing
//
//   GET /shifts/:shiftId/roster
//     • Auth: Clerk JWT.
//     • Returns every Staff record scheduled on the same shift the
//       caller is part of (same `scheduleId` and overlapping time
//       window). Includes the caller themselves so the UI can mark
//       "(you)" without an extra request.
//     • Server enforces RBAC: staff / shift-lead callers must be on
//       the shift; managers / owners may view any roster within
//       their tenant.
//     • 200 → StaffDTO[]
//     • 400 → { error } when shiftId is malformed
//     • 401 → { error } when the JWT is missing
//     • 403 → { error } when the caller is not on the shift
//     • 404 → { error } when the shift does not exist
//
// Wire format
//   The web API serializes `Date` fields (`start`, `end`,
//   `createdAt`, `updatedAt`) as ISO strings. The DTOs declare them
//   as real `Date`s, so we revive them here before returning to the
//   UI. Components rely on actual `Date` objects for time formatting
//   (`toLocaleDateString`, etc.).
//
// Query keys (see docs/architecture/08-mobile-architecture.md §8)
//   - `["schedule", "week", weekStartIso]`
//   - `["schedule", "roster", shiftId]`
// ─────────────────────────────────────────────────────────────

/**
 * Returns all of the current user's shifts whose `start` is in the
 * 7-day window beginning at `weekStart`. The `weekStart` argument is
 * sent as a `YYYY-MM-DD` calendar date so the URL is stable and the
 * TanStack Query cache key is canonical across devices in the same
 * timezone.
 */
export async function fetchWeekShifts(weekStart: Date): Promise<ShiftDTO[]> {
  const weekStartIso = toIsoCalendarDate(weekStart);
  const response = await apiClient.get<SerializedShift[]>("/shifts", {
    params: { weekStart: weekStartIso },
  });
  return response.data.map(reviveShift);
}

/**
 * Returns the full roster of staff working a specific shift. The
 * server-side RBAC check refuses requests from staff who are not on
 * the shift; surface that 403 to the UI so it can show a permission
 * error instead of an empty modal.
 */
export async function fetchShiftRoster(shiftId: string): Promise<StaffDTO[]> {
  const response = await apiClient.get<SerializedStaff[]>(
    `/shifts/${encodeURIComponent(shiftId)}/roster`,
  );
  return response.data.map(reviveStaff);
}

// ── Wire shapes (Date fields arrive as ISO strings) ─────────

type SerializedShift = Omit<
  ShiftDTO,
  "start" | "end" | "createdAt" | "updatedAt"
> & {
  start: string;
  end: string;
  createdAt: string;
  updatedAt: string;
};

type SerializedStaff = Omit<StaffDTO, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

function reviveShift(raw: SerializedShift): ShiftDTO {
  return {
    ...raw,
    start: new Date(raw.start),
    end: new Date(raw.end),
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}

function reviveStaff(raw: SerializedStaff): StaffDTO {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}

/**
 * Format a `Date` as a `YYYY-MM-DD` calendar date in UTC so the value
 * the mobile client sends matches the value the server interprets
 * (which also treats the date as UTC midnight). Using `toISOString`
 * keeps the cache key deterministic across devices regardless of the
 * device's local timezone.
 */
function toIsoCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
