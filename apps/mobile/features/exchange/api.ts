import type { ExchangeShiftDTO } from "@sous/types";
import { apiClient } from "@/lib/api-client";
import type { ExchangeShift } from "@/types";

// ─────────────────────────────────────────────────────────────
// Exchange (shift drop / pickup) tab — server-state access layer.
//
// Responsibilities
//   - List shifts other staff have dropped that the caller can pick
//     up (`/api/exchange/available`).
//   - List shifts the caller has dropped, in any status
//     (`/api/exchange/mine`).
//   - Pick up an available shift
//     (`/api/exchange/[exchangeId]/pickup`).
//   - Drop one of the caller's own shifts onto the exchange board
//     (`/api/shifts/[shiftId]/drop`).
//
// Backend contract (live as of SHI-8)
//   GET /exchange/available
//     • Auth: Clerk JWT (Authorization: Bearer ...) — attached by the
//       Axios interceptor in `lib/api-client.ts`.
//     • Server resolves the caller's `staffId` from the JWT and
//       excludes their own drops from the feed; the client never
//       sends a `staffId`.
//     • 200 → ExchangeShiftDTO[]
//     • 401 → { error } when the JWT is missing
//
//   GET /exchange/mine
//     • Auth: Clerk JWT.
//     • Server resolves the caller's `staffId` from the JWT and
//       returns every drop they own, regardless of status. Manager /
//       owner callers with no Staff row at the active location get
//       [] (matching the graceful-empty pattern from `/api/shifts`
//       and `/api/time-off`).
//     • 200 → ExchangeShiftDTO[]
//     • 401 → { error } when the JWT is missing
//
//   POST /exchange/:exchangeId/pickup
//     • Auth: Clerk JWT.
//     • No body. The server resolves the picker's `staffId` from the
//       JWT, runs eligibility checks (no self-pickup, no schedule
//       overlap), and uses an OCC update against
//       `ExchangeShift.updatedAt` to atomically reassign the
//       underlying Shift's `staffId` and transition the
//       ExchangeShift to `covered`.
//     • 200 → ExchangeShiftDTO  (updated row)
//     • 400 → { error } for invalid id / no caller staff record
//     • 401 → { error } when the JWT is missing
//     • 403 → { error } for self-pickup or schedule conflict
//     • 404 → { error } when the ExchangeShift does not exist
//     • 409 → { error } when the row is no longer available
//             (someone picked it up first or the dropper cancelled)
//
//   POST /shifts/:shiftId/drop
//     • Auth: Clerk JWT.
//     • Body: { reason?: string }  (optional, max 500 chars).
//     • Server verifies the underlying Shift belongs to the caller,
//       then creates a new ExchangeShift with status `available`.
//     • 200 → ExchangeShiftDTO  (newly created)
//     • 400 → { error } for invalid id / malformed body
//     • 401 → { error } when the JWT is missing
//     • 403 → { error } when the shift is not assigned to the caller
//     • 404 → { error } when the shift does not exist
//     • 409 → { error } when the shift is already on the board
//
// Wire format
//   The web API serialises `Date` fields (`start`, `end`,
//   `approvedAt`, `createdAt`, `updatedAt`) as ISO strings. The DTO
//   declares them as real `Date`s, so we revive them here before
//   returning to the UI — components rely on `Date` instances for
//   `toLocaleDateString` / `toLocaleTimeString` formatting.
//
// Query keys (see docs/architecture/08-mobile-architecture.md §8)
//   - `["exchange", "available"]`
//   - `["exchange", "mine"]`
//
// Mutation invalidation
//   pickUp / drop must invalidate BOTH `["exchange"]` (board + my
//   drops) AND `["schedule"]` (the caller's weekly view changes
//   because a shift is being added or removed). The screen wires
//   that up; the API layer just speaks HTTP.
// ─────────────────────────────────────────────────────────────

/**
 * Returns shifts that other staff have dropped and are still
 * pickup-eligible. Excludes the caller's own drops (server-side).
 */
export async function fetchAvailableShifts(): Promise<ExchangeShift[]> {
  const response = await apiClient.get<SerializedExchangeShift[]>(
    "/exchange/available",
  );
  return response.data.map(reviveExchangeShift);
}

/**
 * Returns every ExchangeShift the caller has dropped, in any status,
 * sorted newest-first so the mobile "My drops" tab shows the most
 * recent activity at the top.
 */
export async function fetchMyDroppedShifts(): Promise<ExchangeShift[]> {
  const response = await apiClient.get<SerializedExchangeShift[]>(
    "/exchange/mine",
  );
  return response.data.map(reviveExchangeShift);
}

/**
 * Pick up an available exchange shift. Returns the updated row so
 * the caller can optimistically render the new status (`covered`)
 * before the next refetch.
 */
export async function pickUpShift(
  exchangeId: string,
): Promise<ExchangeShift> {
  const response = await apiClient.post<SerializedExchangeShift>(
    `/exchange/${encodeURIComponent(exchangeId)}/pickup`,
  );
  return reviveExchangeShift(response.data);
}

/**
 * Drop one of the caller's own shifts onto the exchange board.
 * Returns the newly created row (`status: "available"`).
 */
export async function dropShift(
  shiftId: string,
  options: { reason?: string } = {},
): Promise<ExchangeShift> {
  const response = await apiClient.post<SerializedExchangeShift>(
    `/shifts/${encodeURIComponent(shiftId)}/drop`,
    { reason: options.reason ?? "" },
  );
  return reviveExchangeShift(response.data);
}

// ── Wire shape (Date fields arrive as ISO strings) ──────────

type SerializedExchangeShift = Omit<
  ExchangeShiftDTO,
  "start" | "end" | "approvedAt" | "createdAt" | "updatedAt"
> & {
  start: string;
  end: string;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

function reviveExchangeShift(
  raw: SerializedExchangeShift,
): ExchangeShift {
  return {
    ...raw,
    start: new Date(raw.start),
    end: new Date(raw.end),
    approvedAt: raw.approvedAt ? new Date(raw.approvedAt) : null,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}
