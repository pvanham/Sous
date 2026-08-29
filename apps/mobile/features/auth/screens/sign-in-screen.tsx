import { useState, useCallback, useEffect } from "react";
import {
  View,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { AppTextInput } from "@/components/ui/text-input";
import { useSignIn, isClerkAPIResponseError } from "@clerk/clerk-expo";
import type { EmailCodeFactor, SignInResource } from "@clerk/types";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as WebBrowser from "expo-web-browser";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { Button } from "@/components/ui/button";
import { StyledText } from "@/components/ui/text";
import { useAuthStore } from "@/features/auth/store";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "@/lib/legal";

const PLACEHOLDER_COLOR = "#a8a29e";
const ICON_COLOR = "#78716c";

type Step = "credentials" | "second-factor";

export function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const consumePendingSignInError = useAuthStore(
    (s) => s.consumePendingSignInError,
  );

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const pending = consumePendingSignInError();
    if (pending) setError(pending);
  }, [consumePendingSignInError]);

  const extractClerkError = useCallback(
    (err: unknown, fallback: string): string => {
      if (__DEV__) {
        console.log("[SignIn] error", err);
      }
      if (isClerkAPIResponseError(err)) {
        const first = err.errors?.[0];
        return first?.longMessage ?? first?.message ?? fallback;
      }
      if (err instanceof Error) return err.message;
      return fallback;
    },
    [],
  );

  const finishIfComplete = useCallback(
    async (result: SignInResource): Promise<boolean> => {
      if (
        result.status === "complete" &&
        result.createdSessionId &&
        setActive
      ) {
        // Activate the session only — don't navigate. AuthGate sees
        // the new session, waits for the membership + Staff queries,
        // and routes to `(tabs)` or `(onboarding)` once it knows
        // where the user belongs. Pushing `/(tabs)` here raced that
        // decision and briefly flashed the home tab before bouncing a
        // new staff member into onboarding.
        await setActive({ session: result.createdSessionId });
        return true;
      }
      return false;
    },
    [setActive],
  );

  const handleSignIn = useCallback(async () => {
    if (!isLoaded || !signIn || loading) return;

    setError(null);
    setLoading(true);

    try {
      let result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (await finishIfComplete(result)) return;

      if (result.status === "needs_first_factor") {
        result = await signIn.attemptFirstFactor({
          strategy: "password",
          password,
        });
        if (await finishIfComplete(result)) return;
      }

      if (result.status === "needs_second_factor") {
        const emailCodeFactor = result.supportedSecondFactors?.find(
          (factor): factor is EmailCodeFactor =>
            factor.strategy === "email_code",
        );
        if (!emailCodeFactor) {
          setError(
            "Two-factor authentication is required, but no supported method is configured for this account.",
          );
          return;
        }
        await signIn.prepareSecondFactor({
          strategy: "email_code",
          emailAddressId: emailCodeFactor.emailAddressId,
        });
        setCode("");
        setStep("second-factor");
        return;
      }

      setError(
        "Unable to complete sign-in. Please try again or contact your manager.",
      );
    } catch (err: unknown) {
      setError(
        extractClerkError(
          err,
          "Sign in failed. Please check your credentials and try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [
    isLoaded,
    loading,
    email,
    password,
    signIn,
    finishIfComplete,
    extractClerkError,
  ]);

  const handleVerifyCode = useCallback(async () => {
    if (!isLoaded || !signIn || loading) return;

    setError(null);
    setLoading(true);

    try {
      const result = await signIn.attemptSecondFactor({
        strategy: "email_code",
        code,
      });
      if (await finishIfComplete(result)) return;

      setError("Verification was not complete. Please try again.");
    } catch (err: unknown) {
      setError(extractClerkError(err, "Invalid verification code."));
    } finally {
      setLoading(false);
    }
  }, [isLoaded, loading, signIn, code, finishIfComplete, extractClerkError]);

  const toggleShowPassword = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  const backToCredentials = useCallback(() => {
    setStep("credentials");
    setCode("");
    setError(null);
  }, []);

  const goToForgotPassword = useCallback(() => {
    router.push("/(auth)/forgot-password");
  }, [router]);

  const openLegalUrl = useCallback((url: string) => {
    void WebBrowser.openBrowserAsync(url).catch(() => {
      /* best-effort: the in-app browser may be unavailable */
    });
  }, []);

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-center"
      >
        <View className="items-center mb-8">
          <View className="w-16 h-16 rounded-2xl bg-primary items-center justify-center mb-4 shadow-sm">
            <MaterialIcons name="restaurant-menu" size={32} color="#fefce8" />
          </View>
          <StyledText variant="title" className="text-primary text-4xl">
            Sous
          </StyledText>
          <StyledText variant="caption" className="mt-1.5 text-sm">
            Kitchen Staff Portal
          </StyledText>
        </View>

        {step === "credentials" ? (
          <View className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <StyledText variant="subtitle" className="mb-1">
              Welcome back
            </StyledText>
            <StyledText variant="caption" className="mb-5 text-sm">
              Sign in to view your schedule and shifts.
            </StyledText>

            <View className="gap-4">
              <View>
                <StyledText variant="label" className="mb-1.5">
                  Email
                </StyledText>
                <AppTextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@restaurant.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  className="bg-background text-foreground border border-border rounded-md px-4 py-3 text-base"
                  placeholderTextColor={PLACEHOLDER_COLOR}
                />
              </View>

              <View>
                <View className="flex-row justify-between items-baseline mb-1.5">
                  <StyledText variant="label">Password</StyledText>
                  <Pressable
                    onPress={goToForgotPassword}
                    hitSlop={6}
                    className="active:opacity-60"
                  >
                    <StyledText
                      variant="caption"
                      className="text-primary text-xs"
                    >
                      Forgot password?
                    </StyledText>
                  </Pressable>
                </View>
                <View className="flex-row items-center bg-background border border-border rounded-md pr-1">
                  <AppTextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="password"
                    textContentType="password"
                    returnKeyType="done"
                    onSubmitEditing={handleSignIn}
                    className="flex-1 text-foreground px-4 py-3 text-base"
                    placeholderTextColor={PLACEHOLDER_COLOR}
                  />
                  <Pressable
                    onPress={toggleShowPassword}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="w-11 h-11 items-center justify-center active:opacity-60"
                  >
                    <MaterialIcons
                      name={showPassword ? "visibility-off" : "visibility"}
                      size={22}
                      color={ICON_COLOR}
                    />
                  </Pressable>
                </View>
              </View>

              {error ? (
                <View className="border border-destructive rounded-md px-3 py-2">
                  <StyledText
                    variant="caption"
                    className="text-destructive text-sm"
                  >
                    {error}
                  </StyledText>
                </View>
              ) : null}

              <Button
                title="Sign In"
                onPress={handleSignIn}
                loading={loading}
                disabled={!email || !password || loading}
                size="lg"
                className="mt-2"
              />
            </View>
          </View>
        ) : (
          <View className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <StyledText variant="subtitle" className="mb-1">
              Verify your identity
            </StyledText>
            <StyledText variant="caption" className="mb-5 text-sm">
              We sent a verification code to {email}.
            </StyledText>

            <View className="gap-4">
              <View>
                <StyledText variant="label" className="mb-1.5">
                  Verification code
                </StyledText>
                <AppTextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="123456"
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={handleVerifyCode}
                  className="bg-background text-foreground border border-border rounded-md px-4 py-3 text-base tracking-widest"
                  placeholderTextColor={PLACEHOLDER_COLOR}
                />
              </View>

              {error ? (
                <View className="border border-destructive rounded-md px-3 py-2">
                  <StyledText
                    variant="caption"
                    className="text-destructive text-sm"
                  >
                    {error}
                  </StyledText>
                </View>
              ) : null}

              <Button
                title="Verify"
                onPress={handleVerifyCode}
                loading={loading}
                disabled={code.length < 6 || loading}
                size="lg"
                className="mt-2"
              />

              <Pressable
                onPress={backToCredentials}
                hitSlop={8}
                className="items-center py-2 active:opacity-60"
              >
                <StyledText
                  variant="caption"
                  className="text-muted-foreground text-sm"
                >
                  Back to sign in
                </StyledText>
              </Pressable>
            </View>
          </View>
        )}

        <StyledText
          variant="caption"
          className="text-muted-foreground text-center text-sm mt-6 px-4"
        >
          New staff member? Check your email for an invitation link to create
          your account.
        </StyledText>

        <View className="flex-row items-center justify-center gap-2 mt-4">
          <Pressable
            onPress={() => openLegalUrl(PRIVACY_POLICY_URL)}
            hitSlop={6}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
            className="active:opacity-60"
          >
            <StyledText variant="caption" className="text-muted-foreground text-xs">
              Privacy Policy
            </StyledText>
          </Pressable>
          <StyledText variant="caption" className="text-muted-foreground text-xs">
            &middot;
          </StyledText>
          <Pressable
            onPress={() => openLegalUrl(TERMS_OF_SERVICE_URL)}
            hitSlop={6}
            accessibilityRole="link"
            accessibilityLabel="Terms of Service"
            className="active:opacity-60"
          >
            <StyledText variant="caption" className="text-muted-foreground text-xs">
              Terms of Service
            </StyledText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}
