import { AxiosError } from "axios";
import type {
  StaffAvailabilityDTO,
  AvailabilityPreference,
} from "@sous/types";
import { apiClient } from "@/lib/api-client";

// ─────────────────────────────────────────────────────────────
// Settings feature — server-state access layer.
//
// Responsibilities
//   - Load / save the caller's weekly availability (GET/PUT /me/availability).
//   - Save self-editable hours and station preferences via the
//     existing /me/staff PATCH route (reuses `updateMyStaff` from the
//     profile feature — we only add the extended fields here).
//   - Delete the caller's own Clerk account (DELETE /me/account).
//
// Backend contracts live in:
//   - apps/web/src/app/api/me/availability/route.ts
//   - apps/web/src/app/api/me/staff/route.ts
//   - apps/web/src/app/api/me/account/route.ts
//
// Dates on availability rows arrive as ISO strings; we revive them to
// `Date` instances here so UI code can treat them like every other
// DTO, matching the convention already used by the profile feature.
// ─────────────────────────────────────────────────────────────

export interface WeeklyAvailabilityEntry {
  dayOfWeek: number;
  availableFrom: string | null;
  availableTo: string | null;
  preference: AvailabilityPreference;
  notes?: string;
}

type SerializedAvailability = Omit<
  StaffAvailabilityDTO,
  "createdAt" | "updatedAt"
> & {
  createdAt: string;
  updatedAt: string;
};

function reviveAvailability(raw: SerializedAvailability): StaffAvailabilityDTO {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}

/**
 * Fetch the caller's weekly availability. Returns `[]` when the
 * caller has no staff row at this location (e.g. a manager / owner
 * who logs into the mobile app to browse).
 */
export async function fetchMyAvailability(): Promise<StaffAvailabilityDTO[]> {
  const response =
    await apiClient.get<SerializedAvailability[]>("/me/availability");
  return response.data.map(reviveAvailability);
}

/**
 * Replace the caller's weekly availability in a single round-trip.
 * The server deletes the old rows and inserts the new ones, so the
 * `availabilities` array must be the complete weekly set.
 */
export async function saveMyAvailability(
  availabilities: WeeklyAvailabilityEntry[],
): Promise<StaffAvailabilityDTO[]> {
  try {
    const response = await apiClient.put<SerializedAvailability[]>(
      "/me/availability",
      { availabilities },
    );
    return response.data.map(reviveAvailability);
  } catch (err) {
    throw unwrapServerError(err, "Could not save your availability.");
  }
}

/**
 * DELETE the caller's own Clerk account. The Clerk `user.deleted`
 * webhook handles app-side cleanup (staff unlink, membership
 * deletion, org cascade for owners) so the mobile client only needs
 * to block on this single network call before signing out.
 */
export async function deleteMyAccount(): Promise<void> {
  try {
    await apiClient.delete("/me/account");
  } catch (err) {
    throw unwrapServerError(err, "Could not delete your account.");
  }
}

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
