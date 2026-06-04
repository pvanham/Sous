import { useState } from "react";
import { View, Pressable, TextInput, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { TimeOffRequestType, CreateTimeOffRequestInput } from "@/types";

interface RequestModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTimeOffRequestInput) => void;
  submitting: boolean;
}

const REQUEST_TYPES: { value: TimeOffRequestType; label: string }[] = [
  { value: "pto", label: "PTO" },
  { value: "sick", label: "Sick" },
  { value: "unpaid", label: "Unpaid" },
];

/**
 * Modal form for creating a new time-off request.
 * Includes date pickers, type selector, and optional reason.
 */
export function RequestModal({
  visible,
  onClose,
  onSubmit,
  submitting,
}: RequestModalProps) {
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [requestType, setRequestType] = useState<TimeOffRequestType>("pto");
  const [reason, setReason] = useState("");
  // "start" | "end" | null — tracks which field's picker is open
  const [activePicker, setActivePicker] = useState<"start" | "end" | null>(null);

  const handleSubmit = () => {
    onSubmit({
      startDate,
      endDate: endDate < startDate ? startDate : endDate,
      type: requestType,
      reason: reason.trim() || undefined,
    });
  };

  const resetForm = () => {
    setStartDate(new Date());
    setEndDate(new Date());
    setRequestType("pto");
    setReason("");
    setActivePicker(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const togglePicker = (field: "start" | "end") => {
    setActivePicker((prev) => (prev === field ? null : field));
  };

  const handleDateChange = (_: unknown, date?: Date) => {
    if (Platform.OS === "android") {
      // Android dialog closes itself; always reset activePicker
      setActivePicker(null);
    }
    if (!date) return;

    if (activePicker === "start") {
      setStartDate(date);
      if (date > endDate) setEndDate(date);
    } else if (activePicker === "end") {
      setEndDate(date);
    }

    // On iOS, close the inline calendar after selection
    if (Platform.OS === "ios") {
      setActivePicker(null);
    }
  };

  const pickerValue = activePicker === "start" ? startDate : endDate;
  const pickerMinDate = activePicker === "end" ? startDate : new Date();

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <StyledText variant="subtitle" className="mb-5">
        New Time Off Request
      </StyledText>

      {/* Date fields */}
      <View className="flex-row gap-3 mb-1">
        <DateField
          label="Start Date"
          value={startDate}
          active={activePicker === "start"}
          onPress={() => togglePicker("start")}
        />
        <DateField
          label="End Date"
          value={endDate}
          active={activePicker === "end"}
          onPress={() => togglePicker("end")}
        />
      </View>

      {/* iOS inline calendar — shared between both fields */}
      {Platform.OS === "ios" && activePicker !== null && (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          display="inline"
          minimumDate={pickerMinDate}
          onChange={handleDateChange}
          style={{ marginBottom: 8 }}
        />
      )}

      {/* Android native dialog picker */}
      {Platform.OS === "android" && activePicker !== null && (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          minimumDate={pickerMinDate}
          onChange={handleDateChange}
        />
      )}

      {/* Spacer between date section and type selector */}
      <View className="mb-4" />

      {/* Type selector */}
      <StyledText variant="label" className="mb-1.5">
        Type
      </StyledText>
      <View className="flex-row gap-2 mb-4">
        {REQUEST_TYPES.map((t) => (
          <Pressable
            key={t.value}
            onPress={() => setRequestType(t.value)}
            className={`flex-1 py-2.5 rounded-md items-center border ${
              requestType === t.value
                ? "bg-primary border-primary"
                : "bg-background border-border"
            }`}
          >
            <StyledText
              variant="label"
              className={
                requestType === t.value
                  ? "text-primary-foreground"
                  : "text-muted-foreground"
              }
            >
              {t.label}
            </StyledText>
          </Pressable>
        ))}
      </View>

      {/* Reason */}
      <StyledText variant="label" className="mb-1.5">
        Reason (optional)
      </StyledText>
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="E.g., doctor's appointment..."
        multiline
        numberOfLines={3}
        className="bg-background text-foreground border border-border rounded-md px-3 py-3 text-base mb-5"
        placeholderTextColor="#78716c"
        textAlignVertical="top"
      />

      <Button
        title="Submit Request"
        onPress={handleSubmit}
        loading={submitting}
        size="lg"
      />
    </BottomSheet>
  );
}

interface DateFieldProps {
  label: string;
  value: Date;
  active: boolean;
  onPress: () => void;
}

function DateField({ label, value, active, onPress }: DateFieldProps) {
  return (
    <View className="flex-1">
      <StyledText variant="label" className="mb-1.5">
        {label}
      </StyledText>
      <Pressable
        onPress={onPress}
        className={`flex-row items-center justify-between bg-background border rounded-md px-3 py-3 ${
          active ? "border-primary" : "border-border"
        }`}
      >
        <StyledText variant="body">{formatDate(value)}</StyledText>
        <IconSymbol
          name="calendar"
          size={16}
          color={active ? "#e8630a" : "#78716c"}
        />
      </Pressable>
    </View>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
