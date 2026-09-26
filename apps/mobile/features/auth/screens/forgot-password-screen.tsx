import { useState, useCallback } from "react";
import {
  View,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { AppTextInput } from "@/components/ui/text-input";
import { useSignIn, isClerkAPIResponseError } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { Button } from "@/components/ui/button";
import { StyledText } from "@/components/ui/text";

const PLACEHOLDER_COLOR = "#a8a29e";
const ICON_COLOR = "#78716c";

type Step = "enter-email" | "enter-code" | "set-password";

export function ForgotPasswordScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();

  const [step, setStep] = useState<Step>("enter-email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const extractClerkError = useCallback(
    (err: unknown, fallback: string): string => {
      if (__DEV__) {
        console.log("[ForgotPassword] error", err);
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

  const handleSendCode = useCallback(async () => {
    if (!isLoaded || !signIn || loading) return;

    setError(null);
    setLoading(true);

    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
      setCode("");
      setStep("enter-code");
    } catch (err: unknown) {
      setError(
        extractClerkError(
          err,
          "Could not send reset code. Please check your email address.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [isLoaded, signIn, loading, email, extractClerkError]);

  const handleVerifyCode = useCallback(async () => {
    if (!isLoaded || !signIn || loading) return;

    setError(null);
    setLoading(true);

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
      });
      if (result.status === "needs_new_password") {
        setNewPassword("");
        setStep("set-password");
      } else {
        setError("Unexpected state. Please try again.");
      }
    } catch (err: unknown) {
      setError(extractClerkError(err, "Invalid code."));
    } finally {
      setLoading(false);
    }
  }, [isLoaded, signIn, loading, code, extractClerkError]);

  const handleResetPassword = useCallback(async () => {
    if (!isLoaded || !signIn || loading) return;

    setError(null);
    setLoading(true);

    try {
      const result = await signIn.resetPassword({ password: newPassword });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.replace("/(tabs)");
        return;
      }
      setError("Unable to reset password. Please try again.");
    } catch (err: unknown) {
      setError(extractClerkError(err, "Password reset failed."));
    } finally {
      setLoading(false);
    }
  }, [isLoaded, signIn, loading, newPassword, setActive, router, extractClerkError]);

  const toggleShowPassword = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  const backToSignIn = useCallback(() => {
    router.back();
  }, [router]);

  const renderHeader = (title: string, subtitle: string) => (
    <>
      <StyledText variant="subtitle" className="mb-1">
        {title}
      </StyledText>
      <StyledText variant="caption" className="mb-5 text-sm">
        {subtitle}
      </StyledText>
    </>
  );

  const renderError = () =>
    error ? (
      <View className="border border-destructive rounded-md px-3 py-2">
        <StyledText variant="caption" className="text-destructive text-sm">
          {error}
        </StyledText>
      </View>
    ) : null;

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-center"
      >
        <View className="items-center mb-8">
          <View className="w-16 h-16 rounded-2xl bg-primary items-center justify-center mb-4 shadow-sm">
            <MaterialIcons name="lock-reset" size={32} color="#fefce8" />
          </View>
          <StyledText variant="title" className="text-primary text-4xl">
            Sous
          </StyledText>
          <StyledText variant="caption" className="mt-1.5 text-sm">
            Reset your password
          </StyledText>
        </View>

        <View className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          {step === "enter-email" ? (
            <>
              {renderHeader(
                "Forgot password",
                "Enter your email and we'll send you a reset code.",
              )}
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
                    returnKeyType="done"
                    onSubmitEditing={handleSendCode}
                    className="bg-background text-foreground border border-border rounded-md px-4 py-3 text-base"
                    placeholderTextColor={PLACEHOLDER_COLOR}
                  />
                </View>
                {renderError()}
                <Button
                  title="Send Reset Code"
                  onPress={handleSendCode}
                  loading={loading}
                  disabled={!email || loading}
                  size="lg"
                  className="mt-2"
                />
              </View>
            </>
          ) : null}

          {step === "enter-code" ? (
            <>
              {renderHeader("Check your email", `We sent a reset code to ${email}.`)}
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
                {renderError()}
                <Button
                  title="Verify Code"
                  onPress={handleVerifyCode}
                  loading={loading}
                  disabled={code.length < 6 || loading}
                  size="lg"
                  className="mt-2"
                />
              </View>
            </>
          ) : null}

          {step === "set-password" ? (
            <>
              {renderHeader(
                "Set a new password",
                "Choose a strong password for your account.",
              )}
              <View className="gap-4">
                <View>
                  <StyledText variant="label" className="mb-1.5">
                    New password
                  </StyledText>
                  <View className="flex-row items-center bg-background border border-border rounded-md pr-1">
                    <AppTextInput
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="Enter a new password"
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="password-new"
                      textContentType="newPassword"
                      returnKeyType="done"
                      onSubmitEditing={handleResetPassword}
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
                {renderError()}
                <Button
                  title="Reset Password"
                  onPress={handleResetPassword}
                  loading={loading}
                  disabled={!newPassword || loading}
                  size="lg"
                  className="mt-2"
                />
              </View>
            </>
          ) : null}

          <Pressable
            onPress={backToSignIn}
            hitSlop={8}
            className="flex-row items-center justify-center py-3 mt-2 active:opacity-60"
          >
            <MaterialIcons name="arrow-back" size={16} color={ICON_COLOR} />
            <StyledText
              variant="caption"
              className="text-muted-foreground text-sm ml-1"
            >
              Back to sign in
            </StyledText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}
