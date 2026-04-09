import { useState, useCallback } from "react";
import { View, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { Button } from "@/components/ui/button";
import { StyledText } from "@/components/ui/text";

export function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignIn = useCallback(async () => {
    if (!isLoaded) return;

    setError(null);
    setLoading(true);

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.replace("/(tabs)");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Sign in failed. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isLoaded, email, password, signIn, setActive, router]);

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-center"
      >
        <View className="items-center mb-10">
          <StyledText variant="title" className="text-primary text-4xl">
            Sous
          </StyledText>
          <StyledText variant="caption" className="mt-2 text-base">
            Kitchen Staff Portal
          </StyledText>
        </View>

        <View className="gap-4">
          <View>
            <StyledText variant="label" className="mb-1.5">
              Email
            </StyledText>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@restaurant.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              className="bg-card text-foreground border border-border rounded-md px-4 py-3 text-base"
              placeholderTextColor="#78716c"
            />
          </View>

          <View>
            <StyledText variant="label" className="mb-1.5">
              Password
            </StyledText>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoComplete="password"
              className="bg-card text-foreground border border-border rounded-md px-4 py-3 text-base"
              placeholderTextColor="#78716c"
            />
          </View>

          {error ? (
            <StyledText variant="caption" className="text-destructive text-sm">
              {error}
            </StyledText>
          ) : null}

          <Button
            title="Sign In"
            onPress={handleSignIn}
            loading={loading}
            disabled={!email || !password}
            size="lg"
            className="mt-2"
          />
        </View>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}
