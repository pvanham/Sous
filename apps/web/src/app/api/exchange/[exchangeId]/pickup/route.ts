import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { getLocationContext } from "@/lib/auth/get-location-context";
import { ExchangeShiftService } from "@/server/services/exchange-shift.service";
import { ShiftService } from "@/server/services/shift.service";
import { StaffService } from "@/server/services/staff.service";

// ─────────────────────────────────────────────────────────────
// POST /api/exchange/[exchangeId]/pickup  —  Mobile (Exchange tab)
//
// Backs `apps/mobile/features/exchange/api.ts → pickUpShift()`.
//
// Purpose
//   Let an eligible staff member claim a dropped shift. Atomically
//   transfers ownership of the underlying Shift and transitions the
//   ExchangeShift's status. The route is a thin adapter over
//   `ExchangeShiftService.pickup`, which already implements the OCC
//   update against `ExchangeShift.updatedAt`.
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)`.
//   - The picker's `staffId` is resolved server-side via
//     `StaffService.getByClerkUserId`. Manager / owner callers with
//     no `Staff` row at the active location cannot pick up a shift
//     and receive a 400 — there's nobody to reassign the underlying
//     `Shift` to.
//
// Path params
//   - `exchangeId`: ExchangeShift document ID (must be a valid Mongo
//     ObjectId).
//
// Eligibility checks
//   - Self-pickup is rejected by the service (the dropper cannot be
//     their own picker).
//   - Schedule conflict: we use `ShiftService.checkOverlap` to make
//     sure the picker doesn't already have a shift overlapping the
//     drop window. This is a cheap last-mile guard; deeper
//     eligibility (skill match, role match, max-hours cap) belongs in
//     `CandidateService` and is intentionally out of scope for v1.
//
// `requireApproval`
//   The service supports a two-step `pending_coverage → manager_approved`
//   flow, but `KitchenConfig` does not yet carry an
//   "exchange-requires-approval" toggle. v1 picks up directly with
//   `requireApproval: false` (status moves straight to `covered` and
//   the underlying Shift is reassigned). When the config flag lands,
//   read it here and pass through to the service.
//
// Response
//   - 200 → updated `ExchangeShiftDTO`.
//   - 400 → `{ error }` for invalid `exchangeId` or when the caller
//           has no `Staff` row at the active location.
//   - 401 → `{ error }` when the JWT is missing.
//   - 403 → `{ error }` for self-pickup, or when the caller has a
//           conflicting shift in the same window.
//   - 404 → `{ error }` when the ExchangeShift does not exist in the
//           caller's location, or is no longer `available`.
//   - 409 → `{ error }` when the OCC check fails (someone else picked
//           it up first while this request was in flight).
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
            "You do not have a staff record at this location and cannot pick up a shift.",
        },
        { status: 400 },
      );
    }

    // Look up the row first so we can: (a) return a clean 404 vs 409
    // distinction, and (b) run the overlap pre-check against its
    // start/end window before issuing the OCC update.
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

    if (target.status !== "available") {
      return NextResponse.json(
        {
          error:
            "This shift is no longer available — it may have been picked up or cancelled.",
        },
        { status: 409 },
      );
    }

    if (target.staffId === callerStaff.id) {
      return NextResponse.json(
        { error: "You cannot pick up your own dropped shift." },
        { status: 403 },
      );
    }

    // Last-mile schedule conflict check. Deeper eligibility (skill /
    // role / max hours) is out of scope for v1.
    const hasConflict = await ShiftService.checkOverlap(
      locationCtx.orgId,
      locationCtx.locationId,
      callerStaff.id,
      target.start,
      target.end,
    );

    if (hasConflict) {
      return NextResponse.json(
        {
          error:
            "You already have a shift that overlaps this time window.",
        },
        { status: 403 },
      );
    }

    const picked = await ExchangeShiftService.pickup({
      orgId: locationCtx.orgId,
      locationId: locationCtx.locationId,
      exchangeId,
      pickerStaffId: callerStaff.id,
      requireApproval: false,
    });

    return NextResponse.json(picked);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/exchange/:id/pickup] failed:", message);

    // Translate the two known service-thrown business errors into the
    // documented HTTP statuses. Anything else is a true 500.
    if (message.includes("not available for pickup")) {
      return NextResponse.json(
        {
          error:
            "This shift is no longer available — it may have been picked up or cancelled.",
        },
        { status: 409 },
      );
    }

    if (message.includes("modified by someone else")) {
      return NextResponse.json(
        {
          error:
            "This shift was just modified by someone else. Please refresh and try again.",
        },
        { status: 409 },
      );
    }

    if (message.includes("cannot pick up your own")) {
      return NextResponse.json(
        { error: "You cannot pick up your own dropped shift." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "Failed to pick up shift." },
      { status: 500 },
    );
  }
}
