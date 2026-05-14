import type { ShiftDTO } from "@sous/types";
import { apiClient } from "@/lib/api-client";
import type { Announcement } from "@/types";

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
//   GET /announcements?limit=20
//     • Auth: Clerk JWT.
//     • Returns announcements for the caller's location, newest first.
//     • 200 → AnnouncementDTO[]
//     • 401 → { error } when the JWT is missing/invalid
//
// Wire format
//   Both responses arrive as JSON. `start`, `end`, `publishDate`,
//   `expirationDate`,
//   `createdAt`, `updatedAt` come back as ISO strings — the DTOs
//   declare them as `Date`, so we revive them here before returning
//   to the UI. Components rely on real `Date` objects for relative
//   time formatting.
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

/**
 * Returns recent announcements for the caller's location, newest
 * first. Server defaults to 20 entries.
 */
export async function fetchAnnouncements(): Promise<Announcement[]> {
  const response =
    await apiClient.get<SerializedAnnouncement[]>("/announcements");
  return response.data.map(reviveAnnouncement);
}

// ── Wire shapes (Date fields arrive as ISO strings) ─────────

type SerializedShift = Omit<ShiftDTO, "start" | "end" | "createdAt" | "updatedAt"> & {
  start: string;
  end: string;
  createdAt: string;
  updatedAt: string;
};

type SerializedAnnouncement = Omit<
  Announcement,
  "publishDate" | "expirationDate" | "createdAt" | "updatedAt"
> & {
  publishDate: string | null;
  expirationDate: string | null;
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

function reviveAnnouncement(raw: SerializedAnnouncement): Announcement {
  return {
    ...raw,
    publishDate: raw.publishDate ? new Date(raw.publishDate) : null,
    expirationDate: raw.expirationDate ? new Date(raw.expirationDate) : null,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}
