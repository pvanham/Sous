import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// /api/time-off  —  Mobile (Time-off tab)
//
// Backs:
//   GET  → `apps/mobile/features/time-off/api.ts → fetchTimeOffRequests()`
//   POST → `apps/mobile/features/time-off/api.ts → submitTimeOffRequest()`
//
// Why a route handler (not a Server Action)
//   The mobile app cannot call Server Actions directly — they're a
//   web-only RSC primitive. Per docs/architecture/05-api-and-testing.md
//   §1.5, the mobile public API is one of the five permitted reasons
//   for a route handler.
//
// Service / model reuse
//   The web app already has:
//     - `TimeOffRequestService` (full CRUD, multi-tenant)
//     - `createTimeOffRequestSchema` in
//       `apps/web/src/lib/validations/time-off-request.schema.ts`
//   Both should be reused here verbatim. This route is a thin
//   adapter, NOT a place for new business logic.
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)` for both verbs.
//   - Resolve the caller's `staffId` server-side via Staff lookup.
//     The body MUST NOT carry a `staffId` (the existing web Server
//     Action takes one because it's manager-facing; the mobile route
//     does not).
//
// GET response
//   - 200 → `TimeOffRequestDTO[]` (only the caller's own requests).
//   - 401 → `{ error }` on missing JWT.
//
// POST request body (validate with shared Zod schema)
//   - `{ startDate, endDate, type, reason? }`
//   - Server applies `KitchenConfig.minTimeOffAdvanceDays` exactly
//     like the existing `createTimeOffRequest` action does.
//
// POST response
//   - 200 → `TimeOffRequestDTO` (status="pending").
//   - 400 → `{ error }` on validation / advance-days violation.
//   - 401 → `{ error }` on missing JWT.
//
// Implementation sketch (DO NOT BUILD YET)
//   GET:
//     1. Auth + ctx.
//     2. Resolve staffId.
//     3. `await TimeOffRequestService.getByStaffId(orgId, locationId,
//        staffId)`.
//   POST:
//     1. Auth + ctx.
//     2. Parse body JSON; safeParse with the shared schema.
//     3. Resolve staffId from ctx.
//     4. Apply `minTimeOffAdvanceDays` rule.
//     5. `await TimeOffRequestService.create(orgId, locationId,
//        { staffId, ...parsed.data })`.
//
// Open question
//   - Should the schema move to `@sous/types/validations` so the
//     mobile form can reuse it? Likely yes; track separately.
// ─────────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { error: "Not implemented yet. See route file comments for the plan." },
    { status: 501 },
  );
}

export async function POST(): Promise<Response> {
  return NextResponse.json(
    { error: "Not implemented yet. See route file comments for the plan." },
    { status: 501 },
  );
}
