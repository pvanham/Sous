import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// GET /api/exchange/available  —  Mobile (Exchange tab)
//
// Backs `apps/mobile/features/exchange/api.ts → fetchAvailableShifts()`.
//
// Purpose
//   Return the list of shifts other staff have dropped that the
//   caller could pick up. Drives the "Available shifts" section of
//   the exchange board.
//
// Status
//   The `ExchangeShift` aggregate does not exist on the web side yet
//   (no model, no service, no shared DTO). This route is a placeholder
//   so the implementation has a planned landing spot — see the
//   open question in `apps/mobile/features/exchange/api.ts`.
//
// Pre-implementation checklist (in order)
//   1. Decide: separate `ExchangeShift` model, or status field on
//      the existing `Shift`? Document the answer in
//      `docs/architecture/01-data-models.md`.
//   2. Move `ExchangeShift` + `ExchangeShiftStatus` from
//      `apps/mobile/types/index.ts` into `packages/types/src` so the
//      web service and the mobile client share a single shape.
//   3. Add (or extend) the relevant Mongoose model.
//   4. Add `ExchangeService` under
//      `apps/web/src/server/services/exchange.service.ts` with at
//      minimum: `listAvailable({ orgId, locationId, excludeStaffId })`,
//      `listMine({ orgId, locationId, staffId })`, `pickup(...)`,
//      `drop(...)`.
//   5. THEN wire this route + the others under `/api/exchange/*`
//      and `/api/shifts/[shiftId]/drop`.
//
// Auth & tenancy (when implementing)
//   - `auth()` → `getLocationContext(userId)`.
//   - Resolve `staffId` server-side and pass it as
//     `excludeStaffId` so callers don't see their own drops in the
//     "available" feed.
//
// RBAC notes
//   - Caller eligibility filtering (skill match, no overlap with
//     existing shifts) belongs in `CandidateService`, not this route.
//
// Response (planned)
//   - 200 → `ExchangeShiftDTO[]`
//   - 401 → `{ error }` on missing JWT
// ─────────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { error: "Not implemented yet. See route file comments for the plan." },
    { status: 501 },
  );
}
