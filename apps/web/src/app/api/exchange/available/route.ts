import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getLocationContext } from "@/lib/auth/get-location-context";
import { ExchangeShiftService } from "@/server/services/exchange-shift.service";
import { StaffService } from "@/server/services/staff.service";

// ─────────────────────────────────────────────────────────────
// GET /api/exchange/available  —  Mobile (Exchange tab)
//
// Backs `apps/mobile/features/exchange/api.ts → fetchAvailableShifts()`.
//
// Purpose
//   Return every shift other staff have dropped onto the exchange
//   board that the caller could pick up. Drives the "Available shifts"
//   tab on the mobile exchange screen.
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)` resolves the active
//     org + location.
//   - The caller's `staffId` is resolved server-side via
//     `StaffService.getByClerkUserId` and passed as `excludeStaffId`
//     so users never see their own drops in the available feed.
//   - Manager / owner callers without a `Staff` row at the active
//     location simply get the location-wide board with nothing
//     excluded (they can't be the dropper anyway).
//
// RBAC notes
//   Eligibility filtering (skill match, no overlap with the caller's
//   own existing shifts) is intentionally NOT done here. The board is
//   the same for every location member and the pickup route enforces
//   per-staff eligibility before mutating anything. This keeps the
//   list query cheap and avoids leaking eligibility info via "shifts
//   that disappear when you tap them".
//
// Response
//   - 200 → `ExchangeShiftDTO[]` sorted by `start` ascending.
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

    const shifts = await ExchangeShiftService.listAvailable(
      ctx.orgId,
      ctx.locationId,
      callerStaff ? { excludeStaffId: callerStaff.id } : {},
    );

    return NextResponse.json(shifts);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/exchange/available] failed:", message);
    return NextResponse.json(
      { error: "Failed to load available shifts." },
      { status: 500 },
    );
  }
}
