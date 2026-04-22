import { AxiosError } from "axios";
import type { StaffAddress, StaffDTO } from "@sous/types";
import { apiClient } from "@/lib/api-client";

// ─────────────────────────────────────────────────────────────
// Profile tab — server-state access layer.
//
// Responsibilities
//   - Load the caller's canonical Staff record so the profile screen
//     can render phone, address, skills, etc. (GET /me/staff).
//   - Patch the narrow subset a staff member is allowed to edit
//     themselves (PATCH /me/staff → phone, address only).
//
// Backend contract — `apps/web/src/app/api/me/staff/route.ts`
//   • Auth: Clerk JWT injected by the Axios interceptor in
//     `apps/mobile/lib/api-client.ts`.
//   • Tenant + `staffId` are resolved server-side from the JWT — the
//     mobile client never supplies them.
//   • 404 is a normal response for managers / owners who don't have a
//     Staff row at this location. Callers should handle it gracefully
//     (render a reduced profile view).
//
// Wire format
//   Dates (`createdAt`, `updatedAt`) arrive as ISO strings; we revive
//   them here so UI code can rely on real `Date` instances, matching
//   the convention in `features/schedule/api.ts`.
// ─────────────────────────────────────────────────────────────

/**
 * Fetch the caller's own `StaffDTO`. Throws for any status other
 * than 200; `404` should be handled by the caller (via react-query's
 * `error` branch) to render the "no staff row" fallback.
 */
export async function fetchMyStaff(): Promise<StaffDTO> {
  const response = await apiClient.get<SerializedStaff>("/me/staff");
  return reviveStaff(response.data);
}

/**
 * Patch the caller's own profile. The server's PATCH /me/staff route
 * accepts only the narrow subset of self-editable fields; any other
 * key is rejected. Send `address: null` to clear a previously-entered
 * address.
 *
 * Self-editable fields (kept in sync with `selfUpdateSchema` in
 * `apps/web/src/app/api/me/staff/route.ts`):
 *   - `phone`             — primary contact number
 *   - `address`           — physical mailing address (or `null` to clear)
 *   - `minHoursPerWeek`   — staff-preferred floor for weekly hours
 *   - `maxHoursPerWeek`   — staff-preferred ceiling for weekly hours
 *   - `preferredStations` — preferred kitchen stations (subset of approved skills)
 */
export type UpdateMyStaffInput = {
  phone?: string;
  address?: StaffAddress | null;
  minHoursPerWeek?: number;
  maxHoursPerWeek?: number;
  preferredStations?: string[];
};

export async function updateMyStaff(
  patch: UpdateMyStaffInput,
): Promise<StaffDTO> {
  try {
    const response = await apiClient.patch<SerializedStaff>(
      "/me/staff",
      patch,
    );
    return reviveStaff(response.data);
  } catch (err) {
    throw unwrapServerError(err, "Could not save your changes.");
  }
}

/**
 * Translate an `AxiosError` from the profile endpoints into a plain
 * `Error` whose `.message` is the server-supplied string (or the
 * provided fallback). Keeps UI code free of axios specifics.
 */
function unwrapServerError(err: unknown, fallback: string): Error {
  if (err instanceof AxiosError) {
    const body = err.response?.data as { error?: unknown } | undefined;
    const serverMessage =
      typeof body?.error === "string" ? body.error : null;
    return new Error(serverMessage ?? err.message ?? fallback);
  }
  if (err instanceof Error) return err;
  return new Error(fallback);
}

type SerializedStaff = Omit<StaffDTO, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

function reviveStaff(raw: SerializedStaff): StaffDTO {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}
