import { useEffect, useMemo, useState } from "react";
import { View, Pressable, Platform, useColorScheme } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { AvailabilityPreference } from "@sous/types";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import type { DayState } from "../types";

const ICON_COLOR = "#78716c";
const DEFAULT_FROM = "07:00";
const DEFAULT_TO = "23:00";

function timeStringToDate(time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/** Rounds a Date to the nearest half-hour and returns an "HH:mm" string. */
function roundToNearestHalfHour(date: Date): string {
  const h = date.getHours();
  const min = date.getMinutes();
  const roundedMin = min < 15 ? 0 : min < 45 ? 30 : 0;
  const addHour = min >= 45 ? 1 : 0;
  const finalH = (h + addHour) % 24;
  return `${String(finalH).padStart(2, "0")}:${String(roundedMin).padStart(2, "0")}`;
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
        <View className="mb-3">
          <StyledText variant="label" className="mb-0.5">From</StyledText>
          <TimePicker value={from} onChange={setFrom} />
          <StyledText variant="label" className="mt-3 mb-0.5">To</StyledText>
          <TimePicker value={to} onChange={setTo} />
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
 * Native platform time picker (iOS scroll wheel / Android spinner).
 * Snaps to 30-minute intervals: `minuteInterval={30}` handles this on iOS;
 * Android selections are rounded to the nearest half-hour after change.
 *
 * `themeVariant` is set explicitly from the system color scheme so the
 * picker's own text renders correctly in dark mode (it doesn't inherit
 * NativeWind styles).
 */
function TimePicker({ value, onChange }: TimePickerProps) {
  const colorScheme = useColorScheme();

  return (
    <DateTimePicker
      value={timeStringToDate(value)}
      mode="time"
      display="spinner"
      minuteInterval={30}
      themeVariant={colorScheme === "dark" ? "dark" : "light"}
      onChange={(_, selected) => {
        if (!selected) return;
        const timeStr =
          Platform.OS === "android"
            ? roundToNearestHalfHour(selected)
            : `${String(selected.getHours()).padStart(2, "0")}:${String(selected.getMinutes()).padStart(2, "0")}`;
        onChange(timeStr);
      }}
    />
  );
}
