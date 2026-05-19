import { Pressable, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { StyledText } from "./text";

const ICON_COLOR = "#78716c";

interface HoursStepperProps {
  value: number;
  onChange: (next: number) => void;
  /** Caption rendered below the value (e.g. "Hours per week I'd like to work at least"). */
  subtitle: string;
  /** Tints the numeric value. `primary` for the maximum, `muted` for the minimum. */
  color?: "muted" | "primary";
  /** Per-tap delta. Defaults to 1 (long-press auto-bumps by `largeStep`). */
  step?: number;
  /** Delta applied on long-press. Defaults to 5. */
  largeStep?: number;
}

/**
 * Chunky ±/− stepper used by both the Settings → Weekly hours screen
 * and the onboarding wizard's availability step. Lives in the shared
 * UI directory so the two surfaces present an identical control —
 * staff who set hours during onboarding see the same widget when
 * they later edit them.
 *
 * The component intentionally has no clamping or invariant logic of
 * its own — callers own range enforcement (clamp + `max >= min`)
 * because those rules differ between contexts (onboarding skips
 * cross-field validation while the user is still entering values;
 * Settings re-validates on save).
 */
export function HoursStepper({
  value,
  onChange,
  subtitle,
  color = "muted",
  step = 1,
  largeStep = 5,
}: HoursStepperProps) {
  const tint = color === "primary" ? "text-primary" : "text-foreground";
  return (
    <View className="bg-card border border-border rounded-md px-4 py-4">
      <View className="flex-row items-center justify-between">
        <StepperButton
          icon="remove"
          onPress={() => onChange(value - step)}
          onLongPress={() => onChange(value - largeStep)}
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
          onPress={() => onChange(value + step)}
          onLongPress={() => onChange(value + largeStep)}
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
