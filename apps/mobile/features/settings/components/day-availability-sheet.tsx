import { useEffect, useMemo, useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { AvailabilityPreference } from "@sous/types";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import type { DayState } from "../types";

const ICON_COLOR = "#78716c";
const DEFAULT_FROM = "07:00";
const DEFAULT_TO = "23:00";

const TIME_OPTIONS = buildTimeOptions();

function buildTimeOptions(): string[] {
  const options: string[] = [];
  for (let h = 0; h <= 23; h++) {
    options.push(`${String(h).padStart(2, "0")}:00`);
    options.push(`${String(h).padStart(2, "0")}:30`);
  }
  return options;
}

interface DayAvailabilitySheetProps {
  visible: boolean;
  onClose: () => void;
  dayLabel: string;
  initialState: DayState;
  onSubmit: (state: DayState) => void;
}

/**
 * Bottom sheet editor for a single day's availability. Three-way
 * preference picker (Off / Available / Preferred) followed by
 * paired scrolling time pickers for the start + end window.
 *
 * Cross-field invariant: `end > start` when the day is anything other
 * than "Off". If the user toggles to Available / Preferred without an
 * existing window, we default to a generous 7am–11pm so the AI
 * scheduler has something to work with on day one.
 */
export function DayAvailabilitySheet({
  visible,
  onClose,
  dayLabel,
  initialState,
  onSubmit,
}: DayAvailabilitySheetProps) {
  const [preference, setPreference] = useState<AvailabilityPreference>(
    initialState.preference,
  );
  const [from, setFrom] = useState<string>(
    initialState.availableFrom ?? DEFAULT_FROM,
  );
  const [to, setTo] = useState<string>(initialState.availableTo ?? DEFAULT_TO);

  useEffect(() => {
    if (visible) {
      setPreference(initialState.preference);
      setFrom(initialState.availableFrom ?? DEFAULT_FROM);
      setTo(initialState.availableTo ?? DEFAULT_TO);
    }
  }, [visible, initialState.preference, initialState.availableFrom, initialState.availableTo]);

  const handlePreference = (next: AvailabilityPreference) => {
    setPreference(next);
    if (next !== "unavailable") {
      if (!from) setFrom(DEFAULT_FROM);
      if (!to) setTo(DEFAULT_TO);
    }
  };

  const invalid = preference !== "unavailable" && (!from || !to || to <= from);
  const canSubmit = !invalid;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (preference === "unavailable") {
      onSubmit({
        preference: "unavailable",
        availableFrom: null,
        availableTo: null,
        notes: initialState.notes ?? "",
      });
      return;
    }
    onSubmit({
      preference,
      availableFrom: from,
      availableTo: to,
      notes: initialState.notes ?? "",
    });
  };

  const helperText = useMemo(() => {
    if (preference === "unavailable") return "You can't work this day.";
    if (invalid) return "End time must be after start time.";
    if (preference === "preferred") {
      return "The scheduler will try to give you this day first.";
    }
    return "You're open to working this day during this window.";
  }, [preference, invalid]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View className="flex-row items-center justify-between mb-4">
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <StyledText
            variant="body"
            className="text-muted-foreground text-base"
          >
            Cancel
          </StyledText>
        </Pressable>
        <StyledText variant="subtitle">{dayLabel}</StyledText>
        <View className="w-14" />
      </View>

      <View className="flex-row gap-2 mb-4">
        <PreferenceChip
          label="Off"
          icon="close"
          selected={preference === "unavailable"}
          onPress={() => handlePreference("unavailable")}
        />
        <PreferenceChip
          label="Available"
          icon="check"
          selected={preference === "available"}
          onPress={() => handlePreference("available")}
        />
        <PreferenceChip
          label="Preferred"
          icon="star"
          selected={preference === "preferred"}
          onPress={() => handlePreference("preferred")}
        />
      </View>

      {preference !== "unavailable" ? (
        <View className="flex-row gap-3 mb-3">
          <View className="flex-1">
            <StyledText variant="label" className="mb-1.5">
              From
            </StyledText>
            <TimePicker value={from} onChange={setFrom} />
          </View>
          <View className="flex-1">
            <StyledText variant="label" className="mb-1.5">
              To
            </StyledText>
            <TimePicker value={to} onChange={setTo} />
          </View>
        </View>
      ) : null}

      <StyledText
        variant="caption"
        className={invalid ? "text-destructive" : ""}
      >
        {helperText}
      </StyledText>

      <Button
        title="Update"
        onPress={handleSubmit}
        disabled={!canSubmit}
        size="lg"
        className="mt-4"
      />
    </BottomSheet>
  );
}

interface PreferenceChipProps {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  selected: boolean;
  onPress: () => void;
}

function PreferenceChip({
  label,
  icon,
  selected,
  onPress,
}: PreferenceChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className={`flex-1 flex-row items-center justify-center rounded-md py-2.5 border gap-1.5 active:opacity-80 ${
        selected
          ? "bg-primary border-primary"
          : "bg-background border-border"
      }`}
    >
      <MaterialIcons
        name={icon}
        size={16}
        color={selected ? "#fefce8" : ICON_COLOR}
      />
      <StyledText
        variant="label"
        className={selected ? "text-primary-foreground" : "text-foreground"}
      >
        {label}
      </StyledText>
    </Pressable>
  );
}

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Cheap, native-feeling time picker. Horizontal list of half-hour
 * slots — taps set the value and highlight the active option. We
 * deliberately avoid pulling in `@react-native-community/datetimepicker`
 * here because a 48-option horizontal scroller is easier to reason
 * about across iOS + Android than the native pickers' platform
 * differences.
 */
function TimePicker({ value, onChange }: TimePickerProps) {
  return (
    <View className="bg-background border border-border rounded-md py-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-2 gap-1"
      >
        {TIME_OPTIONS.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option}
              className={`px-3 py-2 rounded-md ${
                selected ? "bg-primary" : "bg-transparent"
              }`}
            >
              <StyledText
                variant="body"
                className={selected ? "text-primary-foreground" : ""}
              >
                {formatDisplay(option)}
              </StyledText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function formatDisplay(value: string): string {
  const [h, m] = value.split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "p" : "a";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return m === "00" ? `${display}${suffix}` : `${display}:${m}${suffix}`;
}
