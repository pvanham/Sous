import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "../components/settings-header";
import { useMyStaff, useUpdateMyStaff } from "@/features/profile/hooks";

const ICON_COLOR = "#78716c";
const MIN_HOURS = 0;
const MAX_HOURS = 80;

/**
 * Weekly hours screen. Exposes the two fields `minHoursPerWeek` and
 * `maxHoursPerWeek` that the AI scheduler treats as hard constraints.
 *
 * Edit UX: a stepper (±1 with long-press to bump by 5) feels more
 * phone-native than a numeric keypad and prevents staff from
 * accidentally typing 400. The staff member can still type a value
 * directly via the underlying TextInput label in a future iteration —
 * for now the stepper keeps the primary flow friction-free.
 *
 * Invariants
 *   - `max >= min` — enforced client-side below and re-checked by the
 *     /me/staff PATCH route.
 *   - Both values are clamped to `[0, 80]` on this screen (80 is a
 *     generous upper bound — managers can still set higher numbers
 *     from the web dashboard if they ever need to).
 */
export function HoursScreen() {
  const myStaffQuery = useMyStaff();
  const updateMyStaff = useUpdateMyStaff();

  const staff = myStaffQuery.data ?? null;
  const serverMin = staff?.minHoursPerWeek ?? 0;
  const serverMax = staff?.maxHoursPerWeek ?? 40;

  const [minHours, setMinHours] = useState(serverMin);
  const [maxHours, setMaxHours] = useState(serverMax);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Re-sync whenever the server values change (first load, or after
    // a successful save invalidates the profile cache).
    setMinHours(serverMin);
    setMaxHours(serverMax);
  }, [serverMin, serverMax]);

  const dirty = minHours !== serverMin || maxHours !== serverMax;
  const invalid = maxHours < minHours;
  const canSubmit = dirty && !invalid && !updateMyStaff.isPending;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    setSuccess(false);
    try {
      await updateMyStaff.mutateAsync({
        minHoursPerWeek: minHours,
        maxHoursPerWeek: maxHours,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save hours.");
    }
  }, [canSubmit, updateMyStaff, minHours, maxHours]);

  const clamp = useCallback(
    (value: number) => Math.max(MIN_HOURS, Math.min(MAX_HOURS, value)),
    [],
  );

  const helpMessage = useMemo(() => {
    if (invalid) {
      return "Maximum hours must be at least your minimum hours.";
    }
    return "Your scheduler uses these as hard limits when building the weekly roster.";
  }, [invalid]);

  if (myStaffQuery.isLoading) {
    return (
      <View className="flex-1 bg-background">
        <SettingsHeader title="Weekly hours" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  if (myStaffQuery.data === null || myStaffQuery.isError) {
    return (
      <View className="flex-1 bg-background">
        <SettingsHeader title="Weekly hours" />
        <View className="px-4 pt-6">
          <StyledText variant="body">
            We couldn&apos;t find your staff record at this location. Ask
            your manager to add you before setting weekly hours.
          </StyledText>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SettingsHeader title="Weekly hours" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerClassName="px-4 pt-6 pb-10">
          <StyledText variant="caption" className="uppercase tracking-wider mb-2">
            Minimum
          </StyledText>
          <Stepper
            value={minHours}
            onChange={(next) => setMinHours(clamp(next))}
            subtitle="Hours per week I'd like to work at least"
            color="muted"
          />

          <StyledText
            variant="caption"
            className="uppercase tracking-wider mt-6 mb-2"
          >
            Maximum
          </StyledText>
          <Stepper
            value={maxHours}
            onChange={(next) => setMaxHours(clamp(next))}
            subtitle="Hours per week I don't want to exceed"
            color="primary"
          />

          <StyledText
            variant="caption"
            className={`mt-4 ${invalid ? "text-destructive" : ""}`}
          >
            {helpMessage}
          </StyledText>

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
                Weekly hours updated.
              </StyledText>
            </View>
          ) : null}

          <Button
            title="Save changes"
            onPress={handleSubmit}
            loading={updateMyStaff.isPending}
            disabled={!canSubmit}
            size="lg"
            className="mt-4"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  subtitle: string;
  color: "muted" | "primary";
}

function Stepper({ value, onChange, subtitle, color }: StepperProps) {
  const tint = color === "primary" ? "text-primary" : "text-foreground";
  return (
    <View className="bg-card border border-border rounded-md px-4 py-4">
      <View className="flex-row items-center justify-between">
        <StepperButton
          icon="remove"
          onPress={() => onChange(value - 1)}
          onLongPress={() => onChange(value - 5)}
          accessibilityLabel="Decrease"
        />
        <View className="items-center flex-1">
          <StyledText variant="title" className={`${tint} text-4xl`}>
            {value}
          </StyledText>
          <StyledText variant="caption">hours / week</StyledText>
        </View>
        <StepperButton
          icon="add"
          onPress={() => onChange(value + 1)}
          onLongPress={() => onChange(value + 5)}
          accessibilityLabel="Increase"
        />
      </View>
      <StyledText variant="caption" className="mt-2 text-center">
        {subtitle}
      </StyledText>
    </View>
  );
}

interface StepperButtonProps {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel: string;
}

function StepperButton({
  icon,
  onPress,
  onLongPress,
  accessibilityLabel,
}: StepperButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="w-12 h-12 items-center justify-center rounded-full bg-muted active:opacity-60"
    >
      <MaterialIcons name={icon} size={22} color={ICON_COLOR} />
    </Pressable>
  );
}
