import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  NotificationPreferencesDTO,
  UpdateNotificationPreferencesInput,
} from "@sous/types";

import {
  fetchNotificationPreferences,
  patchNotificationPreferences,
} from "./api";

const PREFERENCES_QUERY_KEY = ["notifications", "preferences"] as const;

/**
 * Cached read of the signed-in user's notification preferences.
 *
 * The web API lazily seeds defaults the first time we read, so the
 * caller never has to handle a "not yet created" state. We use a
 * 5-minute stale time because preferences change rarely and the
 * mobile screen always has a manual refetch fallback (pull-to-refresh
 * or screen re-mount).
 */
export function useNotificationPreferencesQuery() {
  return useQuery<NotificationPreferencesDTO>({
    queryKey: PREFERENCES_QUERY_KEY,
    queryFn: fetchNotificationPreferences,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Optimistically applies a partial patch to the cached preferences,
 * sends the same patch to the server, and rolls back if the request
 * fails.
 *
 * Optimism is essential here: every toggle on the settings screen
 * triggers one of these mutations, and the user expects the switch
 * to flip immediately. If we waited for the round-trip the UI would
 * feel laggy on cellular and the switch would visibly bounce on
 * failure regardless. With this pattern, a network error simply
 * snaps back to the server's last-known good state.
 */
export function useUpdateNotificationPreferencesMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    NotificationPreferencesDTO,
    Error,
    UpdateNotificationPreferencesInput,
    { previous: NotificationPreferencesDTO | undefined }
  >({
    mutationFn: patchNotificationPreferences,
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: PREFERENCES_QUERY_KEY });
      const previous = queryClient.getQueryData<NotificationPreferencesDTO>(
        PREFERENCES_QUERY_KEY,
      );
      if (previous) {
        queryClient.setQueryData<NotificationPreferencesDTO>(
          PREFERENCES_QUERY_KEY,
          mergePreferencesPatch(previous, patch),
        );
      }
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PREFERENCES_QUERY_KEY, context.previous);
      }
    },
    onSuccess: (canonical) => {
      // The server returns the post-merge document; replace the
      // optimistic snapshot with the authoritative shape so any
      // server-side normalisation (e.g. timezone validation) is
      // reflected immediately.
      queryClient.setQueryData(PREFERENCES_QUERY_KEY, canonical);
    },
  });
}

/**
 * Apply the same shallow / per-key merge the server performs in
 * `NotificationPreferenceService.update`, so the optimistic update
 * matches the response we're about to receive.
 *
 * Keeping this in TS rather than re-using a shared utility avoids a
 * Mongoose import cycle and keeps the mobile bundle slim.
 */
function mergePreferencesPatch(
  current: NotificationPreferencesDTO,
  patch: UpdateNotificationPreferencesInput,
): NotificationPreferencesDTO {
  const next: NotificationPreferencesDTO = {
    ...current,
    channels: { ...current.channels },
    categories: { ...current.categories },
    quietHours:
      current.quietHours === null ? null : { ...current.quietHours },
  };

  if (patch.channels) {
    next.channels = {
      push: patch.channels.push ?? next.channels.push,
      email: patch.channels.email ?? next.channels.email,
    };
  }

  if (patch.categories) {
    for (const [rawCategory, override] of Object.entries(patch.categories)) {
      if (!override) continue;
      const category = rawCategory as keyof NotificationPreferencesDTO["categories"];
      const previous = next.categories[category] ?? { push: true, email: true };
      next.categories[category] = {
        push: override.push ?? previous.push,
        email: override.email ?? previous.email,
      };
    }
  }

  if (patch.quietHours !== undefined) {
    next.quietHours = patch.quietHours;
  }

  return next;
}
