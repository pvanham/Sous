import "../global.css";

import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
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
import { useColorScheme } from "@/hooks/use-color-scheme";
import { fetchMembership } from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";

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
  const { isSignedIn, isLoaded, getToken } = useAuth();
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

  const membershipQuery = useQuery({
    queryKey: ["auth", "membership"],
    queryFn: () => fetchMembership(getToken),
    enabled: Boolean(isLoaded && isSignedIn),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === "(auth)";

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
      if (inAuthGroup) {
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
    setMembership,
    clearMembership,
    setPendingSignInError,
    signOut,
  ]);

  const showMembershipSpinner =
    isLoaded && isSignedIn && membershipQuery.isLoading;

  return (
    <>
      {children}
      {showMembershipSpinner ? (
        <View
          pointerEvents="auto"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.25)",
          }}
        >
          <ActivityIndicator size="large" />
        </View>
      ) : null}
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={clerkPublishableKey}>
      <ClerkLoaded>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider
            value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
          >
            <AuthGate>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
              </Stack>
            </AuthGate>
            <StatusBar style="auto" />
          </ThemeProvider>
        </QueryClientProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
