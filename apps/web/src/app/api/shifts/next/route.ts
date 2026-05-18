import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { ShiftService } from "@/server/services/shift.service";
import { StaffService } from "@/server/services/staff.service";

// ─────────────────────────────────────────────────────────────
// GET /api/shifts/next  —  Mobile (Home tab)
//
// Backs `apps/mobile/features/home/api.ts → fetchNextShift()`.
//
// Purpose
//   Return the calling staff member's soonest upcoming Shift so the
//   home screen's "Next shift" card can render real data.
//
// Auth & tenancy
//   - `auth()` resolves the Clerk user; missing JWT → 401.
//   - `getLocationContext(userId)` resolves the active org + location.
//   - `StaffService.getByClerkUserId(orgId, locationId, userId)`
//     resolves the caller's `staffId` server-side. We never trust a
//     `staffId` from the client.
//   - Managers/owners may call this route; if they're not also linked
//     to a Staff row (no `clerkUserId` on any Staff doc in this
//     location) we return `null` instead of erroring — they simply
//     have no upcoming shifts to show.
//
// Visibility
//   - DRAFT shifts are filtered out (`publishedOnly: true`) so the
//     home card never previews an unpublished assignment.
//
// Response
//   - 200 → `ShiftDTO | null` (the next future shift, or `null` if
//           none / the caller has no Staff linkage).
//   - 401 → `{ error }` when the JWT is missing.
//   - 500 → `{ error }` for unexpected failures.
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

    const staff = await StaffService.getByClerkUserId(
      ctx.orgId,
      ctx.locationId,
      userId,
    );

    if (!staff) {
      // Manager/owner with no Staff row at this location: there is no
      // "next shift" for them. Return null (the mobile card already
      // handles the empty state) rather than 404 so the home tab
      // continues to render its other cards (e.g. announcements).
      return NextResponse.json(null);
    }

    const nextShift = await ShiftService.getNextForStaff(
      ctx.orgId,
      ctx.locationId,
      staff.id,
      { publishedOnly: true },
    );

    return NextResponse.json(nextShift);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[api/shifts/next] failed:", message);
    return NextResponse.json(
      { error: "Failed to load next shift." },
      { status: 500 },
    );
  }
}
