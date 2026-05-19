import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import type { StaffDTO } from "@sous/types";

import { myStaffQueryKey } from "@/features/profile/hooks";
import { completeOnboarding } from "./api";

/**
 * Stamp `Staff.onboardingCompletedAt` once the staff member taps
 * "Get started" on the final wizard step.
 *
 * On success we write the returned DTO straight into the same
 * `useMyStaff` cache key (see `apps/mobile/features/profile/hooks.ts`)
 * so AuthGate re-evaluates immediately and routes into the tabs —
 * no second fetch round-trip required.
 */
export function useCompleteOnboarding() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<StaffDTO, Error, void>({
    mutationFn: completeOnboarding,
    onSuccess: (updated) => {
      queryClient.setQueryData<StaffDTO | null>(
        myStaffQueryKey(userId),
        updated,
      );
    },
  });
}
