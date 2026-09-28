import { combineDateTime, parseDateString } from "@/lib/utils/date";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface LaborCostShift {
  staffId: string;
  start: Date | string;
  end: Date | string;
}

export interface LaborCostStaff {
  id: string;
  hourlyRate?: number | null;
}

export interface GeneratedDayCostInput {
  date: string;
  assignments: Array<{
    staffId: string;
    startTime: string;
    endTime: string;
  }>;
}

/**
 * Labor cost for a set of shifts: each shift's elapsed hours times that
 * staff member's hourly rate. A missing or non-positive rate counts as $0.
 *
 * This is the schedule page's "Total Cost". Preview estimates must use the
 * same function so the number does not change after the schedule is accepted.
 */
export function calculateLaborCost(
  shifts: LaborCostShift[],
  staff: LaborCostStaff[] = [],
): number {
  const rates = new Map(
    staff.map((member) => [
      member.id,
      member.hourlyRate && member.hourlyRate > 0 ? member.hourlyRate : 0,
    ]),
  );

  return shifts.reduce((total, shift) => {
    const start = new Date(shift.start).getTime();
    const end = new Date(shift.end).getTime();
    const hours = (end - start) / (1000 * 60 * 60);
    const hourlyRate = rates.get(shift.staffId) ?? 0;
    return total + hours * hourlyRate;
  }, 0);
}

function shiftsOverlap(a: LaborCostShift, b: LaborCostShift): boolean {
  const aStart = new Date(a.start).getTime();
  const aEnd = new Date(a.end).getTime();
  const bStart = new Date(b.start).getTime();
  const bEnd = new Date(b.end).getTime();
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Projected labor cost of the week after generated assignments are accepted.
 *
 * Starts from the shifts already visible in the week window, then adds new
 * assignments in the same order accept persists them. An assignment that
 * overlaps an existing shift for the same person is left out, because
 * `ShiftService.bulkCreate` skips that conflict. Times use the same
 * `parseDateString` + `combineDateTime` path as accept, so durations match
 * the schedule page.
 */
export function estimateAcceptedWeekLaborCost(input: {
  weekStart: Date | string;
  existingShifts: LaborCostShift[];
  generatedDays: GeneratedDayCostInput[];
  staff: LaborCostStaff[];
}): { cost: number; missingHourlyRate: boolean } {
  const weekStartMs = new Date(input.weekStart).getTime();
  const weekEndMs = weekStartMs + WEEK_MS;

  const counted: LaborCostShift[] = input.existingShifts.filter((shift) => {
    const start = new Date(shift.start).getTime();
    return start >= weekStartMs && start < weekEndMs;
  });

  const days = [...input.generatedDays].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  for (const day of days) {
    const date = parseDateString(day.date);
    for (const assignment of day.assignments) {
      const next: LaborCostShift = {
        staffId: assignment.staffId,
        start: combineDateTime(date, assignment.startTime),
        end: combineDateTime(date, assignment.endTime),
      };
      const start = new Date(next.start).getTime();
      if (start < weekStartMs || start >= weekEndMs) continue;

      const conflicts = counted.some(
        (shift) =>
          shift.staffId === next.staffId && shiftsOverlap(shift, next),
      );
      if (conflicts) continue;
      counted.push(next);
    }
  }

  const rates = new Map(
    input.staff.map((member) => [
      member.id,
      member.hourlyRate && member.hourlyRate > 0 ? member.hourlyRate : 0,
    ]),
  );
  const missingHourlyRate = counted.some(
    (shift) => (rates.get(shift.staffId) ?? 0) === 0,
  );

  return {
    cost: calculateLaborCost(counted, input.staff),
    missingHourlyRate,
  };
}

/** Same currency format as the schedule page total. */
export function formatLaborCost(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
