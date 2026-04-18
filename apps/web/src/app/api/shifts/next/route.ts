import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// GET /api/shifts/next  —  Mobile (Home tab)
//
// Backs `apps/mobile/features/home/api.ts → fetchNextShift()`.
//
// Purpose
//   Return the calling staff member's soonest upcoming Shift, so the
//   home screen's "Next shift" card can render real data instead of
//   the current mock.
//
// Auth & tenancy
//   - Standard pattern: `auth()` → `getLocationContext(userId)`.
//   - The Staff record is resolved server-side from the
//     OrganizationMember row (or the staff document linked to the
//     Clerk user). NEVER trust a `staffId` from the client.
//
// Response
//   - 200 → `ShiftDTO` (or `null` if the staff member has no
//     upcoming shifts; the mobile card already handles the empty
//     state).
//   - 401 → `{ error: "Authentication required." }`
//   - 403 → `{ error }` when the user has no membership / no linked
//     Staff record. AuthGate already filters most of these out, but
//     the route is still defence-in-depth.
//
// Implementation sketch (DO NOT BUILD YET)
//   1. `const { userId } = await auth();` — 401 if missing.
//   2. `const ctx = await getLocationContext(userId);`
//   3. Resolve `staffId` from `ctx` (Staff lookup by `clerkUserId`).
//   4. `await ShiftService.getNextForStaff(ctx.orgId, ctx.locationId,
//      staffId)` — new service method to add (single Mongo read with
//      `start: { $gte: new Date() }`, sorted by `start` asc, limit 1).
//   5. Return `NextResponse.json(shift)` or `NextResponse.json(null)`.
//
// Out of scope for the file-setup task
//   - Adding `ShiftService.getNextForStaff` (service-layer change).
//   - Wiring the mobile client to call this route.
// ─────────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { error: "Not implemented yet. See route file comments for the plan." },
    { status: 501 },
  );
}
