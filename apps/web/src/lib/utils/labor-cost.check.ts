import {
  calculateLaborCost,
  estimateAcceptedWeekLaborCost,
  formatLaborCost,
} from "./labor-cost";

const staff = [
  { id: "a", hourlyRate: 20 },
  { id: "b", hourlyRate: 0 },
];
const weekStart = new Date(2026, 8, 28);

const existing = [
  {
    staffId: "a",
    start: new Date(2026, 8, 28, 9, 0),
    end: new Date(2026, 8, 28, 17, 0),
  },
];

const generatedDays = [
  {
    date: "2026-09-28",
    assignments: [{ staffId: "a", startTime: "10:00", endTime: "14:00" }],
  },
  {
    date: "2026-09-29",
    assignments: [
      { staffId: "a", startTime: "09:00", endTime: "17:00" },
      { staffId: "b", startTime: "09:00", endTime: "13:00" },
    ],
  },
];

const pageShifts = [
  ...existing,
  {
    staffId: "a",
    start: new Date(2026, 8, 29, 9, 0),
    end: new Date(2026, 8, 29, 17, 0),
  },
  {
    staffId: "b",
    start: new Date(2026, 8, 29, 9, 0),
    end: new Date(2026, 8, 29, 13, 0),
  },
];

const projected = estimateAcceptedWeekLaborCost({
  weekStart,
  existingShifts: existing,
  generatedDays,
  staff,
});
const page = calculateLaborCost(pageShifts, staff);

if (projected.cost !== 320) {
  throw new Error(`expected 320, got ${projected.cost}`);
}
if (projected.cost !== page) {
  throw new Error(`projected ${projected.cost} !== page ${page}`);
}
if (!projected.missingHourlyRate) {
  throw new Error("expected missing rate flag");
}
if (formatLaborCost(projected.cost) !== formatLaborCost(page)) {
  throw new Error("format mismatch");
}

console.log("ok", projected.cost, formatLaborCost(projected.cost));
