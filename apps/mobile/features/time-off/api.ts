import type { TimeOffRequestDTO } from "@sous/types";
import { apiClient } from "@/lib/api-client";
import { toIsoCalendarDate } from "@/lib/date";
import type { CreateTimeOffRequestInput } from "@/types";

// ─────────────────────────────────────────────────────────────
// Time-off tab — server-state access layer.
//
// Responsibilities
//   - List all time-off requests submitted by the calling user.
//   - Submit a new time-off request as the calling user.
//
// Backend contract (live as of SHI-9)
//   GET /time-off
//     • Auth: Clerk JWT (Authorization: Bearer ...) — attached by the
//       Axios interceptor in `lib/api-client.ts`.
//     • Resolves the calling user's Staff record server-side; the
//       client never sends a `staffId`. Returns this staff member's
//       requests sorted by `startDate` desc. Manager / owner callers
//       without a Staff row at the active location get [] (matching
//       the graceful-empty pattern from `/api/shifts`).
//     • 200 → TimeOffRequestDTO[]
//     • 401 → { error } when the JWT is missing
//
//   POST /time-off
//     • Auth: Clerk JWT.
//     • Body: { startDate, endDate, type, reason? } — staffId is
//       resolved server-side, NOT sent by the client.
//     • Server enforces `KitchenConfig.minTimeOffAdvanceDays` (the
//       same rule the web `createTimeOffRequest` action applies).
//     • 200 → TimeOffRequestDTO (status="pending")
//     • 400 → { error } on validation / advance-days violation /
//             duplicate range
//     • 401 → { error } when the JWT is missing
//
// Wire format
//   The web API serialises `Date` fields (`startDate`, `endDate`,
//   `reviewedAt`, `createdAt`, `updatedAt`) as ISO strings. The DTO
//   declares them as real `Date`s, so we revive them here before
//   returning to the UI — the screen relies on `Date.getTime()` for
//   sorting and `toLocaleDateString` for display.
//
// Query keys (see docs/architecture/08-mobile-architecture.md §8)
//   - `["timeOffRequests"]`
// ─────────────────────────────────────────────────────────────

/**
 * Returns every time-off request the calling user has submitted,
 * sorted by start date (most recent first). Date fields arrive as ISO
 * strings on the wire and are revived before being returned.
 */
export async function fetchTimeOffRequests(): Promise<TimeOffRequestDTO[]> {
  const response = await apiClient.get<SerializedTimeOffRequest[]>(
    "/time-off",
  );
  return response.data.map(reviveTimeOffRequest);
}

/**
 * Returns the caller's approved + pending time-off requests overlapping
 * the 7-day window beginning at `weekStart`. Backs the schedule tab's
 * "off day" overlay: a day with an overlapping request renders an
 * approved or pending pill instead of (or alongside) the muted "Off"
 * text. Same `YYYY-MM-DD` calendar-date convention as `fetchWeekShifts`
 * so the two TanStack query keys stay aligned.
 */
export async function fetchTimeOffForWeek(
  weekStart: Date,
): Promise<TimeOffRequestDTO[]> {
  const weekStartIso = toIsoCalendarDate(weekStart);
  const response = await apiClient.get<SerializedTimeOffRequest[]>(
    "/time-off",
    { params: { weekStart: weekStartIso } },
  );
  return response.data.map(reviveTimeOffRequest);
}

/**
 * Submit a new time-off request as the calling user. Sends the form
 * payload as JSON; Axios serialises `Date` fields as ISO strings and
 * the route handler re-parses them via `z.coerce.date()`. Returns the
 * created request (with `status="pending"`) so the screen can
 * optimistically update the list before the next refetch.
 */
export async function submitTimeOffRequest(
  input: CreateTimeOffRequestInput,
): Promise<TimeOffRequestDTO> {
  const response = await apiClient.post<SerializedTimeOffRequest>(
    "/time-off",
    input,
  );
  return reviveTimeOffRequest(response.data);
}

// ── Wire shape (Date fields arrive as ISO strings) ──────────

type SerializedTimeOffRequest = Omit<
  TimeOffRequestDTO,
  "startDate" | "endDate" | "reviewedAt" | "createdAt" | "updatedAt"
> & {
  startDate: string;
  endDate: string;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

function reviveTimeOffRequest(
  raw: SerializedTimeOffRequest,
): TimeOffRequestDTO {
  return {
    ...raw,
    startDate: new Date(raw.startDate),
    endDate: new Date(raw.endDate),
    reviewedAt: raw.reviewedAt ? new Date(raw.reviewedAt) : undefined,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}
