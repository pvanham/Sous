import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { StaffService } from "@/server/services/staff.service";
import { KitchenConfigService } from "@/server/services/kitchen-config.service";
import { SkillChangeRequestService } from "@/server/services/skill-change-request.service";
import { NotificationEvents } from "@/server/services/notification-events";
import { submitSkillAdditionSchema } from "@sous/types/validations/skill-change-request.schema";

// ─────────────────────────────────────────────────────────────
// POST /api/me/skills/additions
//
// A staff member proposes adding one of their station skills. The
// skill does NOT activate immediately: a `pending` SkillChangeRequest
// is created and a manager must approve it before it lands on
// `Staff.skills`. Managers are notified.
//
// Gated by `KitchenConfig.allowStaffToManageOwnSkills`. The station
// must exist in `KitchenConfig.stations`. `staffId` is resolved
// server-side from the Clerk JWT — never trusted from the client.
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

    const parsed = submitSkillAdditionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid skill." },
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

    if (!config.stations.includes(parsed.data.station)) {
      return NextResponse.json(
        { error: "That station is not part of your kitchen." },
        { status: 400 },
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
      request = await SkillChangeRequestService.submitAddition(
        ctx.orgId,
        ctx.locationId,
        {
          id: staff.id,
          name: staff.name,
          clerkUserId: userId,
          skills: staff.skills,
        },
        {
          station: parsed.data.station,
          proficiency: parsed.data.proficiency as 1 | 2 | 3 | 4 | 5,
        },
      );
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Could not submit the skill.";
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
    console.error("[api/me/skills/additions POST] failed:", message);
    return NextResponse.json(
      { error: "Failed to submit skill." },
      { status: 500 },
    );
  }
}
