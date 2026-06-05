import { useCallback, useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { AppTextInput } from "@/components/ui/text-input";
import {
  useUser,
  isClerkAPIResponseError,
} from "@clerk/clerk-expo";
import { Image } from "expo-image";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useMyStaff, useUpdateMyStaff } from "@/features/profile/hooks";
import { useProfileImage } from "@/features/profile/use-profile-image";
import { OnboardingHeader } from "../components/onboarding-header";
import { useOnboardingNav } from "../use-onboarding-nav";

const PLACEHOLDER_COLOR = "#a8a29e";
const ICON_COLOR = "#78716c";

/**
 * Profile (step 1/4). The user confirms their basics (name, phone)
 * and optionally adds a profile picture before continuing.
 *
 * Why phone is mandatory — `StaffSchema` (web) marks `phone` as
 * required, and the AI scheduler downstream uses it to send SMS
 * confirmations. We block "Next" until the value passes the same
 * digit-count validation the existing settings sheet runs.
 *
 * Why first/last name are mandatory — Clerk's webhook seeds the
 * `OrganizationMember` row from the user's Clerk profile, so a
 * missing name surfaces as "Unnamed" in every roster view. We
 * pre-fill from Clerk and require the user to confirm.
 *
 * Role(s) are read-only and come from the Staff record
 * (`Staff.roles`) — the kitchen-specific job titles the manager
 * assigned at invite time (e.g. "Line Cook"), not the coarse
 * `OrganizationMember.role` that only exists for auth gating.
 */
export function ProfileStepScreen() {
  const { goNext } = useOnboardingNav("profile");
  const { user, isLoaded } = useUser();
  const myStaffQuery = useMyStaff();
  const updateMyStaff = useUpdateMyStaff();
  const profileImage = useProfileImage();

  const staff = myStaffQuery.data ?? null;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Hydrate from Clerk + the (possibly empty) Staff record once.
  // We deliberately read from Clerk first because the staff member
  // can update their name via Clerk's account portal directly —
  // that value is the source of truth, and we only mirror it onto
  // the Staff doc when the user moves on from this step.
  useEffect(() => {
    if (!isLoaded || !user) return;
    setFirstName((prev) => prev || (user.firstName ?? ""));
    setLastName((prev) => prev || (user.lastName ?? ""));
  }, [isLoaded, user]);

  useEffect(() => {
    if (!staff) return;
    setPhone((prev) => prev || staff.phone || "");
  }, [staff]);

  const phoneError = validatePhone(phone);
  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();
  const canSubmit =
    Boolean(trimmedFirst) &&
    Boolean(trimmedLast) &&
    phone.length > 0 &&
    phoneError === null &&
    !submitting;

  const handleNext = useCallback(async () => {
    if (!user || !canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const updates: Promise<unknown>[] = [];
      if (user.firstName !== trimmedFirst) {
        updates.push(user.update({ firstName: trimmedFirst }));
      }
      if (user.lastName !== trimmedLast) {
        updates.push(user.update({ lastName: trimmedLast }));
      }
      // Only patch Staff when the phone actually changed — the
      // PATCH route rejects empty payloads with 400.
      if (staff && phone !== staff.phone) {
        updates.push(updateMyStaff.mutateAsync({ phone }));
      } else if (!staff || !staff.phone) {
        updates.push(updateMyStaff.mutateAsync({ phone }));
      }
      await Promise.all(updates);
      goNext();
    } catch (err) {
      setSubmitError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [
    user,
    canSubmit,
    trimmedFirst,
    trimmedLast,
    phone,
    staff,
    updateMyStaff,
    goNext,
  ]);

  if (!isLoaded || !user || myStaffQuery.isLoading) {
    return (
      <View className="flex-1 bg-background">
        <OnboardingHeader currentStepId="profile" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  const primaryEmail =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    "";

  const initials =
    (trimmedFirst[0] ?? "") + (trimmedLast[0] ?? "");

  // Kitchen job titles assigned by the manager on the Staff record
  // (e.g. "Line Cook"), not the coarse OrganizationMember auth role.
  const staffRoles = staff?.roles ?? [];

  return (
    <View className="flex-1 bg-background">
      <OnboardingHeader currentStepId="profile" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerClassName="px-4 pt-6 pb-10">
          <View className="items-center mb-6">
            <Pressable
              onPress={profileImage.presentOptions}
              disabled={profileImage.busy}
              accessibilityRole="button"
              accessibilityLabel="Change profile picture"
              className="active:opacity-80"
            >
              <View className="w-24 h-24 rounded-full bg-primary items-center justify-center overflow-hidden">
                {user.hasImage && user.imageUrl ? (
                  <Image
                    source={{ uri: user.imageUrl }}
                    style={{ width: 96, height: 96 }}
                    contentFit="cover"
                    transition={150}
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <StyledText
                    variant="title"
                    className="text-primary-foreground text-3xl"
                  >
                    {initials.toUpperCase() || "?"}
                  </StyledText>
                )}
              </View>
              <View className="absolute bottom-0 right-0 bg-card border border-border rounded-full w-8 h-8 items-center justify-center">
                {profileImage.busy ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <MaterialIcons name="photo-camera" size={18} color={ICON_COLOR} />
                )}
              </View>
            </Pressable>
            <StyledText variant="caption" className="mt-3 text-sm">
              Tap to add a photo (optional)
            </StyledText>
          </View>

          <StyledText variant="title" className="text-2xl mb-1">
            Confirm your profile
          </StyledText>
          <StyledText variant="caption" className="mb-6 text-sm">
            Your team will see this on the schedule and roster.
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
                Email
              </StyledText>
              <View className="bg-muted border border-border rounded-md px-4 py-3">
                <StyledText variant="body" className="text-muted-foreground">
                  {primaryEmail || "Not set"}
                </StyledText>
              </View>
              <StyledText variant="caption" className="mt-1 text-xs">
                Locked to the email your manager invited.
              </StyledText>
            </View>

            <View>
              <StyledText variant="label" className="mb-1.5">
                Phone
              </StyledText>
              <AppTextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="(555) 123-4567"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                returnKeyType="done"
                onSubmitEditing={handleNext}
                className="bg-background text-foreground border border-border rounded-md px-4 py-3 text-base"
                placeholderTextColor={PLACEHOLDER_COLOR}
              />
              {phoneError && phone.length > 0 ? (
                <StyledText variant="caption" className="mt-1 text-destructive text-xs">
                  {phoneError}
                </StyledText>
              ) : null}
            </View>

            {staffRoles.length > 0 ? (
              <View>
                <StyledText variant="label" className="mb-1.5">
                  {staffRoles.length > 1 ? "Roles" : "Role"}
                </StyledText>
                <View className="flex-row flex-wrap gap-2">
                  {staffRoles.map((role) => (
                    <View
                      key={role}
                      className="bg-muted border border-border rounded-full px-3 py-1.5"
                    >
                      <StyledText variant="caption" className="text-foreground">
                        {role}
                      </StyledText>
                    </View>
                  ))}
                </View>
                <StyledText variant="caption" className="mt-1 text-xs">
                  Your manager sets this — reach out if it looks wrong.
                </StyledText>
              </View>
            ) : null}

            {submitError ? (
              <View className="border border-destructive rounded-md px-3 py-2">
                <StyledText variant="caption" className="text-destructive text-sm">
                  {submitError}
                </StyledText>
              </View>
            ) : null}

            <Button
              title="Next"
              onPress={handleNext}
              loading={submitting}
              disabled={!canSubmit}
              size="lg"
              className="mt-2"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * Mirrors the phone validation rules in
 * `packages/types/src/validations/staff.schema.ts` so the user gets
 * immediate feedback before the round-trip.
 */
function validatePhone(value: string): string | null {
  if (value.length === 0) return "Phone number is required.";
  const digits = value.replace(/\D/g, "");
  if (
    digits.length === 10 ||
    (digits.length === 11 && digits.startsWith("1"))
  ) {
    return null;
  }
  return "Phone number must contain 10 digits (or 11 with country code).";
}

function extractErrorMessage(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    return (
      err.errors?.[0]?.longMessage ??
      err.errors?.[0]?.message ??
      "Could not save your profile."
    );
  }
  if (err instanceof Error) return err.message;
  return "Could not save your profile.";
}
