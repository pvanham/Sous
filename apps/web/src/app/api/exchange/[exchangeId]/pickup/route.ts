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
// Status / pre-implementation checklist
//   See `apps/web/src/app/api/exchange/available/route.ts`. The
//   ExchangeShift model and service must be defined first; this
//   route in particular relies on `ExchangeService.pickup(...)`
//   using OCC against the `ExchangeShift.updatedAt` field so two
//   simultaneous pickups can't both succeed.
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
// Implementation sketch (DO NOT BUILD YET)
//   1. Auth + ctx + staffId resolution.
//   2. Validate `exchangeId` (ObjectId).
//   3. `await ExchangeService.pickup({ orgId, locationId, exchangeId,
//      staffId })` — service performs the OCC update + Shift
//      reassignment in a single Mongo session/transaction where
//      possible.
//   4. Translate service errors → HTTP statuses above.
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
