import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { AnnouncementService } from "@/server/services/announcement.service";
import { AnnouncementAcknowledgmentService } from "@/server/services/announcement-acknowledgment.service";

/**
 * POST /api/announcements/[id]/acknowledge
 *
 * Acknowledges an announcement for the currently signed-in user.
 * Returns 400 when the target announcement does not require explicit
 * acknowledgment.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Announcement ID is required." }, { status: 400 });
    }

    const ctx = await getLocationContext(userId);
    const announcement = await AnnouncementService.getById(ctx.orgId, ctx.locationId, id);

    if (!announcement) {
      return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
    }

    if (!announcement.requiresAcknowledgment) {
      return NextResponse.json({ error: "Acknowledgment not required." }, { status: 400 });
    }

    const acknowledgment = await AnnouncementAcknowledgmentService.acknowledge({
      orgId: ctx.orgId,
      locationId: ctx.locationId,
      announcementId: announcement.id,
      userId,
    });

    return NextResponse.json(acknowledgment);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/announcements/[id]/acknowledge] failed:", message);
    return NextResponse.json(
      { error: "Failed to acknowledge announcement." },
      { status: 500 }
    );
  }
}
