import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { AnnouncementService } from "@/server/services/announcement.service";
import { AnnouncementAcknowledgmentService } from "@/server/services/announcement-acknowledgment.service";

/**
 * POST /api/announcements/[id]/read
 *
 * Marks the announcement as read for the currently signed-in user.
 * Idempotent — replaying this endpoint preserves the first `readAt`.
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

    const acknowledgment = await AnnouncementAcknowledgmentService.markRead({
      orgId: ctx.orgId,
      locationId: ctx.locationId,
      announcementId: announcement.id,
      userId,
    });

    return NextResponse.json(acknowledgment);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/announcements/[id]/read] failed:", message);
    return NextResponse.json(
      { error: "Failed to mark announcement as read." },
      { status: 500 }
    );
  }
}
