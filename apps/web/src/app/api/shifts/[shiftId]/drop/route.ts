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
// Implementation sketch (DO NOT BUILD YET)
//   1. Validate path + body with Zod.
//   2. Confirm the Shift belongs to the caller via Staff lookup.
//   3. Enforce business rules from KitchenConfig (e.g. "no drops less
//      than N hours before start").
//   4. Create an `ExchangeShift` record (new model — see open
//      question in the exchange route file) referencing the Shift.
//   5. Return the new ExchangeShift DTO.
//
// Out of scope for the file-setup task
//   - The `ExchangeShift` model / service / action.
//   - Manager-approval flow.
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
