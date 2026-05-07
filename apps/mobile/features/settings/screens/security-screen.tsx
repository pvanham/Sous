import { useCallback, useState } from "react";
import {
  View,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useUser, isClerkAPIResponseError } from "@clerk/clerk-expo";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "../components/settings-header";

const PLACEHOLDER_COLOR = "#a8a29e";
const ICON_COLOR = "#78716c";

/**
 * Security / password screen. Clerk's `user.updatePassword` takes
 * both the current and new password; on success we flash a confirm
 * banner and clear the form.
 *
 * We deliberately keep this inline (not a bottom sheet) because the
 * user needs three distinct inputs + a confirm step, which is
 * explicitly the "complex data → dedicated screen" case in the
 * design rules for SHI-19.
 */
export function SecurityScreen() {
  const { user, isLoaded } = useUser();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit =
    !submitting &&
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    confirmPassword.length >= 8;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !user) return;
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Choose a new password that's different from the current one.");
      return;
    }

    setSubmitting(true);
    try {
      await user.updatePassword({
        currentPassword,
        newPassword,
        signOutOfOtherSessions: true,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, user, currentPassword, newPassword, confirmPassword]);

  return (
    <View className="flex-1 bg-background">
      <SettingsHeader title="Security" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerClassName="px-4 pt-6 pb-10">
          <StyledText variant="caption" className="uppercase tracking-wider mb-2">
            Change password
          </StyledText>
          <View className="bg-card border border-border rounded-md px-4 py-4 gap-3">
            {!isLoaded ? (
              <StyledText variant="caption">Loading your account…</StyledText>
            ) : null}

            <PasswordField
              label="Current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              show={showCurrent}
              onToggle={() => setShowCurrent((v) => !v)}
              autoComplete="current-password"
              textContentType="password"
              editable={isLoaded && !submitting}
            />
            <PasswordField
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              show={showNew}
              onToggle={() => setShowNew((v) => !v)}
              autoComplete="new-password"
              textContentType="newPassword"
              editable={isLoaded && !submitting}
            />
            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              show={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
              autoComplete="new-password"
              textContentType="newPassword"
              editable={isLoaded && !submitting}
            />
          </View>

          {error ? (
            <View className="border border-destructive rounded-md px-3 py-2 mt-3">
              <StyledText variant="caption" className="text-destructive text-sm">
                {error}
              </StyledText>
            </View>
          ) : null}

          {success ? (
            <View className="border border-primary rounded-md px-3 py-2 mt-3">
              <StyledText variant="caption" className="text-sm">
                Password updated. Other sessions have been signed out.
              </StyledText>
            </View>
          ) : null}

          <Button
            title="Update password"
            onPress={handleSubmit}
            loading={submitting}
            disabled={!canSubmit}
            size="lg"
            className="mt-4"
          />

          <StyledText variant="caption" className="mt-4">
            Minimum 8 characters. Updating signs out your other devices.
          </StyledText>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

interface PasswordFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: "current-password" | "new-password";
  textContentType: "password" | "newPassword";
  editable: boolean;
}

function PasswordField({
  label,
  value,
  onChangeText,
  show,
  onToggle,
  autoComplete,
  textContentType,
  editable,
}: PasswordFieldProps) {
  return (
    <View>
      <StyledText variant="label" className="mb-1.5">
        {label}
      </StyledText>
      <View className="flex-row items-center bg-background border border-border rounded-md">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={textContentType}
          editable={editable}
          placeholderTextColor={PLACEHOLDER_COLOR}
          className="flex-1 text-foreground px-4 py-3 text-base"
        />
        <Pressable
          onPress={onToggle}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={show ? "Hide password" : "Show password"}
          className="px-3 py-3"
        >
          <MaterialIcons
            name={show ? "visibility-off" : "visibility"}
            size={20}
            color={ICON_COLOR}
          />
        </Pressable>
      </View>
    </View>
  );
}

function clerkErrorMessage(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    return (
      err.errors?.[0]?.longMessage ??
      err.errors?.[0]?.message ??
      "Could not update your password."
    );
  }
  return err instanceof Error ? err.message : "Could not update your password.";
}
