import type { ShiftDTO, StaffDTO } from "@sous/types";

const STATIONS = ["Sauté", "Grill", "Prep", "Garde Manger", "Pastry", "Dish"];

/**
 * Returns all of the current user's shifts for a given week.
 * Replace with `apiClient.get("/shifts", { params: { weekStart } })` later.
 */
export async function fetchWeekShifts(weekStart: Date): Promise<ShiftDTO[]> {
  await delay(350);

  const shifts: ShiftDTO[] = [];
  const baseDate = new Date(weekStart);

  const shiftDays = [0, 1, 2, 4, 5];
  for (const dayOffset of shiftDays) {
    const start = new Date(baseDate);
    start.setDate(start.getDate() + dayOffset);

    const isEvening = dayOffset % 2 === 1;
    start.setHours(isEvening ? 15 : 7, 0, 0, 0);

    const end = new Date(start);
    end.setHours(start.getHours() + 8, 0, 0, 0);

    shifts.push({
      id: `shift-week-${dayOffset}`,
      orgId: "org-001",
      locationId: "loc-001",
      scheduleId: "sched-001",
      staffId: "staff-001",
      start,
      end,
      station: STATIONS[dayOffset % STATIONS.length],
      notes: dayOffset === 0 ? "Double-check mise en place for risotto special" : "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return shifts;
}

/**
 * Returns the full roster of staff working a specific shift.
 * Replace with `apiClient.get("/shifts/:id/roster")` later.
 */
export async function fetchShiftRoster(_shiftId: string): Promise<StaffDTO[]> {
  await delay(300);

  return [
    mockStaff("staff-001", "Alex Rivera", "Sauté", ["Sauté", "Grill"]),
    mockStaff("staff-002", "Jordan Chen", "Grill", ["Grill", "Prep"]),
    mockStaff("staff-003", "Sam Okafor", "Prep", ["Prep", "Garde Manger"]),
    mockStaff("staff-004", "Maria Lopez", "Garde Manger", ["Garde Manger", "Pastry"]),
    mockStaff("staff-005", "Liam Nguyen", "Dish", ["Dish"]),
  ];
}

function mockStaff(
  id: string,
  name: string,
  primaryRole: string,
  roles: string[]
): StaffDTO {
  return {
    id,
    orgId: "org-001",
    locationId: "loc-001",
    name,
    email: `${name.toLowerCase().replace(" ", ".")}@restaurant.com`,
    phone: "555-0100",
    roles,
    skills: [{ station: primaryRole, proficiency: 4 }],
    isActive: true,
    maxHoursPerWeek: 40,
    minHoursPerWeek: 20,
    preferredStations: [primaryRole],
    certifications: [],
    hourlyRate: 18,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
