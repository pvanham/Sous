import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useUser, useClerk, isClerkAPIResponseError } from "@clerk/clerk-expo";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/features/auth/use-sign-out";

const PLACEHOLDER_COLOR = "#a8a29e";
const ICON_COLOR = "#78716c";

/**
 * Shape stored under `user.unsafeMetadata.staffProfile`.
 *
 * Clerk only has first-class support for names, emails, phone numbers,
 * and a handful of other identity primitives. Anything else — including
 * a "contact phone" that isn't part of the auth flow, and a postal
 * address — lives in `unsafeMetadata`, which the Clerk JS SDK lets the
 * user edit directly without a server action.
 */
type StaffProfileMetadata = {
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

interface FormState {
  firstName: string;
  lastName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
}

function readStaffProfile(
  metadata: Record<string, unknown> | undefined,
): StaffProfileMetadata {
  if (!metadata || typeof metadata !== "object") return {};
  const raw = metadata.staffProfile;
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const pick = (key: keyof StaffProfileMetadata): string | undefined => {
    const value = obj[key];
    return typeof value === "string" ? value : undefined;
  };
  return {
    phone: pick("phone"),
    addressLine1: pick("addressLine1"),
    addressLine2: pick("addressLine2"),
    city: pick("city"),
    state: pick("state"),
    postalCode: pick("postalCode"),
  };
}

function buildInitialState(user: ReturnType<typeof useUser>["user"]): FormState {
  const staffProfile = readStaffProfile(
    user?.unsafeMetadata as Record<string, unknown> | undefined,
  );
  return {
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    phone: staffProfile.phone ?? "",
    addressLine1: staffProfile.addressLine1 ?? "",
    addressLine2: staffProfile.addressLine2 ?? "",
    city: staffProfile.city ?? "",
    state: staffProfile.state ?? "",
    postalCode: staffProfile.postalCode ?? "",
  };
}

export function ProfileScreen() {
  const { user, isLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signOut = useSignOut();

  const initialState = useMemo(() => buildInitialState(user), [user]);

  const [form, setForm] = useState<FormState>(initialState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(initialState);
  }, [initialState]);

  const dirty = useMemo(() => {
    return (Object.keys(form) as (keyof FormState)[]).some(
      (key) => form[key].trim() !== initialState[key].trim(),
    );
  }, [form, initialState]);

  const setField = useCallback(
    (key: keyof FormState) => (value: string) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!user || saving || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const trimmed: FormState = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        postalCode: form.postalCode.trim(),
      };

      const existingMetadata =
        (user.unsafeMetadata as Record<string, unknown> | undefined) ?? {};

      await user.update({
        firstName: trimmed.firstName,
        lastName: trimmed.lastName,
        unsafeMetadata: {
          ...existingMetadata,
          staffProfile: {
            phone: trimmed.phone,
            addressLine1: trimmed.addressLine1,
            addressLine2: trimmed.addressLine2,
            city: trimmed.city,
            state: trimmed.state,
            postalCode: trimmed.postalCode,
          },
        },
      });

      // Re-read Clerk's resource so `user.*` reflects the persisted
      // values and the form's "dirty" state resets cleanly.
      await user.reload();
      Alert.alert("Profile", "Your profile has been updated.");
    } catch (err) {
      const message = isClerkAPIResponseError(err)
        ? (err.errors?.[0]?.longMessage ??
          err.errors?.[0]?.message ??
          "Could not update your profile.")
        : err instanceof Error
          ? err.message
          : "Could not update your profile.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [user, saving, dirty, form]);

  const handleSignOut = useCallback(() => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          void signOut();
        },
      },
    ]);
  }, [signOut]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  }, [router]);

  // Hide the Clerk sign-out loop guard. If Clerk is still booting
  // (`isLoaded === false`) we just spin — the AuthGate would have
  // redirected an unauthenticated user to sign-in before this page
  // ever mounted.
  if (!isLoaded || !user) {
    // Guard against race on sign-out.
    void clerkSignOut;
    return (
      <ScreenWrapper>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </ScreenWrapper>
    );
  }

  const primaryEmail =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    "No email on file";

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-2 border-b border-border">
        <Pressable
          onPress={handleBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="w-10 h-10 items-center justify-center -ml-2 active:opacity-60"
        >
          <MaterialIcons name="arrow-back" size={22} color={ICON_COLOR} />
        </Pressable>
        <StyledText variant="subtitle">Profile</StyledText>
        {/* Spacer so the title stays centered relative to the back
            button. Width must match the back button's hit area. */}
        <View className="w-10" />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="px-4 pt-6 pb-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center mb-6">
            <View className="w-20 h-20 rounded-full bg-primary items-center justify-center">
              <StyledText
                variant="title"
                className="text-primary-foreground text-2xl"
              >
                {(
                  (user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "")
                ).toUpperCase() || "?"}
              </StyledText>
            </View>
            <StyledText variant="title" className="mt-3">
              {[user.firstName, user.lastName].filter(Boolean).join(" ") ||
                "Unnamed"}
            </StyledText>
            <StyledText variant="caption" className="mt-1">
              {primaryEmail}
            </StyledText>
          </View>

          <SectionHeader label="Personal" />
          <Field
            label="First name"
            value={form.firstName}
            onChangeText={setField("firstName")}
            autoCapitalize="words"
            textContentType="givenName"
            autoComplete="given-name"
            placeholder="First name"
          />
          <Field
            label="Last name"
            value={form.lastName}
            onChangeText={setField("lastName")}
            autoCapitalize="words"
            textContentType="familyName"
            autoComplete="family-name"
            placeholder="Last name"
          />

          <SectionHeader label="Contact" />
          <ReadonlyField label="Email" value={primaryEmail} />
          <Field
            label="Phone number"
            value={form.phone}
            onChangeText={setField("phone")}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="(555) 123-4567"
          />

          <SectionHeader label="Address" />
          <Field
            label="Street address"
            value={form.addressLine1}
            onChangeText={setField("addressLine1")}
            autoCapitalize="words"
            autoComplete="street-address"
            textContentType="fullStreetAddress"
            placeholder="123 Main St"
          />
          <Field
            label="Apt / suite"
            value={form.addressLine2}
            onChangeText={setField("addressLine2")}
            autoCapitalize="words"
            placeholder="Optional"
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="City"
                value={form.city}
                onChangeText={setField("city")}
                autoCapitalize="words"
                autoComplete="postal-address-locality"
                placeholder="City"
              />
            </View>
            <View className="w-24">
              <Field
                label="State"
                value={form.state}
                onChangeText={setField("state")}
                autoCapitalize="characters"
                autoComplete="postal-address-region"
                maxLength={3}
                placeholder="NY"
              />
            </View>
          </View>
          <Field
            label="ZIP / postal code"
            value={form.postalCode}
            onChangeText={setField("postalCode")}
            keyboardType="number-pad"
            autoComplete="postal-code"
            textContentType="postalCode"
            maxLength={10}
            placeholder="10001"
          />

          {error ? (
            <View className="border border-destructive rounded-md px-3 py-2 mt-2">
              <StyledText variant="caption" className="text-destructive text-sm">
                {error}
              </StyledText>
            </View>
          ) : null}

          <Button
            title="Save changes"
            onPress={handleSave}
            loading={saving}
            disabled={!dirty || saving}
            size="lg"
            className="mt-6"
          />

          <Button
            title="Sign out"
            onPress={handleSignOut}
            variant="ghost"
            size="md"
            className="mt-2"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <StyledText
      variant="caption"
      className="uppercase tracking-wider mt-2 mb-2"
    >
      {label}
    </StyledText>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoComplete?: React.ComponentProps<typeof TextInput>["autoComplete"];
  textContentType?: React.ComponentProps<typeof TextInput>["textContentType"];
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
  maxLength?: number;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize = "sentences",
  autoComplete,
  textContentType,
  keyboardType,
  maxLength,
}: FieldProps) {
  return (
    <View className="mb-3">
      <StyledText variant="label" className="mb-1.5">
        {label}
      </StyledText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER_COLOR}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType={textContentType}
        keyboardType={keyboardType}
        maxLength={maxLength}
        className="bg-background text-foreground border border-border rounded-md px-4 py-3 text-base"
      />
    </View>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-3">
      <StyledText variant="label" className="mb-1.5">
        {label}
      </StyledText>
      <View className="bg-card border border-border rounded-md px-4 py-3">
        <StyledText variant="body" className="text-muted-foreground">
          {value}
        </StyledText>
      </View>
    </View>
  );
}
