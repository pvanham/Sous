import type { ExchangeShift } from "@/types";

/**
 * Returns shifts that other staff have dropped and are available for pickup.
 * Replace with `apiClient.get("/exchange/available")` later.
 */
export async function fetchAvailableShifts(): Promise<ExchangeShift[]> {
  await delay(350);

  const base = new Date();
  base.setDate(base.getDate() + 2);
  base.setHours(11, 0, 0, 0);

  return [
    makeExchangeShift("ex-001", "Jordan Chen", base, 8, "Grill", "available"),
    makeExchangeShift(
      "ex-002",
      "Maria Lopez",
      addDays(base, 1),
      6,
      "Garde Manger",
      "available"
    ),
    makeExchangeShift(
      "ex-003",
      "Liam Nguyen",
      addDays(base, 3),
      8,
      "Dish",
      "available"
    ),
  ];
}

/**
 * Returns shifts the current user has dropped.
 * Replace with `apiClient.get("/exchange/mine")` later.
 */
export async function fetchMyDroppedShifts(): Promise<ExchangeShift[]> {
  await delay(300);

  const base = new Date();
  base.setDate(base.getDate() + 4);
  base.setHours(7, 0, 0, 0);

  return [
    makeExchangeShift(
      "ex-100",
      "Alex Rivera",
      base,
      8,
      "Sauté",
      "pending_coverage"
    ),
    makeExchangeShift(
      "ex-101",
      "Alex Rivera",
      addDays(base, 3),
      8,
      "Prep",
      "covered"
    ),
    makeExchangeShift(
      "ex-102",
      "Alex Rivera",
      addDays(base, -5),
      6,
      "Sauté",
      "manager_approved"
    ),
  ];
}

/** Simulates picking up a shift from the exchange board. */
export async function pickUpShift(_shiftId: string): Promise<void> {
  await delay(500);
}

/** Simulates dropping one of the user's own shifts. */
export async function dropShift(_shiftId: string): Promise<void> {
  await delay(500);
}

function makeExchangeShift(
  id: string,
  droppedByName: string,
  start: Date,
  durationHours: number,
  station: string,
  status: ExchangeShift["status"]
): ExchangeShift {
  const end = new Date(start);
  end.setHours(start.getHours() + durationHours);

  return {
    id,
    shiftId: `shift-${id}`,
    orgId: "org-001",
    locationId: "loc-001",
    scheduleId: "sched-001",
    staffId: "staff-001",
    droppedByName,
    start,
    end,
    station,
    status,
    createdAt: new Date(),
  };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
