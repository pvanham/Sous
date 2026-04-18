import type { ShiftDTO } from "@sous/types";
import type { Announcement } from "@/types";

// ─────────────────────────────────────────────────────────────
// Home tab — server-state access layer.
//
// Responsibilities
//   - Fetch the staff member's next upcoming shift.
//   - Fetch recent announcements scoped to the current location.
//
// Backend contract (planned, not yet implemented)
//   GET /shifts/next
//     • Auth: Clerk JWT (Authorization: Bearer ...)
//     • Resolves the calling user's Staff record via OrganizationMember,
//       then returns the soonest Shift with `start >= now`.
//     • 200 → ShiftDTO | null
//     • 401 → { error } when the JWT is missing/invalid
//     • 404 → { error } when the user has no membership
//
//   GET /announcements?limit=20
//     • Auth: Clerk JWT
//     • Returns announcements for the user's location, newest first.
//     • Once announcements ship, the shape should live in @sous/types
//       so both apps consume the same DTO.
//     • 200 → Announcement[]
//
// Implementation steps when wiring real endpoints
//   1. Replace the mock body with `apiClient.get("...")` (Axios).
//   2. Delete the `delay()` / mock factories below.
//   3. Use DTOs from `@sous/types` directly — do not re-declare shapes
//      in `apps/mobile/types`.
//   4. Surface errors with a readable message via the calling screen's
//      TanStack Query `error` channel; never silently fall back to
//      placeholder data.
//   5. Keep the `["home", ...]` query keys consistent with the
//      conventions in docs/architecture/08-mobile-architecture.md §8.
// ─────────────────────────────────────────────────────────────

/**
 * Returns the user's next upcoming shift.
 * Replace with `apiClient.get("/shifts/next")` when the backend endpoint exists.
 */
export async function fetchNextShift(): Promise<ShiftDTO> {
  await delay(400);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(7, 0, 0, 0);

  const end = new Date(tomorrow);
  end.setHours(15, 0, 0, 0);

  return {
    id: "shift-001",
    orgId: "org-001",
    locationId: "loc-001",
    scheduleId: "sched-001",
    staffId: "staff-001",
    start: tomorrow,
    end,
    station: "Sauté",
    notes: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Returns recent announcements from the manager.
 * Replace with `apiClient.get("/announcements")` when ready.
 */
export async function fetchAnnouncements(): Promise<Announcement[]> {
  await delay(300);

  return [
    {
      id: "ann-001",
      title: "Menu Update",
      body: "New spring risotto special starts Friday. Prep list updated in the walk-in binder.",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      priority: "high",
    },
    {
      id: "ann-002",
      title: "Health Inspection Reminder",
      body: "County inspector coming next Tuesday. Deep clean stations at end of every shift this week.",
      createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      priority: "urgent",
    },
    {
      id: "ann-003",
      title: "Staff Meeting",
      body: "All-hands meeting this Sunday at 3 PM before dinner service. Attendance mandatory.",
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      priority: "normal",
    },
    {
      id: "ann-004",
      title: "New Dishwasher",
      body: "Welcome Marco to the team! He starts on the dish pit Monday evening.",
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      priority: "low",
    },
  ];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
