import { QueryClient } from "@tanstack/react-query";

/**
 * Shared React Query client with sensible mobile defaults.
 * Stale time is kept generous (5 min) because schedule data changes
 * infrequently, and we want to minimize unnecessary background refetches
 * on slow cellular connections.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
