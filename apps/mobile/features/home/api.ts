import type { ShiftDTO } from "@sous/types";
import type { Announcement } from "@/types";

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
