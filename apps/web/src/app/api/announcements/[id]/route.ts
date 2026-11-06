import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { AnnouncementListItemDTO } from "@sous/types";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { readableAudienceForMember } from "@/lib/announcement/resolve-audience";
import { AnnouncementService } from "@/server/services/announcement.service";
import { AnnouncementAcknowledgmentService } from "@/server/services/announcement-acknowledgment.service";

/**
 * GET /api/announcements/[id]  —  Mobile announcement detail
 *
 * Returns one tenant-scoped announcement plus caller-scoped read/ack
 * state. Used by the dedicated mobile announcement detail screen.
 */
export async function GET(
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
    const audience = await readableAudienceForMember(ctx, userId);
    const announcement = await AnnouncementService.getPublishedForReader(
      ctx.orgId,
      ctx.locationId,
      id,
      audience
    );

    if (!announcement) {
      return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
    }

    const acknowledgment = await AnnouncementAcknowledgmentService.getForUser(
      ctx.orgId,
      ctx.locationId,
      announcement.id,
      userId
    );

    const payload: AnnouncementListItemDTO = { announcement, acknowledgment };
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[api/announcements/[id]] failed:", message);
    return NextResponse.json(
      { error: "Failed to load announcement." },
      { status: 500 }
    );
  }
}
