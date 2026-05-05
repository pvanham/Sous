import { useCallback, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useUser, useClerk, isClerkAPIResponseError } from "@clerk/clerk-expo";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { StaffAddress, StaffDTO } from "@sous/types";

import { Image } from "expo-image";

import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/features/auth/use-sign-out";
import { EditFieldSheet } from "../components/edit-field-sheet";
import { AddressSheet } from "../components/address-sheet";
import { SkillsSection } from "../components/skills-section";
import { useMyStaff, useUpdateMyStaff } from "../hooks";
import { useProfileImage } from "../use-profile-image";

const ICON_COLOR = "#78716c";
const CHEVRON_COLOR = "#a8a29e";

/**
 * Profile tab.
 *
 * The screen is a **read-only list**. Tapping any editable row opens
 * a `BottomSheet` with a single input (or the five address inputs)
 * and an **Update** button. There is no screen-level "edit mode" —
 * edits are atomic, per-field, and commit immediately on Update.
 *
 * Data sources
 *   - Clerk `user`: first name, last name, email, avatar initials.
 *   - `GET /api/me/staff` via `useMyStaff`: phone, address, skills.
 *     404 (manager / owner with no staff row) is surfaced as
 *     `data === null`; the profile then hides the phone / address /
 *     skills sections and shows only name + email.
 */
export function ProfileScreen() {
  const { user, isLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signOut = useSignOut();

  const myStaffQuery = useMyStaff();
  const updateMyStaff = useUpdateMyStaff();
  const profileImage = useProfileImage();

  type FieldKey = "firstName" | "lastName" | "phone" | "address";
  const [openField, setOpenField] = useState<FieldKey | null>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  }, [router]);

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

  // Hide the Clerk sign-out loop guard. If Clerk is still booting
  // (`isLoaded === false`) we just spin — AuthGate would have
  // redirected an unauthenticated user to sign-in before this page
  // ever mounted.
  if (!isLoaded || !user) {
    void clerkSignOut;
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const staff: StaffDTO | null = myStaffQuery.data ?? null;
  const hasStaffRow = staff !== null;
  const primaryEmail =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    "No email on file";

  const firstName = user.firstName ?? "";
  const lastName = user.lastName ?? "";
  const phone = staff?.phone ?? "";
  const address = staff?.address ?? null;

  // ── Mutations wired through the sheets ──────────────────────

  const updateClerkName = async (
    field: "firstName" | "lastName",
    value: string,
  ) => {
    try {
      await user.update({ [field]: value });
      await user.reload();
    } catch (err) {
      throw new Error(clerkErrorMessage(err));
    }
  };

  const updatePhone = async (value: string) => {
    await updateMyStaff.mutateAsync({ phone: value });
  };

  const updateAddress = async (value: StaffAddress | null) => {
    await updateMyStaff.mutateAsync({ address: value });
  };

  // ── Render ──────────────────────────────────────────────────

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
        <View className="w-10" />
      </View>

      <ScrollView contentContainerClassName="px-4 pt-6 pb-10">
        <View className="items-center mb-6">
          <Pressable
            onPress={profileImage.presentOptions}
            disabled={profileImage.busy}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
            className="active:opacity-80"
          >
            <View className="w-20 h-20 rounded-full bg-primary items-center justify-center overflow-hidden">
              {user.hasImage && user.imageUrl ? (
                <Image
                  source={{ uri: user.imageUrl }}
                  style={{ width: 80, height: 80 }}
                  contentFit="cover"
                  transition={150}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <StyledText
                  variant="title"
                  className="text-primary-foreground text-2xl"
                >
                  {((firstName[0] ?? "") + (lastName[0] ?? "")).toUpperCase() ||
                    "?"}
                </StyledText>
              )}
            </View>
            <View className="absolute bottom-0 right-0 bg-card border border-border rounded-full w-7 h-7 items-center justify-center">
              {profileImage.busy ? (
                <ActivityIndicator size="small" />
              ) : (
                <MaterialIcons name="photo-camera" size={16} color={ICON_COLOR} />
              )}
            </View>
          </Pressable>
          <StyledText variant="title" className="mt-3">
            {[firstName, lastName].filter(Boolean).join(" ") || "Unnamed"}
          </StyledText>
          <StyledText variant="caption" className="mt-1">
            {primaryEmail}
          </StyledText>
        </View>

        <SectionHeader label="Personal" />
        <View className="bg-card border border-border rounded-md overflow-hidden mb-4">
          <InfoRow
            label="First name"
            value={firstName}
            onPress={() => setOpenField("firstName")}
          />
          <InfoRow
            label="Last name"
            value={lastName}
            onPress={() => setOpenField("lastName")}
            divider
          />
        </View>

        <SectionHeader label="Contact" />
        <View className="bg-card border border-border rounded-md overflow-hidden mb-4">
          <InfoRow label="Email" value={primaryEmail} readOnly />
          {hasStaffRow ? (
            <InfoRow
              label="Phone"
              value={formatPhone(phone)}
              onPress={() => setOpenField("phone")}
              divider
            />
          ) : null}
        </View>

        {hasStaffRow ? (
          <>
            <SectionHeader label="Address" />
            <Pressable
              onPress={() => setOpenField("address")}
              className="bg-card border border-border rounded-md px-4 py-4 mb-4 flex-row items-center active:opacity-80"
              accessibilityRole="button"
              accessibilityLabel="Edit address"
            >
              <View className="flex-1 pr-3">
                {address ? (
                  <AddressLines address={address} />
                ) : (
                  <StyledText
                    variant="body"
                    className="text-muted-foreground"
                  >
                    Add address
                  </StyledText>
                )}
              </View>
              <MaterialIcons
                name="chevron-right"
                size={22}
                color={CHEVRON_COLOR}
              />
            </Pressable>

            <SectionHeader label="Stations & Skills" />
            <View className="mb-6">
              <SkillsSection skills={staff?.skills ?? []} />
            </View>
          </>
        ) : null}

        {myStaffQuery.isError ? (
          <View className="border border-destructive rounded-md px-3 py-2 mb-4">
            <StyledText
              variant="caption"
              className="text-destructive text-sm"
            >
              Couldn&apos;t load your profile details. Pull to refresh or try
              again later.
            </StyledText>
          </View>
        ) : null}

        <View className="border-t border-border mt-2 pt-4">
          <StyledText
            variant="caption"
            className="uppercase tracking-wider mb-2"
          >
            Account
          </StyledText>
          <Pressable
            onPress={handleSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            className="flex-row items-center justify-center gap-2 border border-destructive rounded-md px-6 py-3.5 active:opacity-80"
          >
            <MaterialIcons name="logout" size={18} color="#dc2626" />
            <StyledText
              variant="label"
              className="text-destructive text-base font-semibold"
            >
              Sign out
            </StyledText>
          </Pressable>
        </View>
      </ScrollView>

      <EditFieldSheet
        visible={openField === "firstName"}
        onClose={() => setOpenField(null)}
        label="First name"
        initialValue={firstName}
        placeholder="First name"
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
        validate={(value) =>
          value.length === 0 ? "First name can't be empty." : null
        }
        onSubmit={(value) => updateClerkName("firstName", value)}
      />
      <EditFieldSheet
        visible={openField === "lastName"}
        onClose={() => setOpenField(null)}
        label="Last name"
        initialValue={lastName}
        placeholder="Last name"
        autoCapitalize="words"
        autoComplete="family-name"
        textContentType="familyName"
        validate={(value) =>
          value.length === 0 ? "Last name can't be empty." : null
        }
        onSubmit={(value) => updateClerkName("lastName", value)}
      />
      <EditFieldSheet
        visible={openField === "phone"}
        onClose={() => setOpenField(null)}
        label="Phone number"
        initialValue={phone}
        placeholder="(555) 123-4567"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        validate={validatePhone}
        onSubmit={updatePhone}
      />
      <AddressSheet
        visible={openField === "address"}
        onClose={() => setOpenField(null)}
        initialValue={address}
        onSubmit={updateAddress}
      />
    </View>
  );
}

// ── Row primitives ────────────────────────────────────────────

interface InfoRowProps {
  label: string;
  value: string;
  onPress?: () => void;
  readOnly?: boolean;
  divider?: boolean;
}

function InfoRow({
  label,
  value,
  onPress,
  readOnly = false,
  divider = false,
}: InfoRowProps) {
  const content = (
    <View
      className={`flex-row items-center justify-between px-4 py-3 ${
        divider ? "border-t border-border" : ""
      }`}
    >
      <View className="flex-1 pr-3">
        <StyledText variant="caption" className="mb-0.5">
          {label}
        </StyledText>
        <StyledText
          variant="body"
          className={value ? "text-foreground" : "text-muted-foreground"}
        >
          {value || "Not set"}
        </StyledText>
      </View>
      {onPress && !readOnly ? (
        <MaterialIcons
          name="chevron-right"
          size={22}
          color={CHEVRON_COLOR}
        />
      ) : null}
    </View>
  );

  if (onPress && !readOnly) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${label.toLowerCase()}`}
        className="active:opacity-80"
      >
        {content}
      </Pressable>
    );
  }

  return content;
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

function AddressLines({ address }: { address: StaffAddress }) {
  const line2 = [
    address.city,
    [address.state, address.postalCode].filter(Boolean).join(" "),
  ]
    .filter((segment) => segment && segment.length > 0)
    .join(", ");
  return (
    <View>
      <StyledText variant="caption" className="mb-0.5">
        Address
      </StyledText>
      <StyledText variant="body">{address.line1}</StyledText>
      {address.line2 ? (
        <StyledText variant="body">{address.line2}</StyledText>
      ) : null}
      {line2 ? <StyledText variant="body">{line2}</StyledText> : null}
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Mirrors `phoneSchema` in
 * `packages/types/src/validations/staff.schema.ts` so the client
 * gives immediate feedback before it round-trips to the server.
 */
function validatePhone(value: string): string | null {
  if (value.length === 0) return "Phone number can't be empty.";
  const digits = value.replace(/\D/g, "");
  if (
    digits.length === 10 ||
    (digits.length === 11 && digits.startsWith("1"))
  ) {
    return null;
  }
  return "Phone number must contain 10 digits (or 11 with country code).";
}

/**
 * Pretty-print a phone number for the read-only row. Accepts any
 * format the server happens to have stored (the mongoose setter
 * strips most separators) and reformats to `(AAA) XXX-YYYY`.
 */
function formatPhone(raw: string): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

function clerkErrorMessage(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    return (
      err.errors?.[0]?.longMessage ??
      err.errors?.[0]?.message ??
      "Could not update your profile."
    );
  }
  return err instanceof Error ? err.message : "Could not update your profile.";
}
