import { AppState, type AppStateStatus, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";

/**
 * React Native <-> TanStack Query lifecycle bridge.
 *
 * TanStack Query's default "refetch on window focus" and "refetch on
 * reconnect" behaviours are browser-specific — they listen for DOM
 * `focus` / `online` events that do not exist in React Native. If we
 * leave those signals unwired, the mobile client never learns that
 * the app foregrounded or that the network came back, so queries
 * that went stale while the app was backgrounded (or offline) stay
 * stale until the next remount.
 *
 * That is what caused the "manager cancelled a shift on the web but
 * mobile didn't see it until the dev server restarted" bug: the
 * cache was fresh by `staleTime`, and without AppState / NetInfo
 * signals nothing prompted a refetch on resume.
 *
 * Both listeners run once, as side-effects on import, from the root
 * layout. They are idempotent because they only register with
 * TanStack's managers — the subscribers themselves are long-lived
 * and owned by React Native's singletons.
 */

// ── focusManager ← AppState ─────────────────────────────────
focusManager.setEventListener((handleFocus) => {
  const onChange = (status: AppStateStatus) => {
    // Web's `focus` corresponds to RN's `active`. `background` and
    // `inactive` both mean "not visible" for our purposes.
    if (Platform.OS !== "web") {
      handleFocus(status === "active");
    }
  };
  const subscription = AppState.addEventListener("change", onChange);
  return () => subscription.remove();
});

// ── onlineManager ← NetInfo ─────────────────────────────────
// `isInternetReachable` can be `null` on iOS during initial probes;
// treat that as "assume online" so we don't suppress the first
// request. We only flip to offline when we have a definitive `false`.
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    const reachable = state.isInternetReachable !== false;
    setOnline(Boolean(state.isConnected) && reachable);
  });
});
