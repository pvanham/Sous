import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { dropShiftSchema } from "@/lib/validations/exchange-shift.schema";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { ExchangeShiftService } from "@/server/services/exchange-shift.service";
import { ShiftService } from "@/server/services/shift.service";
import { StaffService } from "@/server/services/staff.service";

// ─────────────────────────────────────────────────────────────
// POST /api/shifts/[shiftId]/drop  —  Mobile (Exchange tab)
//
// Backs `apps/mobile/features/exchange/api.ts → dropShift()`.
//
// Purpose
//   Let a staff member release one of their own scheduled shifts
//   onto the exchange board so co-workers can pick it up. Thin
//   adapter over `ExchangeShiftService.drop`.
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)`.
//   - The dropper's `staffId` is resolved server-side via
//     `StaffService.getByClerkUserId`. Manager / owner callers with
//     no `Staff` row at the active location cannot drop a shift
//     (they don't own one) and receive a 400.
//   - Ownership of the underlying `Shift` is enforced inside the
//     service: the staff member can only drop a shift assigned to
//     them. Manager-acting-on-behalf is intentionally NOT supported
//     here — that's a manager Server Action concern, not a mobile
//     route handler concern.
//
// Path params
//   - `shiftId`: the Shift document ID being dropped (must be a
//     valid Mongo ObjectId).
//
// Body
//   - `reason` (optional, max 500 chars). Validated by the shared
//     `dropShiftSchema` from `@sous/types`.
//
// Response
//   - 200 → newly created `ExchangeShiftDTO` (status `available`).
//   - 400 → `{ error }` for invalid `shiftId`, malformed body, or
//           when the caller has no `Staff` row at the active
//           location.
//   - 401 → `{ error }` when the JWT is missing.
//   - 403 → `{ error }` when the shift does not belong to the
//           caller (i.e. they're trying to drop someone else's
//           shift).
//   - 404 → `{ error }` when the shift does not exist in the
//           caller's location.
//   - 409 → `{ error }` when the shift is already on the exchange
//           board (open `available` / `pending_coverage` row).
//   - 500 → `{ error }` on unexpected failure.
// ─────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  ctx: { params: Promise<{ shiftId: string }> },
): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const { shiftId } = await ctx.params;
    if (!Types.ObjectId.isValid(shiftId)) {
      return NextResponse.json(
        { error: "Invalid shift ID." },
        { status: 400 },
      );
    }

    // The body is optional (the spec allows POSTing with no body).
    // Tolerate both an empty body and an explicit `{}`.
    let raw: unknown = {};
    const text = await req.text();
    if (text.trim().length > 0) {
      try {
        raw = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: "Request body must be valid JSON." },
          { status: 400 },
        );
      }
    }

    const parsed = dropShiftSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Invalid drop-shift request.",
        },
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
            "You do not have a staff record at this location and cannot drop a shift.",
        },
        { status: 400 },
      );
    }

    // Pre-check existence + ownership so we can return the right
    // 404 / 403 instead of leaking a generic service error message.
    const shift = await ShiftService.getById(
      locationCtx.orgId,
      locationCtx.locationId,
      shiftId,
    );

    if (!shift) {
      return NextResponse.json(
        { error: "Shift not found." },
        { status: 404 },
      );
    }

    if (shift.staffId !== callerStaff.id) {
      return NextResponse.json(
        { error: "You can only drop shifts assigned to you." },
        { status: 403 },
      );
    }

    const dropped = await ExchangeShiftService.drop({
      orgId: locationCtx.orgId,
      locationId: locationCtx.locationId,
      shiftId,
      staffId: callerStaff.id,
      reason: parsed.data.reason,
    });

    return NextResponse.json(dropped);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/shifts/:id/drop] failed:", message);

    // The partial unique index on (shiftId, status ∈ open) surfaces
    // either as a duplicate-key Mongo error or as the service's
    // explicit "already on the exchange board" guard.
    if (message.includes("already on the exchange board")) {
      return NextResponse.json(
        { error: "This shift is already on the exchange board." },
        { status: 409 },
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      return NextResponse.json(
        { error: "This shift is already on the exchange board." },
        { status: 409 },
      );
    }

    if (message.includes("can only drop your own")) {
      return NextResponse.json(
        { error: "You can only drop shifts assigned to you." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "Failed to drop shift." },
      { status: 500 },
    );
  }
}
