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
//   The `Announcement` domain does NOT exist on the web side yet —
//   no Mongoose model, no service, no DTO in `@sous/types`. This
//   route is a placeholder so future work has a known landing spot.
//
// Pre-implementation checklist (in order)
//   1. Add `AnnouncementDTO` (and `AnnouncementPriority`) to
//      `packages/types/src/index.ts` and delete the duplicate types
//      currently in `apps/mobile/types/index.ts`.
//   2. Add Zod validations in `packages/types/src/validations` for
//      create/update inputs.
//   3. Add the `Announcement` Mongoose model under
//      `apps/web/src/server/models/Announcement.ts` (orgId +
//      locationId + indexes + timestamps).
//   4. Add `apps/web/src/server/services/announcement.service.ts`
//      with at minimum `list({ limit })`, `create`, `delete`.
//   5. Add manager-only Server Actions in
//      `apps/web/src/server/actions/announcement.actions.ts` for the
//      eventual web-side authoring UI.
//   6. THEN flesh out this route handler.
//
// Auth & tenancy (when implementing)
//   - `auth()` → `getLocationContext(userId)`.
//   - All roles may read; manager / owner only may write (write goes
//     through Server Actions, NOT this route).
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
