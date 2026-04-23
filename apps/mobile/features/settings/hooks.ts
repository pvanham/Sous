import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import type { StaffAvailabilityDTO } from "@sous/types";
import {
  fetchMyAvailability,
  saveMyAvailability,
  type WeeklyAvailabilityEntry,
} from "./api";

/**
 * Cache key for the caller's own weekly availability. Scoped by the
 * Clerk user id so that switching accounts in dev never leaks the
 * previous user's rows into the current session.
 */
export function myAvailabilityQueryKey(userId: string | null | undefined) {
  return ["settings", userId ?? "anonymous", "availability"] as const;
}

/**
 * Load the caller's weekly availability. Mirrors the `useMyStaff`
 * pattern in the profile feature — returns `[]` when the staff row
 * is missing (managers / owners), so the UI can still render the
 * "no availability yet" empty state.
 */
export function useMyAvailability() {
  const { userId } = useAuth();
  return useQuery<StaffAvailabilityDTO[]>({
    queryKey: myAvailabilityQueryKey(userId),
    queryFn: fetchMyAvailability,
    enabled: Boolean(userId),
  });
}

/**
 * Replace the caller's weekly availability. Writes the returned rows
 * back into the cache on success so the settings screen re-renders
 * without a round-trip.
 */
export function useSaveMyAvailability() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<StaffAvailabilityDTO[], Error, WeeklyAvailabilityEntry[]>(
    {
      mutationFn: saveMyAvailability,
      onSuccess: (rows) => {
        queryClient.setQueryData<StaffAvailabilityDTO[]>(
          myAvailabilityQueryKey(userId),
          rows,
        );
      },
    },
  );
}
