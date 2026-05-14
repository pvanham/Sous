import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getLocationContext } from "@/lib/auth/get-location-context";
import { AnnouncementService } from "@/server/services/announcement.service";

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
// GET /api/announcements?limit=20  —  Mobile (Home tab)
//
// Backs `apps/mobile/features/home/api.ts → fetchAnnouncements()`.
//
// Purpose
//   Return manager-authored announcements for the caller's location,
//   newest first, so the mobile home tab can render real data.
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
//
// Response
//   - 200 → `AnnouncementDTO[]`
//   - 401 → `{ error }` when the JWT is missing.
//   - 500 → `{ error }` for unexpected failures.
// ─────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

    const announcements = await AnnouncementService.list(
      ctx.orgId,
      ctx.locationId,
      { limit },
    );

    return NextResponse.json(announcements);
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
