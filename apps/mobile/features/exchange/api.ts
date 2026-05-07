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
//       `ExchangeShift.updatedAt` to transition the ExchangeShift to
//       `pending_coverage`. The underlying `Shift.staffId` is NOT
//       reassigned — both staffers' schedules stay intact until a
//       manager approves the swap on the web.
//     • 200 → ExchangeShiftDTO & { pendingApproval: true }
//     • 400 → { error } for invalid id / no caller staff record
//     • 401 → { error } when the JWT is missing
//     • 403 → { error } for self-pickup or schedule conflict
//     • 404 → { error } when the ExchangeShift does not exist
//     • 409 → { error } when the row is no longer available
//             (someone picked it up first or the dropper cancelled)
//
//   GET /exchange/my-pickups
//     • Auth: Clerk JWT.
//     • Server resolves the caller's `staffId` from the JWT and
//       returns every exchange row they have picked up
//       (`pickedUpByStaffId === caller`) in any status. Drives the
//       mobile "My Pickups" tab so the picker can track
//       pending/approved/denied state.
//     • 200 → ExchangeShiftDTO[]
//     • 401 → { error } when the JWT is missing
//
//   POST /exchange/:exchangeId/withdraw
//     • Auth: Clerk JWT.
//     • No body. Picker only. Transitions a `pending_coverage` row
//       back to `available`, clearing `pickedUpByStaffId` /
//       `pickedUpByName` so the drop is up for grabs again.
//     • 200 → ExchangeShiftDTO  (updated row)
//     • 401 → { error } when the JWT is missing
//     • 403 → { error } when the caller is not the current picker
//     • 404 → { error } when the ExchangeShift does not exist
//     • 409 → { error } when the row is no longer `pending_coverage`
//             (manager already decided, or another race condition)
//
//   POST /exchange/:exchangeId/cancel
//     • Auth: Clerk JWT.
//     • No body. Dropper only. Transitions their own `available` or
//       `pending_coverage` drop to `cancelled`. If the drop had a
//       picker, their pickup effectively disappears.
//     • 200 → ExchangeShiftDTO
//     • 401 → { error } when the JWT is missing
//     • 403 → { error } when the caller is not the dropper
//     • 404 → { error } when the ExchangeShift does not exist
//     • 409 → { error } when the row is terminal already
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
//   - `["exchange", "pickups"]`
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
 * Returns every ExchangeShift the caller has picked up, in any
 * status, sorted newest-first. Drives the mobile "My Pickups" tab so
 * the picker can watch their pending/approved/denied submissions.
 */
export async function fetchMyPickups(): Promise<ExchangeShift[]> {
  const response = await apiClient.get<SerializedExchangeShift[]>(
    "/exchange/my-pickups",
  );
  return response.data.map(reviveExchangeShift);
}

/**
 * Pick up an available exchange shift. The server transitions the
 * row to `pending_coverage` and returns the updated DTO alongside a
 * `pendingApproval: true` marker so the UI can switch to an
 * "awaiting manager approval" state without re-inspecting `status`.
 */
export async function pickUpShift(
  exchangeId: string,
): Promise<ExchangeShift> {
  const response = await apiClient.post<SerializedPickupResponse>(
    `/exchange/${encodeURIComponent(exchangeId)}/pickup`,
  );
  return reviveExchangeShift(response.data);
}

/**
 * Picker rescinds a `pending_coverage` pickup so the drop returns to
 * the `available` pool. 409 if the manager already approved / denied.
 */
export async function withdrawPickup(
  exchangeId: string,
): Promise<ExchangeShift> {
  const response = await apiClient.post<SerializedExchangeShift>(
    `/exchange/${encodeURIComponent(exchangeId)}/withdraw`,
  );
  return reviveExchangeShift(response.data);
}

/**
 * Dropper rescinds their own `available` or `pending_coverage` drop.
 * The exchange row transitions to `cancelled` and any picker sitting
 * on it effectively loses the pickup (they'll see `cancelled` in
 * their "My Pickups" list).
 */
export async function cancelOwnDrop(
  exchangeId: string,
): Promise<ExchangeShift> {
  const response = await apiClient.post<SerializedExchangeShift>(
    `/exchange/${encodeURIComponent(exchangeId)}/cancel`,
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

/**
 * Pickup response carries a convenience `pendingApproval` flag so the
 * mobile client can switch into an "awaiting manager approval" state
 * without re-inspecting `status`. The field is informational — the
 * row's `status` remains the source of truth.
 */
type SerializedPickupResponse = SerializedExchangeShift & {
  pendingApproval?: boolean;
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
