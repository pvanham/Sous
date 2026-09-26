import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { StaffService } from "@/server/services/staff.service";
import { SkillChangeRequestService } from "@/server/services/skill-change-request.service";

// ─────────────────────────────────────────────────────────────
// GET /api/me/skills/requests
//
// Returns the caller's own skill change requests (newest first). The
// mobile profile uses the `pending` ones to render "pending approval"
// (add) and "pending removal" chip states. Returned regardless of the
// self-service setting so in-flight requests still render if a manager
// toggles the setting off.
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

    await dbConnect();
    const ctx = await getLocationContext(userId);

    const staff = await StaffService.getByClerkUserId(
      ctx.orgId,
      ctx.locationId,
      userId,
    );
    if (!staff) {
      return NextResponse.json(
        { error: "No staff record linked to this account." },
        { status: 404 },
      );
    }

    const requests = await SkillChangeRequestService.listForStaff(
      ctx.orgId,
      ctx.locationId,
      staff.id,
    );

    return NextResponse.json(requests);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/me/skills/requests GET] failed:", message);
    return NextResponse.json(
      { error: "Failed to load skill requests." },
      { status: 500 },
    );
  }
}
