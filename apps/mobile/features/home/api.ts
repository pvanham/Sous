import type { ShiftDTO } from "@sous/types";
import { apiClient } from "@/lib/api-client";
export { fetchAnnouncements } from "@/features/announcements/api";

// ─────────────────────────────────────────────────────────────
// PHASE-1 ANNOUNCEMENT REWRITE — DO NOT REVERT TO OLD SHAPE
//
// Keep this shim aligned with shared `AnnouncementDTO` while web-only
// manager flows are implemented in later phases.
// ─────────────────────────────────────────────────────────────

// Re-export `fetchWeekShifts` from the schedule feature so the home
// tab can surface the rest of the current week without duplicating
// the wire contract / date-revive logic that lives there.
export { fetchWeekShifts } from "@/features/schedule/api";

// ─────────────────────────────────────────────────────────────
// Home tab — server-state access layer.
//
// Responsibilities
//   - Fetch the staff member's next upcoming shift.
//   - Fetch recent announcements scoped to the current location.
//
// Backend contract (live as of SHI-7)
//   GET /shifts/next
//     • Auth: Clerk JWT (Authorization: Bearer ...) — attached by the
//       Axios interceptor in `lib/api-client.ts`.
//     • Resolves the calling user's Staff record server-side via
//       `StaffService.getByClerkUserId`, then returns the soonest
//       Shift with `start >= now`.
//     • 200 → ShiftDTO | null  (null = no upcoming shifts OR the
//             caller has no Staff linkage at this location)
//     • 401 → { error } when the JWT is missing/invalid
//
//   GET /announcements?limit=20&lifecycle=active|expired
//     • Auth: Clerk JWT.
//     • Returns announcement rows for the caller's location, newest
//       first, including caller-scoped read/ack state.
//     • 200 → AnnouncementListItemDTO[]
//     • 401 → { error } when the JWT is missing/invalid
//
// Wire format
//   `GET /shifts/next` arrives as JSON with ISO date fields and is
//   revived below. Announcement wire-date revival now lives in
//   `features/announcements/api.ts`.
//
// Query keys (see docs/architecture/08-mobile-architecture.md §8)
//   - `["home", "nextShift"]`
//   - `["home", "announcements"]`
// ─────────────────────────────────────────────────────────────

/**
 * Returns the user's next upcoming shift, or `null` when none is
 * scheduled (also `null` when the signed-in user is a manager / owner
 * with no Staff row at this location). Throws on transport / auth
 * errors so TanStack Query surfaces them via its `error` channel.
 */
export async function fetchNextShift(): Promise<ShiftDTO | null> {
  const response = await apiClient.get<SerializedShift | null>(
    "/shifts/next",
  );
  return response.data ? reviveShift(response.data) : null;
}

// ── Wire shape (Date fields arrive as ISO strings) ───────────

type SerializedShift = Omit<ShiftDTO, "start" | "end" | "createdAt" | "updatedAt"> & {
  start: string;
  end: string;
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
