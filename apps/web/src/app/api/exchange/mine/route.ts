import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getLocationContext } from "@/lib/auth/get-location-context";
import { ExchangeShiftService } from "@/server/services/exchange-shift.service";
import { StaffService } from "@/server/services/staff.service";

// ─────────────────────────────────────────────────────────────
// GET /api/exchange/mine  —  Mobile (Exchange tab)
//
// Backs `apps/mobile/features/exchange/api.ts → fetchMyDroppedShifts()`.
//
// Purpose
//   Return every ExchangeShift the caller has dropped, in any status
//   (`available`, `pending_coverage`, `covered`, `manager_approved`,
//   `cancelled`), so the staff member can see the lifecycle of each
//   request on the "My drops" tab.
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)`.
//   - `staffId` is resolved server-side from the caller's Clerk JWT
//     via `StaffService.getByClerkUserId`. The body / query string
//     never carries a `staffId` — the same rule every other mobile
//     read follows.
//   - Manager / owner callers with no `Staff` row at the active
//     location get an empty array (they cannot drop a shift, so they
//     have no "my drops" to display). Same graceful-empty pattern as
//     `/api/shifts` and `/api/time-off`.
//
// Response
//   - 200 → `ExchangeShiftDTO[]` sorted by `createdAt` descending.
//   - 401 → `{ error }` when the JWT is missing.
//   - 500 → `{ error }` on unexpected failure.
// ─────────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const ctx = await getLocationContext(userId);

    const callerStaff = await StaffService.getByClerkUserId(
      ctx.orgId,
      ctx.locationId,
      userId,
    );

    if (!callerStaff) {
      return NextResponse.json([]);
    }

    const shifts = await ExchangeShiftService.listByDropper(
      ctx.orgId,
      ctx.locationId,
      callerStaff.id,
    );

    return NextResponse.json(shifts);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/exchange/mine] failed:", message);
    return NextResponse.json(
      { error: "Failed to load your dropped shifts." },
      { status: 500 },
    );
  }
}
