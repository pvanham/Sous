import { useCallback } from "react";
import { useClerk } from "@clerk/clerk-expo";
import { queryClient } from "@/lib/query-client";
import { unregisterDeviceForCurrentUser } from "@/lib/notifications";

/**
 * Returns a `signOut` callback that drops every cached query *before*
 * handing control back to Clerk so the sign-in screen and any
 * subsequent user never observe the previous user's server state.
 *
 * Push de-registration happens here, *before* Clerk drops the JWT,
 * because the revoke endpoint authenticates with the same Clerk
 * session — once `signOut()` has run we no longer have credentials
 * to soft-delete the token. We swallow any error from the revoke
 * step so a network blip can't strand the user signed in.
 *
 * The `AuthGate` effect in `app/_layout.tsx` also clears the cache on
 * any `userId` transition, so cache clearing here is defence in depth:
 * whichever effect fires first, the cache is empty by the time another
 * user's queries mount.
 */
export function useSignOut() {
  const { signOut } = useClerk();
  return useCallback(async () => {
    await unregisterDeviceForCurrentUser();
    queryClient.clear();
    await signOut();
  }, [signOut]);
}
