import { Pressable, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { StyledText } from "@/components/ui/text";
import type { DayState } from "../types";

const ICON_COLOR = "#78716c";

interface DayRowProps {
  label: string;
  state: DayState;
  onPress: () => void;
  divider?: boolean;
}

/**
 * A single row in the 7-day availability list. Tappable; opens the
 * `DayAvailabilitySheet` editor in the parent screen. The icon and
 * description reflect the day's preference + time window so the
 * user gets a glanceable summary without opening the sheet.
 *
 * Shared by the Settings → Availability screen and the onboarding
 * wizard's Availability step so the two surfaces present an
 * identical control.
 */
export function AvailabilityDayRow({
  label,
  state,
  onPress,
  divider = false,
}: DayRowProps) {
  const description = formatRowDescription(state);
  const iconName: React.ComponentProps<typeof MaterialIcons>["name"] =
    state.preference === "preferred"
      ? "star"
      : state.preference === "available"
        ? "check-circle"
        : "radio-button-unchecked";
  const iconColor =
    state.preference === "preferred"
      ? "#f59e0b"
      : state.preference === "available"
        ? "#b45309"
        : ICON_COLOR;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${label} availability`}
      className={`flex-row items-center px-4 py-3 active:opacity-80 ${
        divider ? "border-t border-border" : ""
      }`}
    >
      <MaterialIcons name={iconName} size={22} color={iconColor} />
      <View className="flex-1 px-3">
        <StyledText variant="body">{label}</StyledText>
        <StyledText variant="caption" className="mt-0.5">
          {description}
        </StyledText>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={ICON_COLOR} />
    </Pressable>
  );
}

interface PresetChipProps {
  label: string;
  onPress: () => void;
}

/** Rounded chip for the "Weekdays / Weekends / Clear all" presets. */
export function AvailabilityPresetChip({ label, onPress }: PresetChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="border border-border rounded-full px-3 py-1.5 active:opacity-70"
    >
      <StyledText variant="caption" className="text-foreground">
        {label}
      </StyledText>
    </Pressable>
  );
}

export function formatRowDescription(state: DayState): string {
  if (state.preference === "unavailable") return "Unavailable";
  if (!state.availableFrom || !state.availableTo) return "No time window set";
  const prefix = state.preference === "preferred" ? "Preferred · " : "";
  return `${prefix}${formatTime(state.availableFrom)} – ${formatTime(state.availableTo)}`;
}

export function formatTime(value: string): string {
  const [h, m] = value.split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "p" : "a";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return m === "00" ? `${display}${suffix}` : `${display}:${m}${suffix}`;
}
