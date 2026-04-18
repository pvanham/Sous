import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// GET /api/exchange/mine  —  Mobile (Exchange tab)
//
// Backs `apps/mobile/features/exchange/api.ts → fetchMyDroppedShifts()`.
//
// Purpose
//   Return every ExchangeShift the caller has dropped, in any status
//   (`available`, `pending_coverage`, `covered`, `manager_approved`),
//   so the staff member can see the state of each one.
//
// Status
//   The ExchangeShift model and service exist (see SHI-11); this
//   route handler is the only outstanding piece. Wiring it up means
//   resolving the caller's `staffId` and delegating to
//   `ExchangeShiftService.listByDropper(orgId, locationId, staffId)`.
//
// Auth & tenancy (when implementing)
//   - `auth()` → `getLocationContext(userId)`.
//   - Resolve `staffId` server-side. Filter by `staffId` strictly so
//     a user only ever sees their own drops.
//
// Response (planned)
//   - 200 → `ExchangeShiftDTO[]` sorted by `start` ascending.
//   - 401 → `{ error }` on missing JWT.
//
// Implementation sketch
//   1. Auth + ctx.
//   2. Resolve staffId from the caller's OrganizationMember + Staff.
//   3. `await ExchangeShiftService.listByDropper(orgId, locationId, staffId)`.
// ─────────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { error: "Not implemented yet. See route file comments for the plan." },
    { status: 501 },
  );
}
