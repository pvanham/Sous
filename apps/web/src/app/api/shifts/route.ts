import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// GET /api/shifts?weekStart=YYYY-MM-DD  —  Mobile (Schedule tab)
//
// Backs `apps/mobile/features/schedule/api.ts → fetchWeekShifts()`.
//
// Purpose
//   Return the calling staff member's shifts for the requested week.
//   Used by the mobile schedule strip + day detail.
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)` → resolve `staffId`
//     server-side. Never accept a `staffId` query parameter.
//
// Query params
//   - `weekStart` (required): ISO date string (YYYY-MM-DD). Interpreted
//     in the location's timezone. Must validate via Zod and reject
//     malformed input with 400.
//
// Response
//   - 200 → `ShiftDTO[]` (empty array if none).
//   - 400 → `{ error }` for missing / malformed `weekStart`.
//   - 401 → `{ error }` when the JWT is missing.
//
// Implementation sketch (DO NOT BUILD YET)
//   1. Parse `weekStart` from `req.nextUrl.searchParams` with Zod.
//   2. Compute `weekEnd = weekStart + 7d` in the location's timezone
//      (use the same timezone helper the orchestrator already uses).
//   3. `await ShiftService.getByStaffAndDateRange(staffId, weekStart,
//      weekEnd)` — already exists.
//   4. Return JSON array.
//
// Out of scope for the file-setup task
//   - Timezone helper extraction if it isn't already shared.
// ─────────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { error: "Not implemented yet. See route file comments for the plan." },
    { status: 501 },
  );
}
