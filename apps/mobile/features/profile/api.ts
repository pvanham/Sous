import { AxiosError } from "axios";
import type {
  SkillChangeRequestDTO,
  StaffAddress,
  StaffDTO,
} from "@sous/types";
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
 * Tell the web backend to mirror the caller's Clerk-hosted profile
 * image URL into Mongo. Called after `user.setProfileImage` succeeds
 * on the client; the actual file bytes go to Clerk via the SDK, not
 * through our API.
 *
 * Pass `imageUrl: null` to clear (after the user removes their
 * Clerk avatar). Pass `undefined` (default) to let the server pull
 * the canonical URL straight from Clerk.
 *
 * Returns the URL that ended up in Mongo so the client can
 * optionally cache it (the same URL is exposed by Clerk on
 * `user.imageUrl` after `user.reload()`).
 */
export async function syncProfileImage(
  imageUrl?: string | null,
): Promise<string | null> {
  try {
    const body =
      imageUrl === null ? { imageUrl: null } : undefined;
    const response = await apiClient.post<{ imageUrl: string | null }>(
      "/me/profile-image",
      body,
    );
    return response.data.imageUrl;
  } catch (err) {
    throw unwrapServerError(err, "Could not sync your profile picture.");
  }
}

// ─────────────────────────────────────────────────────────────
// Self-service skills.
//
// Staff propose skill changes from the profile + onboarding; both
// additions and removals require manager approval before they touch
// `Staff.skills`. Backed by the routes under
// `apps/web/src/app/api/me/skills/*` and `/api/me/stations`. All are
// gated server-side by `KitchenConfig.allowStaffToManageOwnSkills`.
// ─────────────────────────────────────────────────────────────

/**
 * Fetch the station catalogue for the caller's location. Drives the
 * "Add skills" chip selector (the client can't derive the full list
 * from existing skills alone).
 */
export async function fetchAvailableStations(): Promise<string[]> {
  const response = await apiClient.get<{ stations: string[] }>(
    "/me/stations",
  );
  return response.data.stations;
}

/**
 * Fetch the caller's own skill change requests. The `pending` ones
 * drive the "pending approval" (add) and "pending removal" chip states.
 */
export async function fetchMySkillRequests(): Promise<
  SkillChangeRequestDTO[]
> {
  const response = await apiClient.get<SerializedSkillChangeRequest[]>(
    "/me/skills/requests",
  );
  return response.data.map(reviveSkillChangeRequest);
}

/**
 * Propose adding a station skill. The skill is not active until a
 * manager approves the returned `pending` request.
 */
export async function proposeMySkill(input: {
  station: string;
  proficiency: number;
}): Promise<SkillChangeRequestDTO> {
  try {
    const response = await apiClient.post<SerializedSkillChangeRequest>(
      "/me/skills/additions",
      input,
    );
    return reviveSkillChangeRequest(response.data);
  } catch (err) {
    throw unwrapServerError(err, "Could not submit the skill.");
  }
}

/**
 * Request removing one of the caller's station skills, with a reason.
 * The skill stays active until a manager approves the removal.
 */
export async function requestSkillRemoval(input: {
  station: string;
  reason: string;
}): Promise<SkillChangeRequestDTO> {
  try {
    const response = await apiClient.post<SerializedSkillChangeRequest>(
      "/me/skills/removals",
      input,
    );
    return reviveSkillChangeRequest(response.data);
  } catch (err) {
    throw unwrapServerError(err, "Could not submit the removal request.");
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

type SerializedStaff = Omit<
  StaffDTO,
  "createdAt" | "updatedAt" | "onboardingCompletedAt"
> & {
  createdAt: string;
  updatedAt: string;
  /**
   * `null` when the staff member hasn't completed onboarding yet;
   * an ISO string once they have. We revive to `Date | null` to
   * keep `StaffDTO` consumers free of wire-format details.
   */
  onboardingCompletedAt: string | null;
};

function reviveStaff(raw: SerializedStaff): StaffDTO {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    onboardingCompletedAt:
      raw.onboardingCompletedAt === null
        ? null
        : new Date(raw.onboardingCompletedAt),
  };
}

type SerializedSkillChangeRequest = Omit<
  SkillChangeRequestDTO,
  "createdAt" | "updatedAt" | "reviewedAt"
> & {
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

function reviveSkillChangeRequest(
  raw: SerializedSkillChangeRequest,
): SkillChangeRequestDTO {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    reviewedAt: raw.reviewedAt === null ? null : new Date(raw.reviewedAt),
  };
}
