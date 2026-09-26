import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import type { SkillChangeRequestDTO, StaffDTO } from "@sous/types";
import { AxiosError } from "axios";
import {
  fetchMyStaff,
  fetchAvailableStations,
  fetchMySkillRequests,
  proposeMySkill,
  requestSkillRemoval,
  updateMyStaff,
  type UpdateMyStaffInput,
} from "./api";

/**
 * Cache key for the caller's StaffDTO. Scoped by Clerk user id so
 * switching accounts (hot-reload dev flows, account switcher in
 * Clerk's manager UI) doesn't leak the previous profile.
 */
export function myStaffQueryKey(userId: string | null | undefined) {
  return ["profile", userId ?? "anonymous", "staff"] as const;
}

/**
 * Load the caller's own Staff record. Returns `data: null` when the
 * backend responds 404 (typical for managers / owners with no staff
 * row at the active location); the profile screen uses this to hide
 * the editable sections and fall back to name/email from Clerk.
 */
export function useMyStaff() {
  const { userId } = useAuth();
  return useQuery<StaffDTO | null>({
    queryKey: myStaffQueryKey(userId),
    queryFn: async () => {
      try {
        return await fetchMyStaff();
      } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: Boolean(userId),
  });
}

/**
 * Mutation wrapper around `PATCH /me/staff`. Writes back the updated
 * record into the `["profile", userId, "staff"]` cache on success so
 * the view layer reflects the change without a round-trip.
 */
export function useUpdateMyStaff() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<StaffDTO, Error, UpdateMyStaffInput>({
    mutationFn: updateMyStaff,
    onSuccess: (updated) => {
      queryClient.setQueryData<StaffDTO | null>(
        myStaffQueryKey(userId),
        updated,
      );
    },
  });
}

/** Cache key for the station catalogue at the caller's location. */
export function availableStationsQueryKey(userId: string | null | undefined) {
  return ["profile", userId ?? "anonymous", "stations"] as const;
}

/** Cache key for the caller's own skill change requests. */
export function mySkillRequestsQueryKey(userId: string | null | undefined) {
  return ["profile", userId ?? "anonymous", "skill-requests"] as const;
}

/**
 * Load the station catalogue for the active location. Used by the
 * "Add skills" chip selector.
 */
export function useAvailableStations() {
  const { userId } = useAuth();
  return useQuery<string[]>({
    queryKey: availableStationsQueryKey(userId),
    queryFn: fetchAvailableStations,
    enabled: Boolean(userId),
  });
}

/**
 * Load the caller's own skill change requests. The view layer filters
 * the `pending` ones to render the pending-add / pending-removal chip
 * states.
 */
export function useMySkillRequests() {
  const { userId } = useAuth();
  return useQuery<SkillChangeRequestDTO[]>({
    queryKey: mySkillRequestsQueryKey(userId),
    queryFn: fetchMySkillRequests,
    enabled: Boolean(userId),
  });
}

/**
 * Propose a skill addition. Invalidates the requests cache so the new
 * "pending approval" chip appears.
 */
export function useProposeMySkill() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<
    SkillChangeRequestDTO,
    Error,
    { station: string; proficiency: number }
  >({
    mutationFn: proposeMySkill,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: mySkillRequestsQueryKey(userId),
      });
    },
  });
}

/**
 * Request a skill removal. Invalidates the requests cache so the
 * "pending removal" chip state appears.
 */
export function useRequestSkillRemoval() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<
    SkillChangeRequestDTO,
    Error,
    { station: string; reason: string }
  >({
    mutationFn: requestSkillRemoval,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: mySkillRequestsQueryKey(userId),
      });
    },
  });
}
