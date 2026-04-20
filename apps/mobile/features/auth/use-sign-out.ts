import { useCallback } from "react";
import { useClerk } from "@clerk/clerk-expo";
import { queryClient } from "@/lib/query-client";

/**
 * Returns a `signOut` callback that drops every cached query *before*
 * handing control back to Clerk so the sign-in screen and any
 * subsequent user never observe the previous user's server state.
 *
 * The `AuthGate` effect in `app/_layout.tsx` also clears the cache on
 * any `userId` transition, so this hook is defence in depth: whichever
 * effect fires first, the cache is empty by the time another user's
 * queries mount.
 */
export function useSignOut() {
  const { signOut } = useClerk();
  return useCallback(async () => {
    queryClient.clear();
    await signOut();
  }, [signOut]);
}
