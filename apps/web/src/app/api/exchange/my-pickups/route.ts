import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getLocationContext } from "@/lib/auth/get-location-context";
import { ExchangeShiftService } from "@/server/services/exchange-shift.service";
import { StaffService } from "@/server/services/staff.service";

// ─────────────────────────────────────────────────────────────
// GET /api/exchange/my-pickups  —  Mobile (Exchange → My Pickups tab)
//
// Backs `apps/mobile/features/exchange/api.ts → fetchMyPickups()`.
//
// Purpose
//   Return every ExchangeShift the caller has picked up, in any
//   status (`pending_coverage`, `manager_approved`, `covered`,
//   `denied`, `cancelled`). With approval-gated pickups, the picker
//   needs a dedicated view to track their submissions — the
//   `available` board removes a row the moment it is claimed, so
//   without this endpoint the pickup would disappear into a black
//   box until the manager decides.
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)`.
//   - `pickerStaffId` is resolved server-side from the caller's
//     Clerk JWT via `StaffService.getByClerkUserId`. The body /
//     query string never carries a staffId.
//   - Manager / owner callers with no `Staff` row at the active
//     location get an empty array — they can't pick up shifts, so
//     they have no pickups to display. Same graceful-empty pattern
//     as `/api/exchange/mine`.
//
// Response
//   - 200 → `ExchangeShiftDTO[]` sorted by `updatedAt` descending
//           (most recent decision / submission first).
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

    const shifts = await ExchangeShiftService.listByPicker(
      ctx.orgId,
      ctx.locationId,
      callerStaff.id,
    );

    return NextResponse.json(shifts);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/exchange/my-pickups] failed:", message);
    return NextResponse.json(
      { error: "Failed to load your pickups." },
      { status: 500 },
    );
  }
}
