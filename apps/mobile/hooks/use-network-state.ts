import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

/**
 * Subscribes to device connectivity and reports whether the app is
 * currently offline.
 *
 * Mirrors the reachability logic already used by the TanStack Query
 * `onlineManager` bridge in `lib/query-focus.ts`: `isInternetReachable`
 * can be `null` while iOS runs its initial probe, so we only treat the
 * device as offline once we have a definitive negative signal
 * (`isConnected === false` or `isInternetReachable === false`). This
 * avoids a false "No Internet Connection" flash on a cold launch.
 */
export function useIsOffline(): boolean {
  // Assume online until NetInfo tells us otherwise, so the banner never
  // flashes on startup before the first connectivity event arrives.
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const reachable = state.isInternetReachable !== false;
      const online = Boolean(state.isConnected) && reachable;
      setIsOffline(!online);
    });

    return unsubscribe;
  }, []);

  return isOffline;
}
