import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// POST /api/exchange/[exchangeId]/pickup  —  Mobile (Exchange tab)
//
// Backs `apps/mobile/features/exchange/api.ts → pickUpShift()`.
//
// Purpose
//   Let an eligible staff member claim a dropped shift. Atomically
//   transfers ownership of the underlying Shift and transitions the
//   ExchangeShift's status.
//
// Status
//   The ExchangeShift model and service exist (see SHI-11). The
//   service's `pickup({ orgId, locationId, exchangeId,
//   pickerStaffId, requireApproval })` method already implements the
//   OCC update against `ExchangeShift.updatedAt` and (when
//   `requireApproval=false`) the cascading reassignment of the
//   underlying `Shift.staffId`. This route handler is still a 501
//   placeholder.
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)`.
//   - Resolve caller `staffId`. Reject the caller's own ExchangeShift.
//
// Path params
//   - `exchangeId`: ExchangeShift document ID.
//
// Eligibility checks (server-side, mandatory)
//   - The caller's role allows them to work the underlying station.
//   - The caller has no existing Shift overlapping the drop window.
//   - The ExchangeShift is still `available` (status check + OCC).
//
// Response
//   - 200 → updated `ExchangeShiftDTO` (status `pending_coverage` or
//     `covered` depending on KitchenConfig).
//   - 401 → `{ error }` on missing JWT.
//   - 403 → `{ error }` on ineligibility (role, skill, conflict).
//   - 404 → `{ error }` when the ExchangeShift does not exist in the
//     caller's location.
//   - 409 → `{ error }` on stale data (someone picked it up first).
//
// Implementation sketch
//   1. Auth + ctx + staffId resolution.
//   2. Validate `exchangeId` (ObjectId) and the (currently empty)
//      body via `pickupExchangeShiftSchema`.
//   3. Consult `KitchenConfig` to decide `requireApproval`.
//   4. Run `CandidateService` eligibility checks (skill, conflict).
//   5. `await ExchangeShiftService.pickup({ orgId, locationId,
//      exchangeId, pickerStaffId: staffId, requireApproval })`.
//   6. Translate service errors → HTTP statuses above.
// ─────────────────────────────────────────────────────────────

export async function POST(
  _req: Request,
  _ctx: { params: Promise<{ exchangeId: string }> },
): Promise<Response> {
  return NextResponse.json(
    { error: "Not implemented yet. See route file comments for the plan." },
    { status: 501 },
  );
}
