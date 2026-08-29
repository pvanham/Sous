// `react-native-gesture-handler` must be imported for its side effects
// before any other gesture-handler symbols are referenced — see
// https://docs.swmansion.com/react-native-gesture-handler/docs/installation.
// The dedicated `GestureHandlerRootView` import on line 7 intentionally
// follows this side-effect import, so the duplicate-import warning is
// expected here.
// eslint-disable-next-line import/no-duplicates
import "react-native-gesture-handler";
import "../global.css";
import "@/lib/query-focus";

import { useEffect, useRef } from "react";
import { Appearance, View, ActivityIndicator, Linking } from "react-native";
// eslint-disable-next-line import/no-duplicates
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  ClerkProvider,
  ClerkLoaded,
  useAuth,
  useClerk,
} from "@clerk/clerk-expo";
import { tokenCache } from "@/lib/token-cache";
import { queryClient } from "@/lib/query-client";
import { setTokenGetter } from "@/lib/api-client";
import {
  attachNotificationTapHandler,
  registerForPushNotifications,
} from "@/lib/notifications";
import { OfflineBanner } from "@/components/offline-banner";
import { useEffectiveColorScheme } from "@/hooks/use-effective-color-scheme";
import { useSettingsPreferences } from "@/features/settings/preferences-store";
import { fetchMembership } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";
import { useMyStaff } from "@/features/profile/hooks";

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!clerkPublishableKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Add it to your .env file."
  );
}

/**
 * Redirects users based on auth state and verifies they have at least
 * one OrganizationMember row before letting them into (tabs). Users
 * without a membership are signed out and bounced back to sign-in with
 * an explanatory error.
 *
 * Any role (staff, shift_lead, manager, owner) is accepted — managers
 * and owners may also want to view their schedule or submit time-off
 * from the mobile app. Write-side features stay gated server-side.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, userId, getToken } = useAuth();
  const { signOut } = useClerk();
  const segments = useSegments();
  const router = useRouter();
  const setMembership = useAuthStore((s) => s.setMembership);
  const clearMembership = useAuthStore((s) => s.clearMembership);
  const setPendingSignInError = useAuthStore((s) => s.setPendingSignInError);

  useEffect(() => {
    if (isLoaded) {
      setTokenGetter(getToken);
    }
  }, [isLoaded, getToken]);

  // Wire the notification tap handler once. The closure routes the
  // optional `data.url` from each push payload (e.g. `sous://schedule`)
  // through `Linking.openURL`, which Expo Router subscribes to and
  // turns into the right `router.push(...)` call. Cold-launch taps
  // (notification opened the app from a closed state) are handled by
  // the same listener once the app has hydrated.
  useEffect(() => {
    return attachNotificationTapHandler((url) => {
      if (!url) return;
      Linking.openURL(url).catch((error) => {
        console.warn(
          "[mobile.notifications] failed to open deep link:",
          url,
          error instanceof Error ? error.message : String(error),
        );
      });
    });
  }, []);

  // Whenever Clerk's `userId` flips — null → someone, A → B, or
  // someone → null — every cached query in the TanStack store is
  // owned by the *previous* identity. Dropping the cache forces the
  // next render to refetch with the new JWT so User B never sees
  // User A's "My dropped shifts" or week schedule. Scoping the query
  // keys by userId (done per-screen) is the second line of defence
  // against this, but the cache drop is what guarantees it even for
  // keys we may add later and forget to scope.
  const previousUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isLoaded) return;
    const previous = previousUserIdRef.current;
    if (previous !== undefined && previous !== userId) {
      queryClient.clear();
      clearMembership();
    }
    previousUserIdRef.current = userId ?? null;
  }, [isLoaded, userId, clearMembership]);

  const membershipQuery = useQuery({
    queryKey: ["auth", "membership"],
    queryFn: () => fetchMembership(getToken),
    enabled: Boolean(isLoaded && isSignedIn),
    retry: 1,
    // Inherit the global 30s staleTime so a `weekStartsOn` change made
    // on the web propagates within roughly half a minute (or instantly
    // on app foreground via `focusManager` in `lib/query-focus.ts`).
    // Membership rows themselves rarely change; the small extra refetch
    // is acceptable and keeps the schedule screen from holding a stale
    // anchor for up to five minutes after an owner flips the setting.
  });

  // Push registration is identity-scoped, not navigation-scoped:
  // we want to fire it once when a user signs in and re-fire only
  // when the Clerk userId changes (sign-out → sign-in, account
  // switch). Living in its own effect — separate from the redirect
  // effect, which depends on `segments` — means tab switches don't
  // pointlessly re-POST `/api/me/notifications/devices`.
  //
  // Deps are intentionally narrow: we depend on `userId` (the actual
  // identity key) and `membershipQuery.isSuccess` (the gate that
  // says "we have a JWT and a confirmed membership row"). We do
  // *not* depend on `membershipQuery.data` — that object's
  // reference changes on every background refetch (5-minute
  // staleTime + AppState refocus), which would cause spurious
  // re-registrations on long sessions.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    if (!membershipQuery.isSuccess) return;
    void registerForPushNotifications();
  }, [isLoaded, isSignedIn, userId, membershipQuery.isSuccess]);

  // Staff record drives the onboarding gate. We only treat the
  // returned DTO as authoritative once membership has been
  // confirmed, so the query implicitly inherits AuthGate's auth
  // sequencing — `useMyStaff` won't fire until `userId` is set,
  // and a 404 (no Staff row at this location) is surfaced as
  // `data === null`.
  //
  // We deliberately don't filter on `membership.role`: managers
  // and shift leads who also work shifts have a Staff row (the
  // schedule generator counts manager coverage as a hard
  // constraint, so this is a common configuration), and they
  // need to complete the wizard just like a pure staff member.
  // Owners without a Staff row fall through naturally because
  // their `useMyStaff` query resolves to `null`.
  const myStaffQuery = useMyStaff();

  useEffect(() => {
    if (!isLoaded) return;

    // Cast the segment to `string` so we can compare against the
    // new route groups (`(onboarding)`, `invite`). Expo Router's
    // typed segments are codegen-derived and may lag behind the
    // route file system, especially in CI where typegen hasn't
    // been run.
    const topSegment = segments[0] as string | undefined;
    const inAuthGroup = topSegment === "(auth)";
    const inOnboardingGroup = topSegment === "(onboarding)";
    // The /invite route is reachable pre-authentication via a
    // Universal Link. Letting AuthGate redirect from there would
    // turn every invite tap into a sign-in detour and discard the
    // ticket.
    const inInviteRoute = topSegment === "invite";

    if (inInviteRoute) {
      // Hands the screen control over to /invite — no redirects,
      // no clearing of state. Once `signUp.create` activates a
      // session, AuthGate will re-evaluate this effect with
      // `isSignedIn === true` and route into onboarding.
      return;
    }

    if (!isSignedIn) {
      clearMembership();
      if (!inAuthGroup) {
        router.replace("/(auth)/sign-in");
      }
      return;
    }

    if (membershipQuery.isLoading) return;

    if (membershipQuery.isSuccess && membershipQuery.data) {
      setMembership(membershipQuery.data);

      // Onboarding gate. Wait for the Staff query to settle
      // before deciding — flashing `/(tabs)` and then redirecting
      // would tear down half the home-tab queries on mount.
      //
      // The gate fires for *any* user with a Staff row that
      // hasn't been onboarded yet, regardless of `membership.role`.
      // Managers who also work shifts (a supported configuration —
      // the scheduler requires manager-level coverage at all
      // times) have a Staff row and must complete the wizard
      // before reaching the tabs. Owners and pure managers
      // without a Staff row resolve to `myStaffQuery.data ===
      // null` and fall through.
      if (myStaffQuery.isLoading) return;

      const needsOnboarding =
        myStaffQuery.isSuccess &&
        myStaffQuery.data !== null &&
        myStaffQuery.data.onboardingCompletedAt === null;

      if (needsOnboarding) {
        if (!inOnboardingGroup) {
          router.replace("/(onboarding)/welcome" as never);
        }
        return;
      }

      // Users without a Staff row (owners / non-scheduled
      // managers) and already-onboarded users fall through to
      // the tabs. The (onboarding) group is only relevant for the
      // wizard itself — bounce out if we somehow ended up there
      // with onboarding already complete (or no Staff row).
      if (inAuthGroup || inOnboardingGroup) {
        router.replace("/(tabs)");
      }
      return;
    }

    if (membershipQuery.isSuccess && !membershipQuery.data) {
      clearMembership();
      setPendingSignInError(
        "This account isn't linked to a location yet. Please contact your manager.",
      );
      void signOut();
      return;
    }

    if (membershipQuery.isError) {
      clearMembership();
      const detail =
        membershipQuery.error instanceof Error
          ? membershipQuery.error.message
          : null;
      console.warn("[mobile] AuthGate membership error:", detail);
      setPendingSignInError(
        detail
          ? `Couldn't verify your account: ${detail}`
          : "Couldn't verify your account. Please sign in again.",
      );
      void signOut();
    }
  }, [
    isLoaded,
    isSignedIn,
    segments,
    router,
    membershipQuery.isLoading,
    membershipQuery.isSuccess,
    membershipQuery.isError,
    membershipQuery.data,
    membershipQuery.error,
    myStaffQuery.isLoading,
    myStaffQuery.isSuccess,
    myStaffQuery.data,
    setMembership,
    clearMembership,
    setPendingSignInError,
    signOut,
  ]);

  // Whether the post-sign-in destination has been fully resolved AND
  // we're already on it. Mirrors the redirect effect above so the
  // loading overlay stays up until the user is actually on the right
  // route — without this, the moment both queries settle there's a
  // frame where `(tabs)` paints (mounting home queries / empty cards)
  // before the redirect effect runs, which read as a "blank home
  // flash" on a fresh staff login.
  const routingSettled = (() => {
    if (!isLoaded) return false;
    const top = segments[0] as string | undefined;
    // The invite screen owns its own routing pre-authentication.
    if (top === "invite") return true;
    if (!isSignedIn) return true;
    if (membershipQuery.isLoading) return false;
    // Error / no-membership both lead to a forced sign-out; keep the
    // overlay up through that brief transition.
    if (membershipQuery.isError) return false;
    if (membershipQuery.isSuccess && !membershipQuery.data) return false;
    if (membershipQuery.isSuccess && membershipQuery.data) {
      if (myStaffQuery.isLoading) return false;
      const needsOnboarding =
        myStaffQuery.isSuccess &&
        myStaffQuery.data !== null &&
        myStaffQuery.data.onboardingCompletedAt === null;
      if (needsOnboarding) {
        // Settled only once we're inside the wizard group.
        return top === "(onboarding)";
      }
      // Onboarded users (and users with no Staff row) are only
      // bounced out of the auth / onboarding groups. Anywhere else
      // (tabs, settings, profile, announcements) is a legitimate
      // destination and should not be covered by the overlay.
      return top !== "(auth)" && top !== "(onboarding)";
    }
    return false;
  })();

  const showLoadingOverlay = isLoaded && isSignedIn && !routingSettled;

  return (
    <>
      {children}
      {showLoadingOverlay ? (
        // Opaque (not translucent): fully hides whatever group Expo
        // Router mounted underneath while we settle the destination,
        // so the user sees a clean loading screen instead of a
        // half-rendered home tab.
        <View
          pointerEvents="auto"
          className="bg-background"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator size="large" />
        </View>
      ) : null}
    </>
  );
}

export default function RootLayout() {
  // Combine the user's persisted theme override with the device's
  // system setting. `useEffectiveColorScheme` returns `"light"` or
  // `"dark"`; feed it into both React Navigation's ThemeProvider and
  // React Native's Appearance API so the latter keeps NativeWind's
  // `prefers-color-scheme` media query in sync with the choice.
  const themePreference = useSettingsPreferences((s) => s.theme);
  const colorScheme = useEffectiveColorScheme();

  useEffect(() => {
    // react-native-web does not implement `Appearance.setColorScheme`, so
    // guard the call to avoid a hard crash on the web target (used by cloud
    // agents to preview the app). On web, NativeWind's `prefers-color-scheme`
    // media query already tracks the system theme, so skipping is safe.
    if (typeof Appearance.setColorScheme !== "function") {
      return;
    }
    // When the user is on "system", clear any override so the OS
    // signal is authoritative. Otherwise, pin Appearance to the
    // explicit choice — this flips NativeWind's media query
    // immediately without a reload.
    if (themePreference === "system") {
      Appearance.setColorScheme("unspecified");
    } else {
      Appearance.setColorScheme(themePreference);
    }
  }, [themePreference]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ClerkProvider
          tokenCache={tokenCache}
          publishableKey={clerkPublishableKey}
        >
          <ClerkLoaded>
            <QueryClientProvider client={queryClient}>
              <ThemeProvider
                value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
              >
                <AuthGate>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="(onboarding)" />
                    <Stack.Screen name="invite" />
                    <Stack.Screen
                      name="profile"
                      options={{ presentation: "card" }}
                    />
                    <Stack.Screen
                      name="settings"
                      options={{ presentation: "card" }}
                    />
                    <Stack.Screen
                      name="announcements/index"
                      options={{ presentation: "card" }}
                    />
                    <Stack.Screen
                      name="announcements/[id]"
                      options={{ presentation: "card" }}
                    />
                  </Stack>
                </AuthGate>
                {/* Global connectivity banner — rendered above the
                    navigator so it overlays every screen. */}
                <OfflineBanner />
                <StatusBar style="auto" />
              </ThemeProvider>
            </QueryClientProvider>
          </ClerkLoaded>
        </ClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
