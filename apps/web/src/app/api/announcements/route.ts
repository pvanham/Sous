import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// GET /api/announcements?limit=20  —  Mobile (Home tab)
//
// Backs `apps/mobile/features/home/api.ts → fetchAnnouncements()`.
//
// Purpose
//   Return manager-authored announcements for the caller's location,
//   newest first, so the mobile home tab can replace its hard-coded
//   sample list.
//
// Status
//   The backend foundation now exists (see SHI-11):
//     - `AnnouncementDTO` + `AnnouncementPriority` in `@sous/types`.
//     - Zod validators in
//       `packages/types/src/validations/announcement.schema.ts`.
//     - Mongoose model at `apps/web/src/server/models/Announcement.ts`.
//     - Service at `apps/web/src/server/services/announcement.service.ts`.
//     - Manager-only Server Actions in
//       `apps/web/src/server/actions/announcement.actions.ts`.
//   THIS route handler is still a 501 placeholder. Wiring it up
//   simply means resolving the location context and delegating to
//   `AnnouncementService.list(orgId, locationId, { limit })`.
//
// Auth & tenancy (when implementing)
//   - `auth()` → `getLocationContext(userId)`.
//   - All roles may read; manager / owner writes go through the
//     Server Actions, NOT this route.
//
// Response (planned)
//   - 200 → `AnnouncementDTO[]`
//   - 401 → `{ error }` when JWT missing
// ─────────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { error: "Not implemented yet. See route file comments for the plan." },
    { status: 501 },
  );
}
