import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { ShiftService } from "@/server/services/shift.service";
import { StaffService } from "@/server/services/staff.service";
import type { MemberRole } from "@/server/models/OrganizationMember";

// ─────────────────────────────────────────────────────────────
// GET /api/shifts/[shiftId]/roster  —  Mobile (Schedule tab)
//
// Backs `apps/mobile/features/schedule/api.ts → fetchShiftRoster()`.
//
// Purpose
//   Return every Staff member working alongside the caller on the
//   given shift, so the mobile "who's on with me" modal renders real
//   names + stations.
//
// Auth & tenancy
//   - `auth()` → `getLocationContext(userId)`.
//   - RBAC:
//       • `staff` and `shift_lead` callers may only view rosters for
//         shifts they themselves are part of (i.e. their resolved
//         `staffId` appears in the roster). Off-shift staff get 403
//         and never see co-workers' display info.
//       • `manager` and `owner` may view any roster within their
//         org+location.
//
// Path params
//   - `shiftId` (required, must be a Mongo ObjectId).
//
// Roster definition
//   "On the same shift" is operationalised as: any shift at the same
//   location whose time window overlaps the target shift's
//   `[start, end)`. We intentionally do NOT scope by `scheduleId`
//   because, after a `weekStartsOn` flip, two co-workers on the same
//   Saturday shift can belong to different Schedule docs. Date-range
//   overlap is the only stable definition of "on at the same time".
//   See `ShiftService.getRosterByOverlap` for the full rule.
//
// Visibility
//   - DRAFT shifts are filtered out (`publishedOnly: true`) so a
//     manager's unpublished week doesn't reveal co-worker assignments
//     through the roster modal.
//
// Response
//   - 200 → `StaffDTO[]` of every staff member on the shift, ordered
//           by name. Includes the caller themselves so the mobile UI
//           can highlight "(you)" without an extra fetch.
//   - 400 → `{ error }` when `shiftId` isn't a valid ObjectId.
//   - 401 → `{ error }` when the JWT is missing.
//   - 403 → `{ error }` when a staff/shift-lead caller is not on the
//           shift.
//   - 404 → `{ error }` when the shift doesn't exist in the caller's
//           location.
//   - 500 → `{ error }` for unexpected failures.
// ─────────────────────────────────────────────────────────────

/**
 * Roles allowed to view any roster within their tenant. Other roles
 * (staff, shift_lead) can only see rosters for shifts they're on.
 */
const PRIVILEGED_ROLES: MemberRole[] = ["owner", "manager"];

export async function GET(
  _req: Request,
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

    const locationCtx = await getLocationContext(userId);

    // Resolve the target shift first so we can: (a) verify it exists in
    // the caller's tenant, (b) pull `start/end` for the roster query
    // (we deliberately don't use `target.scheduleId` — see the route
    // doc above), and (c) check RBAC against the actual roster.
    const target = await ShiftService.getById(
      locationCtx.orgId,
      locationCtx.locationId,
      shiftId,
    );

    if (!target) {
      return NextResponse.json(
        { error: "Shift not found." },
        { status: 404 },
      );
    }

    const rosterShifts = await ShiftService.getRosterByOverlap(
      locationCtx.orgId,
      locationCtx.locationId,
      target.start,
      target.end,
      { publishedOnly: true },
    );

    // RBAC: a non-privileged caller (staff / shift_lead) must be on the
    // shift to see who else is. Resolve their `staffId` and confirm it
    // appears in the roster before returning anything.
    if (!PRIVILEGED_ROLES.includes(locationCtx.role)) {
      const callerStaff = await StaffService.getByClerkUserId(
        locationCtx.orgId,
        locationCtx.locationId,
        userId,
      );

      const callerOnShift =
        callerStaff !== null &&
        rosterShifts.some((s) => s.staffId === callerStaff.id);

      if (!callerOnShift) {
        return NextResponse.json(
          { error: "You are not on this shift." },
          { status: 403 },
        );
      }
    }

    const staffIds = rosterShifts.map((s) => s.staffId);
    const roster = await StaffService.getByIds(
      locationCtx.orgId,
      locationCtx.locationId,
      staffIds,
    );

    return NextResponse.json(roster);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[api/shifts/:shiftId/roster] failed:", message);
    return NextResponse.json(
      { error: "Failed to load shift roster." },
      { status: 500 },
    );
  }
}
