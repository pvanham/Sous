import type { TimeOffRequestDTO } from "@sous/types";
import type { CreateTimeOffRequestInput } from "@/types";

// ─────────────────────────────────────────────────────────────
// Time-off tab — server-state access layer.
//
// Responsibilities
//   - List all time-off requests submitted by the calling user.
//   - Submit a new time-off request as the calling user.
//
// Backend contract (planned, not yet implemented)
//   GET /time-off
//     • Auth: Clerk JWT.
//     • Resolves the calling user's Staff record server-side; never
//       trust a `staffId` from the client. Returns this staff member's
//       requests sorted by `startDate` desc.
//     • 200 → TimeOffRequestDTO[]
//
//   POST /time-off
//     • Auth: Clerk JWT.
//     • Body: { startDate, endDate, type, reason? } — staffId is
//       resolved server-side, NOT sent by the client.
//     • Server enforces `KitchenConfig.minTimeOffAdvanceDays`
//       (already implemented in the web `time-off-request.actions.ts`)
//       and rejects with a readable message if the request is too
//       close to the start date.
//     • 200 → TimeOffRequestDTO (status=pending)
//     • 400 → { error } on validation / business-rule failure
//     • 401 → { error } when the JWT is missing
//
// Implementation steps when wiring real endpoints
//   1. Replace `fetchTimeOffRequests` body with `apiClient.get("/time-off")`.
//   2. Replace `submitTimeOffRequest` body with
//      `apiClient.post("/time-off", input)` — let Axios serialize the
//      Date fields; the route handler should re-parse with the shared
//      Zod schema from `@sous/types/validations`.
//   3. Drop `makeRequest()` + `delay()` helpers.
//   4. Reuse `CreateTimeOffRequestInput` from `@/types` (which ought
//      to migrate to `@sous/types` so the route handler can validate
//      against the same schema).
//   5. Mutation `onSuccess` must invalidate `["time-off"]`.
// ─────────────────────────────────────────────────────────────

/**
 * Returns all time-off requests for the current user.
 * Replace with `apiClient.get("/time-off")` later.
 */
export async function fetchTimeOffRequests(): Promise<TimeOffRequestDTO[]> {
  await delay(350);

  return [
    makeRequest("tor-001", -10, -8, "Family vacation", "approved"),
    makeRequest("tor-002", 5, 5, "Doctor appointment", "pending"),
    makeRequest("tor-003", 14, 16, "Out of town", "pending"),
    makeRequest("tor-004", -30, -28, "Flu", "approved"),
    makeRequest("tor-005", -45, -45, "Personal day", "denied"),
  ];
}

/**
 * Submits a new time-off request.
 * Replace with `apiClient.post("/time-off", input)` later.
 */
export async function submitTimeOffRequest(
  _input: CreateTimeOffRequestInput
): Promise<TimeOffRequestDTO> {
  await delay(600);

  return makeRequest("tor-new", 7, 7, "Submitted via app", "pending");
}

function makeRequest(
  id: string,
  startDaysFromNow: number,
  endDaysFromNow: number,
  reason: string,
  status: TimeOffRequestDTO["status"]
): TimeOffRequestDTO {
  const startDate = addDays(new Date(), startDaysFromNow);
  startDate.setHours(0, 0, 0, 0);

  const endDate = addDays(new Date(), endDaysFromNow);
  endDate.setHours(23, 59, 59, 0);

  return {
    id,
    orgId: "org-001",
    locationId: "loc-001",
    staffId: "staff-001",
    startDate,
    endDate,
    reason,
    status,
    notes: "",
    createdAt: addDays(startDate, -7),
    updatedAt: addDays(startDate, -7),
    ...(status !== "pending" && {
      reviewedAt: addDays(startDate, -3),
      reviewedBy: "manager-001",
    }),
  };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
