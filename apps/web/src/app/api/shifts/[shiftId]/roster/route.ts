import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// GET /api/shifts/[shiftId]/roster  —  Mobile (Schedule tab)
//
// Backs `apps/mobile/features/schedule/api.ts → fetchShiftRoster()`.
//
// Purpose
//   Return every Staff member working alongside the caller on the
//   given shift, so the mobile "who's on with me" modal renders real
//   names + stations.
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)`.
//   - RBAC: a `staff` role caller may only view rosters for shifts
//     they themselves are part of. Managers / owners may view any
//     roster within their org+location. Enforce server-side; do not
//     leak co-worker contact info to off-shift staff.
//
// Path params
//   - `shiftId` (required, must be a Mongo ObjectId).
//
// Response
//   - 200 → `StaffDTO[]` (everyone scheduled on the same scheduleId
//     and overlapping the shift's time window — exact rule TBD with
//     the schedule team).
//   - 401 → `{ error }` when the JWT is missing.
//   - 403 → `{ error }` when the caller is staff and is not on the
//     shift.
//   - 404 → `{ error }` when the shift does not exist in the caller's
//     location.
//
// Implementation sketch (DO NOT BUILD YET)
//   1. Validate `shiftId` (Zod ObjectId regex).
//   2. `const target = await ShiftService.getById(orgId, locationId,
//      shiftId);` — 404 on null.
//   3. RBAC check (described above).
//   4. New service method on `ShiftService.getRoster(orgId, locationId,
//      target.scheduleId, target.start, target.end)` returns the list
//      of staff IDs scheduled on the same shift window.
//   5. `StaffService.getByIds(...)` to materialize StaffDTOs.
//
// Out of scope for the file-setup task
//   - Defining `getRoster` and `getByIds` service methods.
//   - Deciding the exact "same shift" rule (overlap vs. equal start).
// ─────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  _ctx: { params: Promise<{ shiftId: string }> },
): Promise<Response> {
  return NextResponse.json(
    { error: "Not implemented yet. See route file comments for the plan." },
    { status: 501 },
  );
}
