import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
} from "react-native";
import { AppTextInput } from "@/components/ui/text-input";
import { useSignUp, isClerkAPIResponseError } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { Button } from "@/components/ui/button";
import { StyledText } from "@/components/ui/text";

const PLACEHOLDER_COLOR = "#a8a29e";
const ICON_COLOR = "#78716c";

interface AcceptInviteScreenProps {
  /**
   * The single-use ticket Clerk appended to the invite URL
   * (`__clerk_ticket` query parameter). Passed in by the host route
   * `app/invite.tsx` after extracting it from
   * `useLocalSearchParams`. When missing, the screen renders a
   * friendly error rather than calling `signUp.create` with a
   * blank ticket — Clerk would just reject it with an opaque
   * error message.
   */
  ticket: string | null;
}

interface PasswordStrength {
  score: number;
  label: string;
  className: string;
}

function getPasswordStrength(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: "", className: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  if (score <= 1) return { score: 1, label: "Weak", className: "text-destructive" };
  if (score <= 2) return { score: 2, label: "Fair", className: "text-amber-500" };
  if (score <= 3) return { score: 3, label: "Good", className: "text-yellow-600" };
  return { score: 4, label: "Strong", className: "text-emerald-600" };
}

/**
 * Mobile-native invitation acceptance.
 *
 * The user reaches this screen by tapping an invite link in their
 * email — a Universal Link configured in `app.json` against the
 * `/invite` path on the web origin. The host route
 * `app/invite.tsx` reads `__clerk_ticket` from the URL and forwards
 * it here as the `ticket` prop.
 *
 * Flow
 *   1. Clerk's `signUp.create({ strategy: "ticket", ticket, … })`
 *      consumes the ticket. Clerk validates the invite email
 *      server-side, so no separate verification step is needed.
 *   2. On `status === "complete"` we activate the session via
 *      `setActive`. The `AuthGate` in `app/_layout.tsx` then takes
 *      over: it fetches `OrganizationMember` (the Clerk webhook
 *      provisioned it during `user.created`) and routes the user
 *      into the onboarding wizard.
 *
 * Resume logic — Clerk keeps a SignUp resource alive after any
 * partial failure (e.g. password rejected for being too common).
 * Calling `signUp.create` against the in-flight resource is
 * rejected as "session already exists"; the documented workaround
 * is to drive it forward via `signUp.update` until it reaches
 * `complete`. The same pattern is used by the web counterpart at
 * `apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx`.
 */
export function AcceptInviteScreen({ ticket }: AcceptInviteScreenProps) {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Clerk pre-populates the invited email onto the SignUp resource
  // once `signUp.create` (or our equivalent ticket exchange) has
  // resolved. Reading from there lets us show the user *which*
  // email they're claiming, so a re-forwarded invite doesn't catch
  // them by surprise. Until the resource carries a value we leave
  // the slot blank.
  const invitedEmail = useMemo(() => signUp?.emailAddress ?? null, [signUp]);

  // The web sign-up page calls `setEmail` on its resource once
  // `signUp.create` succeeds — but since we never call it directly
  // (we use ticket strategy on submit), the email field stays
  // empty here until the user submits. We surface that gracefully
  // below.
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const extractClerkError = useCallback(
    (err: unknown, fallback: string): string => {
      if (__DEV__) {
        console.log("[AcceptInvite] error", err);
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
    async (createdSessionId: string | null): Promise<boolean> => {
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        // No `router.push` here — AuthGate sees the new session and
        // routes the user into onboarding (or tabs, if they already
        // finished). Pushing manually would race AuthGate's
        // membership query and cause a redirect loop.
        return true;
      }
      return false;
    },
    [setActive],
  );

  const handleSubmit = useCallback(async () => {
    if (!isLoaded || !signUp || loading) return;
    if (!ticket) {
      setError("Missing invitation ticket. Please re-open the link from your email.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const hasInProgressSignUp =
        Boolean(signUp.id) && signUp.status !== "complete";

      const result = hasInProgressSignUp
        ? await signUp.update({ firstName, lastName, password })
        : await signUp.create({
            strategy: "ticket",
            ticket,
            firstName,
            lastName,
            password,
          });

      if (result.status === "complete") {
        if (await finishIfComplete(result.createdSessionId)) return;
      }

      setError(
        `Sign-up needs more information (${result.status ?? "unknown"}). Please contact your manager.`,
      );
    } catch (err: unknown) {
      setError(
        extractClerkError(
          err,
          "Could not accept your invitation. Please try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [
    isLoaded,
    signUp,
    loading,
    ticket,
    password,
    confirmPassword,
    firstName,
    lastName,
    finishIfComplete,
    extractClerkError,
  ]);

  const toggleShowPassword = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  const goToSignIn = useCallback(() => {
    router.replace("/(auth)/sign-in");
  }, [router]);

  // Hard error: no ticket at all. We intentionally do not auto-
  // forward to /sign-in — the user reached this screen by tapping
  // an invite link, so showing the cause of the failure is more
  // helpful than silently bouncing them.
  useEffect(() => {
    if (!ticket) {
      setError("Missing invitation ticket. Please re-open the link from your email.");
    }
  }, [ticket]);

  const canSubmit =
    Boolean(ticket) &&
    Boolean(firstName.trim()) &&
    Boolean(lastName.trim()) &&
    password.length >= 8 &&
    password === confirmPassword &&
    !loading;

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView contentContainerClassName="flex-grow justify-center">
          <View className="items-center mb-8">
            <View className="w-16 h-16 rounded-2xl bg-primary items-center justify-center mb-4 shadow-sm">
              <MaterialIcons name="restaurant-menu" size={32} color="#fefce8" />
            </View>
            <StyledText variant="title" className="text-primary text-4xl">
              Sous
            </StyledText>
            <StyledText variant="caption" className="mt-1.5 text-sm">
              Accept your invitation
            </StyledText>
          </View>

          <View className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <StyledText variant="subtitle" className="mb-1">
              Finish setting up your account
            </StyledText>
            <StyledText variant="caption" className="mb-5 text-sm">
              {invitedEmail
                ? `Invitation for ${invitedEmail}.`
                : "Set your name and a password to join your team."}
            </StyledText>

            <View className="gap-4">
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <StyledText variant="label" className="mb-1.5">
                    First name
                  </StyledText>
                  <AppTextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First"
                    autoCapitalize="words"
                    autoComplete="given-name"
                    textContentType="givenName"
                    returnKeyType="next"
                    className="bg-background text-foreground border border-border rounded-md px-4 py-3 text-base"
                    placeholderTextColor={PLACEHOLDER_COLOR}
                  />
                </View>
                <View className="flex-1">
                  <StyledText variant="label" className="mb-1.5">
                    Last name
                  </StyledText>
                  <AppTextInput
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last"
                    autoCapitalize="words"
                    autoComplete="family-name"
                    textContentType="familyName"
                    returnKeyType="next"
                    className="bg-background text-foreground border border-border rounded-md px-4 py-3 text-base"
                    placeholderTextColor={PLACEHOLDER_COLOR}
                  />
                </View>
              </View>

              <View>
                <StyledText variant="label" className="mb-1.5">
                  Password
                </StyledText>
                <View className="flex-row items-center bg-background border border-border rounded-md pr-1">
                  <AppTextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="At least 8 characters"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="password-new"
                    textContentType="newPassword"
                    returnKeyType="next"
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
                {strength.label ? (
                  <StyledText
                    variant="caption"
                    className={`mt-1.5 text-xs ${strength.className}`}
                  >
                    {strength.label}
                  </StyledText>
                ) : null}
              </View>

              <View>
                <StyledText variant="label" className="mb-1.5">
                  Confirm password
                </StyledText>
                <AppTextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter password"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password-new"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  className="bg-background text-foreground border border-border rounded-md px-4 py-3 text-base"
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
                title="Accept invitation"
                onPress={handleSubmit}
                loading={loading}
                disabled={!canSubmit}
                size="lg"
                className="mt-2"
              />
            </View>
          </View>

          <Pressable
            onPress={goToSignIn}
            hitSlop={8}
            className="items-center py-3 mt-4 active:opacity-60"
          >
            <StyledText variant="caption" className="text-sm">
              Already have an account? Sign in
            </StyledText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}
