import { QueryClient } from "@tanstack/react-query";

/**
 * Shared React Query client with mobile-appropriate defaults.
 *
 * `staleTime` is kept short (30 s) so operational data — schedules,
 * shift-exchange status, time-off decisions — reflects manager-side
 * changes soon after the app foregrounds. Combined with the
 * AppState / NetInfo bridges in `./query-focus.ts`, mounted queries
 * will auto-refetch when the app resumes or when the network comes
 * back online, preventing the "stale until restart" class of bug.
 *
 * `gcTime` stays at 10 minutes so quick tab switches re-render from
 * memory without a network hit. Individual queries can override
 * (e.g. `["auth","membership"]` keeps its own 5-minute staleTime).
 *
 * `refetchOnWindowFocus` / `refetchOnReconnect` are now meaningful
 * on React Native because `query-focus.ts` wires them up to the
 * relevant platform events.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});
