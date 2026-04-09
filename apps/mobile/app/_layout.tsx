import "../global.css";

import { useEffect } from "react";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@/lib/token-cache";
import { queryClient } from "@/lib/query-client";
import { setTokenGetter } from "@/lib/api-client";
import { useColorScheme } from "@/hooks/use-color-scheme";

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!clerkPublishableKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Add it to your .env file."
  );
}

/**
 * Redirects users based on auth state:
 * - Signed in  -> (tabs)
 * - Signed out -> (auth)/sign-in
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!isSignedIn && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    } else if (isSignedIn && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [isSignedIn, isLoaded, segments, router]);

  useEffect(() => {
    if (isLoaded) {
      setTokenGetter(getToken);
    }
  }, [isLoaded, getToken]);

  return <>{children}</>;
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
