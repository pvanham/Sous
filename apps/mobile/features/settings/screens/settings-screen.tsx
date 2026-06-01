import { useCallback } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useUser, useClerk } from "@clerk/clerk-expo";
import { useMutation } from "@tanstack/react-query";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { StyledText } from "@/components/ui/text";
import { useSignOut } from "@/features/auth/use-sign-out";
import { useAuthStore } from "@/features/auth/store";
import { useMyStaff } from "@/features/profile/hooks";
import { useProfileImage } from "@/features/profile/use-profile-image";
import { deleteMyAccount } from "../api";
import { useSettingsPreferences } from "../preferences-store";

const ICON_COLOR = "#78716c";
const CHEVRON_COLOR = "#a8a29e";
const DESTRUCTIVE_COLOR = "#dc2626";

/**
 * Settings hub screen — the "Hub" half of the Hub-and-Spoke model
 * described in SHI-19. Renders the user's avatar at the top and a
 * vertically-scrolling, grouped list of settings rows. Tapping any
 * complex row pushes to a dedicated "spoke" screen via
 * `router.push`; toggles on the hub auto-save instantly with no
 * confirmation step.
 *
 * Destructive actions (sign out, delete account) sit at the very
 * bottom in red per the design rules.
 */
export function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();
  const signOut = useSignOut();
  const membership = useAuthStore((s) => s.membership);
  const staffQuery = useMyStaff();
  const theme = useSettingsPreferences((s) => s.theme);
  const profileImage = useProfileImage();

  const deleteAccountMutation = useMutation({
    mutationFn: deleteMyAccount,
    onSuccess: async () => {
      // Clerk webhook handles the DB cleanup. We still sign out
      // locally so the next render boots the unauthenticated stack.
      await clerkSignOut();
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : "Could not delete your account. Please contact support.";
      Alert.alert("Delete account", message);
    },
  });

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

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      "Delete account",
      "This permanently deletes your account and signs you out. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteAccountMutation.mutate();
          },
        },
      ],
    );
  }, [deleteAccountMutation]);

  if (!isLoaded || !user) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const firstName = user.firstName ?? "";
  const lastName = user.lastName ?? "";
  const initials =
    ((firstName[0] ?? "") + (lastName[0] ?? "")).toUpperCase() || "?";
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") || "Unnamed";
  const primaryEmail =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    "No email on file";
  const role = membership?.role ? formatRole(membership.role) : null;
  const isOwner = membership?.role === "owner";
  const hasStaffRow = staffQuery.data != null;
  const themeLabel = theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light";

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
        <StyledText variant="subtitle">Settings</StyledText>
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
                  {initials}
                </StyledText>
              )}
            </View>
            <View className="absolute bottom-0 right-0 bg-card border border-border rounded-full w-7 h-7 items-center justify-center">
              {profileImage.busy ? (
                <ActivityIndicator size="small" />
              ) : (
                <MaterialIcons
                  name="photo-camera"
                  size={16}
                  color={ICON_COLOR}
                />
              )}
            </View>
          </Pressable>
          <StyledText variant="title" className="mt-3">
            {displayName}
          </StyledText>
          <StyledText variant="caption" className="mt-1">
            {primaryEmail}
          </StyledText>
          {role ? (
            <StyledText variant="caption" className="mt-1">
              {role}
            </StyledText>
          ) : null}
        </View>

        <SectionHeader label="Account" />
        <Group>
          <LinkRow
            label="Personal info"
            description="Name, phone, address"
            icon="person-outline"
            onPress={() => router.push("/profile")}
          />
          <LinkRow
            label="Security & password"
            description="Reset your password"
            icon="lock-outline"
            onPress={() => router.push("/settings/security")}
            divider
          />
        </Group>

        <SectionHeader label="Preferences" />
        <Group>
          <LinkRow
            label="Appearance"
            description={themeLabel}
            icon="brightness-medium"
            onPress={() => router.push("/settings/appearance")}
          />
          {hasStaffRow ? (
            <>
              <LinkRow
                label="Station preferences"
                description="Stations you'd like to work"
                icon="restaurant-menu"
                onPress={() => router.push("/settings/stations")}
                divider
              />
              <LinkRow
                label="Availability"
                description="When you can work each day"
                icon="event-available"
                onPress={() => router.push("/settings/availability")}
                divider
              />
              <LinkRow
                label="Weekly hours"
                description="Minimum and maximum hours per week"
                icon="access-time"
                onPress={() => router.push("/settings/hours")}
                divider
              />
            </>
          ) : null}
        </Group>

        <SectionHeader label="Notifications" />
        <Group>
          <LinkRow
            label="Notification settings"
            description="Push and email preferences"
            icon="notifications-none"
            onPress={() => router.push("/settings/notifications")}
          />
        </Group>

        <View className="border-t border-border mt-2 pt-4">
          <StyledText
            variant="caption"
            className="uppercase tracking-wider mb-2"
          >
            Danger zone
          </StyledText>
          <Pressable
            onPress={handleSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            className="flex-row items-center justify-center gap-2 border border-destructive rounded-md px-6 py-3.5 active:opacity-80 mb-3"
          >
            <MaterialIcons name="logout" size={18} color={DESTRUCTIVE_COLOR} />
            <StyledText
              variant="label"
              className="text-destructive text-base font-semibold"
            >
              Sign out
            </StyledText>
          </Pressable>
          {isOwner ? (
            <StyledText variant="caption" className="px-1">
              To delete your owner account, sign in to the web dashboard.
              Deleting an owner removes the entire organization, so it can't
              be done from the app.
            </StyledText>
          ) : (
            <Pressable
              onPress={handleDeleteAccount}
              accessibilityRole="button"
              accessibilityLabel="Delete account"
              disabled={deleteAccountMutation.isPending}
              className={`flex-row items-center justify-center gap-2 bg-destructive rounded-md px-6 py-3.5 active:opacity-80 ${
                deleteAccountMutation.isPending ? "opacity-50" : ""
              }`}
            >
              {deleteAccountMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialIcons
                  name="delete-forever"
                  size={18}
                  color="#fff"
                />
              )}
              <StyledText
                variant="label"
                className="text-destructive-foreground text-base font-semibold"
              >
                Delete account
              </StyledText>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Row primitives ────────────────────────────────────────────

interface LinkRowProps {
  label: string;
  description?: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  onPress: () => void;
  divider?: boolean;
}

function LinkRow({
  label,
  description,
  icon,
  onPress,
  divider = false,
}: LinkRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-row items-center px-4 py-3 active:opacity-80 ${
        divider ? "border-t border-border" : ""
      }`}
    >
      <View className="w-8 h-8 rounded-md bg-muted items-center justify-center mr-3">
        <MaterialIcons name={icon} size={18} color={ICON_COLOR} />
      </View>
      <View className="flex-1 pr-3">
        <StyledText variant="body">{label}</StyledText>
        {description ? (
          <StyledText variant="caption" className="mt-0.5">
            {description}
          </StyledText>
        ) : null}
      </View>
      <MaterialIcons name="chevron-right" size={22} color={CHEVRON_COLOR} />
    </Pressable>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <View className="bg-card border border-border rounded-md overflow-hidden mb-4">
      {children}
    </View>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <StyledText variant="caption" className="uppercase tracking-wider mt-2 mb-2">
      {label}
    </StyledText>
  );
}

function formatRole(role: string): string {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
