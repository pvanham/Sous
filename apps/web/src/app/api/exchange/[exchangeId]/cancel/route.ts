import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { getLocationContext } from "@/lib/auth/get-location-context";
import { ExchangeShiftService } from "@/server/services/exchange-shift.service";
import { StaffService } from "@/server/services/staff.service";

// ─────────────────────────────────────────────────────────────
// POST /api/exchange/[exchangeId]/cancel  —  Mobile (My Dropped)
//
// Backs `apps/mobile/features/exchange/api.ts → cancelOwnDrop()`.
//
// Purpose
//   Let a dropper rescind their own open drop (either `available`
//   or `pending_coverage`). If the drop had a picker, their pickup
//   effectively goes away — they'll see the row as `cancelled` in
//   their "My Pickups" list. The underlying `Shift.staffId` stays
//   with the dropper in both cases so no schedule change is needed.
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)`.
//   - The dropper's `staffId` is resolved server-side via
//     `StaffService.getByClerkUserId`; the service enforces that
//     the caller is the drop's original `staffId`.
//
// Path params
//   - `exchangeId`: ExchangeShift document ID (valid Mongo ObjectId).
//
// Response
//   - 200 → updated `ExchangeShiftDTO` (status = `cancelled`).
//   - 400 → `{ error }` for invalid `exchangeId` / no caller staff.
//   - 401 → `{ error }` when the JWT is missing.
//   - 403 → `{ error }` when the caller is not the dropper.
//   - 404 → `{ error }` when the ExchangeShift does not exist.
//   - 409 → `{ error }` when the drop is already terminal
//           (covered / manager_approved / denied / cancelled).
//   - 500 → `{ error }` on unexpected failure.
// ─────────────────────────────────────────────────────────────

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ exchangeId: string }> },
): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const { exchangeId } = await ctx.params;
    if (!Types.ObjectId.isValid(exchangeId)) {
      return NextResponse.json(
        { error: "Invalid exchange ID." },
        { status: 400 },
      );
    }

    const locationCtx = await getLocationContext(userId);

    const callerStaff = await StaffService.getByClerkUserId(
      locationCtx.orgId,
      locationCtx.locationId,
      userId,
    );

    if (!callerStaff) {
      return NextResponse.json(
        {
          error:
            "You do not have a staff record at this location and cannot cancel a drop.",
        },
        { status: 400 },
      );
    }

    const target = await ExchangeShiftService.getById(
      locationCtx.orgId,
      locationCtx.locationId,
      exchangeId,
    );

    if (!target) {
      return NextResponse.json(
        { error: "Exchange shift not found." },
        { status: 404 },
      );
    }

    if (target.staffId !== callerStaff.id) {
      return NextResponse.json(
        { error: "You can only cancel your own drops." },
        { status: 403 },
      );
    }

    if (
      target.status !== "available" &&
      target.status !== "pending_coverage"
    ) {
      return NextResponse.json(
        {
          error:
            "This drop is already finalised and can no longer be cancelled.",
        },
        { status: 409 },
      );
    }

    const cancelled = await ExchangeShiftService.cancel({
      orgId: locationCtx.orgId,
      locationId: locationCtx.locationId,
      exchangeId,
      cancellerStaffId: callerStaff.id,
    });

    return NextResponse.json(cancelled);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/exchange/:id/cancel] failed:", message);

    if (message.includes("Only available or pending drops")) {
      return NextResponse.json(
        {
          error:
            "This drop is already finalised and can no longer be cancelled.",
        },
        { status: 409 },
      );
    }

    if (message.includes("only cancel your own")) {
      return NextResponse.json(
        { error: "You can only cancel your own drops." },
        { status: 403 },
      );
    }

    if (message.includes("modified by someone else")) {
      return NextResponse.json(
        {
          error:
            "This drop was just modified by someone else. Please refresh and try again.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Failed to cancel drop." },
      { status: 500 },
    );
  }
}
