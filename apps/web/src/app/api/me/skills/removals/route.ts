import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { StaffService } from "@/server/services/staff.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { SkillChangeRequestService } from "@/server/services/skill-change-request.service";
import { NotificationEvents } from "@/server/services/notification-events";
import { submitSkillRemovalSchema } from "@sous/types/validations/skill-change-request.schema";

// ─────────────────────────────────────────────────────────────
// POST /api/me/skills/removals
//
// A staff member requests removing one of their station skills, with a
// reason. The skill stays active (and schedulable) until a manager
// approves the removal. Managers are notified.
//
// Gated by `KitchenConfig.allowStaffToManageOwnSkills`. `staffId` is
// resolved server-side from the Clerk JWT — never trusted from the
// client.
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    const parsed = submitSkillRemovalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

    await dbConnect();
    const ctx = await getLocationContext(userId);

    const config = await KitchenConfigService.getByLocation(
      ctx.orgId,
      ctx.locationId,
    );
    if (!config?.allowStaffToManageOwnSkills) {
      return NextResponse.json(
        { error: "Self-service skills are turned off for your location." },
        { status: 403 },
      );
    }

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

    let request;
    try {
      request = await SkillChangeRequestService.submitRemoval(
        ctx.orgId,
        ctx.locationId,
        {
          id: staff.id,
          name: staff.name,
          clerkUserId: userId,
          skills: staff.skills,
        },
        { station: parsed.data.station, reason: parsed.data.reason },
      );
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Could not submit the removal request.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    void NotificationEvents.skillChangeSubmitted({
      request,
      orgId: ctx.orgId,
      locationId: ctx.locationId,
    });

    return NextResponse.json(request, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/me/skills/removals POST] failed:", message);
    return NextResponse.json(
      { error: "Failed to submit removal request." },
      { status: 500 },
    );
  }
}
