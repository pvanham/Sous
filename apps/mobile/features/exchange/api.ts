import type { ExchangeShift } from "@/types";

// ─────────────────────────────────────────────────────────────
// Exchange (shift drop / pickup) tab — server-state access layer.
//
// Responsibilities
//   - List shifts other staff have dropped that the caller can pick up.
//   - List shifts the caller has dropped (with their coverage state).
//   - Pick up an available shift.
//   - Drop one of the caller's own shifts onto the exchange board.
//
// Backend contract (planned, not yet implemented)
//   GET /exchange/available
//     • Auth: Clerk JWT.
//     • Returns ExchangeShift entries with `status="available"` for the
//       caller's location, EXCLUDING shifts the caller dropped
//       themselves (those show up in /exchange/mine).
//     • Server SHOULD additionally exclude shifts the caller is not
//       eligible for (overlap with their own scheduled shifts,
//       missing required skill, etc.) but that's an implementation
//       detail of CandidateService — not a hard requirement for v1.
//     • 200 → ExchangeShift[]
//
//   GET /exchange/mine
//     • Auth: Clerk JWT.
//     • Returns ExchangeShift entries the caller dropped, regardless
//       of status (`available`, `pending_coverage`, `covered`,
//       `manager_approved`).
//     • 200 → ExchangeShift[]
//
//   POST /exchange/:exchangeId/pickup
//     • Auth: Clerk JWT.
//     • Atomically (with OCC) reassigns the underlying Shift's
//       `staffId` to the caller and transitions the ExchangeShift to
//       `pending_coverage` (or `covered` if shift-lead approval is
//       not required by KitchenConfig).
//     • Rejects with 409 if the OCC token is stale (someone else
//       picked it up first).
//     • 200 → ExchangeShift
//     • 403 → { error } if the caller is ineligible
//     • 409 → { error } on stale data
//
//   POST /shifts/:shiftId/drop
//     • Auth: Clerk JWT.
//     • Verifies the shift belongs to the caller, then creates a new
//       ExchangeShift with `status="available"` referencing it.
//     • 200 → ExchangeShift
//     • 403 → { error } when the caller does not own the shift
//
// Resolved design decisions (SHI-11)
//   - `ExchangeShift` IS its own Mongoose model (not a status field on
//     `Shift`). The audit fields and OCC lifecycle live there.
//   - Manager approval is produced by
//     `ExchangeShiftService.approve(...)`, transitioning
//     `pending_coverage → manager_approved`.
//   - `ExchangeShiftDTO` + `ExchangeShiftStatus` now live in
//     `@sous/types`; this file's `import type { ExchangeShift }`
//     resolves through `apps/mobile/types/index.ts` to the same DTO.
//
// Implementation steps when wiring real endpoints
//   1. Replace each mock body with `apiClient.get / post(...)`.
//   2. Drop `makeExchangeShift()` and `delay()` helpers.
//   3. Mutation `onSuccess` for pickup/drop must invalidate
//      `["exchange"]` AND `["schedule"]` (the caller's weekly view
//      will have changed).
// ─────────────────────────────────────────────────────────────

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

/**
 * Simulates picking up a shift from the exchange board.
 * Replace with `apiClient.post("/exchange/:exchangeId/pickup")` later.
 */
export async function pickUpShift(_shiftId: string): Promise<void> {
  await delay(500);
}

/**
 * Simulates dropping one of the user's own shifts.
 * Replace with `apiClient.post("/shifts/:shiftId/drop")` later.
 */
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

  const now = new Date();

  return {
    id,
    shiftId: `shift-${id}`,
    orgId: "org-001",
    locationId: "loc-001",
    scheduleId: "sched-001",
    staffId: "staff-001",
    droppedByName,
    pickedUpByStaffId: null,
    pickedUpByName: null,
    start,
    end,
    station,
    status,
    reason: "",
    approvedByClerkUserId: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now,
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
