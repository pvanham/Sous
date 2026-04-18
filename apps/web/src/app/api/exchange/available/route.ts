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
//   The backend foundation now exists (see SHI-11). The decision was
//   to model exchange as its OWN aggregate (`ExchangeShift`) rather
//   than a status field on `Shift` — see
//   `docs/architecture/01-data-models.md` for the rationale. The
//   pieces in place:
//     - `ExchangeShiftDTO` + `ExchangeShiftStatus` in `@sous/types`.
//     - Zod validators in
//       `packages/types/src/validations/exchange-shift.schema.ts`.
//     - Mongoose model at
//       `apps/web/src/server/models/ExchangeShift.ts`.
//     - Service at
//       `apps/web/src/server/services/exchange-shift.service.ts`
//       with `listAvailable`, `listByDropper`, `drop`, `pickup`,
//       `approve`, `cancel`.
//   THIS route handler is still a 501 placeholder. Wiring it up
//   means resolving the caller's `staffId` (from
//   `OrganizationMember` → `Staff`) and delegating to
//   `ExchangeShiftService.listAvailable({ excludeStaffId })`.
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
