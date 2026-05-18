import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { AnnouncementService } from "@/server/services/announcement.service";
import { AnnouncementAcknowledgmentService } from "@/server/services/announcement-acknowledgment.service";
import type { AnnouncementListItemDTO } from "@sous/types";

// ─────────────────────────────────────────────────────────────
// PHASE-1 ANNOUNCEMENT REWRITE — DO NOT REVERT TO OLD SHAPE
//
// This route intentionally stays a thin shim over AnnouncementService
// while later phases implement richer dashboard/composer flows.
//
// Do NOT reintroduce:
// - `expiresAt`
// - legacy 4-tier priority values
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// GET /api/announcements?limit=20&lifecycle=active|expired  —  Mobile
//
// Backs:
//   - apps/mobile/features/home/api.ts → fetchAnnouncements()
//   - apps/mobile/features/announcements/api.ts → fetchAnnouncements()
//
// Purpose
//   Return manager-authored announcements for the caller's location plus
//   caller-scoped acknowledgment state, newest first.
//
// Auth & tenancy
//   - `auth()` resolves the Clerk user; missing JWT → 401.
//   - `getLocationContext(userId)` scopes the read to the active
//     org + location. Reads are open to every role (staff,
//     shift_lead, manager, owner). Manager-only writes still go
//     through `announcement.actions.ts`.
//
// Query params
//   - `limit` (optional): integer 1–100, defaults to 20. Out-of-range
//     values are clamped silently rather than 400'd — the mobile UI
//     never crafts invalid limits and we'd rather degrade gracefully
//     than break the home feed.
//   - `lifecycle` (optional): `active` (default) or `expired`.
//
// Response
//   - 200 → `AnnouncementListItemDTO[]`
//   - 401 → `{ error }` when the JWT is missing.
//   - 500 → `{ error }` for unexpected failures.
// ─────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const lifecycleValues = ["active", "expired"] as const;
type AnnouncementLifecycleFilter = (typeof lifecycleValues)[number];

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const ctx = await getLocationContext(userId);

    const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
    const lifecycle = parseLifecycle(req.nextUrl.searchParams.get("lifecycle"));

    const announcements = await listByLifecycle(ctx.orgId, ctx.locationId, lifecycle, limit);
    const ackRows = await AnnouncementAcknowledgmentService.getManyForUser(
      ctx.orgId,
      ctx.locationId,
      announcements.map((announcement) => announcement.id),
      userId
    );
    const ackByAnnouncementId = new Map(
      ackRows.map((row) => [row.announcementId, row] as const)
    );

    const payload: AnnouncementListItemDTO[] = announcements.map((announcement) => ({
      announcement,
      acknowledgment: ackByAnnouncementId.get(announcement.id) ?? null,
    }));

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[api/announcements] failed:", message);
    return NextResponse.json(
      { error: "Failed to load announcements." },
      { status: 500 },
    );
  }
}

/**
 * Parse and clamp the `limit` query param. Falls back to the default
 * for missing / non-numeric / out-of-range values so a malformed
 * client request never breaks the home feed.
 */
function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseLifecycle(raw: string | null): AnnouncementLifecycleFilter {
  if (!raw) return "active";
  if (lifecycleValues.includes(raw as AnnouncementLifecycleFilter)) {
    return raw as AnnouncementLifecycleFilter;
  }
  return "active";
}

async function listByLifecycle(
  orgId: string,
  locationId: string,
  lifecycle: AnnouncementLifecycleFilter,
  limit: number
) {
  const rows = await AnnouncementService.list(orgId, locationId, {
    limit,
    includeExpired: lifecycle === "expired",
  });

  if (lifecycle === "expired") {
    const now = Date.now();
    return rows.filter((row) => row.expirationDate !== null && row.expirationDate.getTime() <= now);
  }

  return rows;
}
