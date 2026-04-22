import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { getLocationContext } from "@/lib/auth/get-location-context";
import { ExchangeShiftService } from "@/server/services/exchange-shift.service";
import { StaffService } from "@/server/services/staff.service";

// ─────────────────────────────────────────────────────────────
// POST /api/exchange/[exchangeId]/withdraw  —  Mobile (My Pickups)
//
// Backs `apps/mobile/features/exchange/api.ts → withdrawPickup()`.
//
// Purpose
//   Let a picker rescind their own `pending_coverage` pickup so the
//   underlying drop returns to the `available` pool. This is the
//   picker's equivalent of the dropper's Cancel flow — it exists
//   because pickups are approval-gated and staff may change their
//   mind while waiting.
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)`.
//   - The picker's `staffId` is resolved server-side via
//     `StaffService.getByClerkUserId`; the service enforces that the
//     caller is the current `pickedUpByStaffId`.
//
// Path params
//   - `exchangeId`: ExchangeShift document ID (valid Mongo ObjectId).
//
// Response
//   - 200 → updated `ExchangeShiftDTO` (status = `available`).
//   - 400 → `{ error }` for invalid `exchangeId` / no caller staff.
//   - 401 → `{ error }` when the JWT is missing.
//   - 403 → `{ error }` when the caller is not the current picker.
//   - 404 → `{ error }` when the ExchangeShift does not exist.
//   - 409 → `{ error }` when the row is no longer `pending_coverage`
//           (manager already decided, or another race condition).
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
            "You do not have a staff record at this location and cannot withdraw a pickup.",
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

    if (target.status !== "pending_coverage") {
      return NextResponse.json(
        {
          error:
            "This pickup is no longer pending — a manager may have already decided.",
        },
        { status: 409 },
      );
    }

    if (target.pickedUpByStaffId !== callerStaff.id) {
      return NextResponse.json(
        { error: "You can only withdraw your own pending pickups." },
        { status: 403 },
      );
    }

    const withdrawn = await ExchangeShiftService.withdrawPickup({
      orgId: locationCtx.orgId,
      locationId: locationCtx.locationId,
      exchangeId,
      pickerStaffId: callerStaff.id,
    });

    return NextResponse.json(withdrawn);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/exchange/:id/withdraw] failed:", message);

    if (message.includes("no longer pending")) {
      return NextResponse.json(
        {
          error:
            "This pickup is no longer pending — a manager may have already decided.",
        },
        { status: 409 },
      );
    }

    if (message.includes("modified by someone else")) {
      return NextResponse.json(
        {
          error:
            "This pickup was just modified by someone else. Please refresh and try again.",
        },
        { status: 409 },
      );
    }

    if (message.includes("only withdraw your own")) {
      return NextResponse.json(
        { error: "You can only withdraw your own pending pickups." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "Failed to withdraw pickup." },
      { status: 500 },
    );
  }
}
