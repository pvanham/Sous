import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// POST /api/shifts/[shiftId]/drop  —  Mobile (Exchange tab)
//
// Backs `apps/mobile/features/exchange/api.ts → dropShift()`.
//
// Purpose
//   Let a staff member release one of their own scheduled shifts onto
//   the exchange board so co-workers can pick it up.
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)`.
//   - RBAC: only the staff member assigned to the shift (or a manager
//     acting on their behalf — TBD) may drop it.
//
// Path params
//   - `shiftId`: the Shift document ID being dropped.
//
// Body
//   - Optional `reason` (string, max ~500 chars).
//
// Response
//   - 200 → `ExchangeShift` (newly created, status `available`).
//   - 401 / 403 / 404 as appropriate.
//   - 409 if an ExchangeShift already exists for this shift.
//
// Implementation sketch
//   1. Validate path + body with `dropShiftSchema`.
//   2. Resolve the caller's `staffId`.
//   3. Enforce business rules from KitchenConfig (e.g. "no drops less
//      than N hours before start").
//   4. `await ExchangeShiftService.drop({ orgId, locationId, shiftId,
//      staffId, reason })` — service confirms ownership and creates
//      the row with status `available`.
//   5. Return the new ExchangeShiftDTO.
//
// The ExchangeShift model and service now exist (see SHI-11);
// approval flow is also implemented (`ExchangeShiftService.approve`).
// ─────────────────────────────────────────────────────────────

export async function POST(
  _req: Request,
  _ctx: { params: Promise<{ shiftId: string }> },
): Promise<Response> {
  return NextResponse.json(
    { error: "Not implemented yet. See route file comments for the plan." },
    { status: 501 },
  );
}
