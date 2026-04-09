import { useState } from "react";
import { View, Modal, Pressable, TextInput, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
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
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

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
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          className="flex-1"
          onPress={() => {
            resetForm();
            onClose();
          }}
        />
        <View className="bg-card border-t border-border rounded-t-2xl px-4 pt-4 pb-8">
          <View className="w-10 h-1 bg-border rounded-full self-center mb-4" />

          <StyledText variant="subtitle" className="mb-5">
            New Time Off Request
          </StyledText>

          {/* Date pickers */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <StyledText variant="label" className="mb-1.5">
                Start Date
              </StyledText>
              <Pressable
                onPress={() => setShowStartPicker(true)}
                className="bg-background border border-border rounded-md px-3 py-3"
              >
                <StyledText variant="body">
                  {formatDate(startDate)}
                </StyledText>
              </Pressable>
              {showStartPicker && (
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  minimumDate={new Date()}
                  onChange={(_, date) => {
                    setShowStartPicker(Platform.OS === "ios");
                    if (date) {
                      setStartDate(date);
                      if (date > endDate) setEndDate(date);
                    }
                  }}
                />
              )}
            </View>
            <View className="flex-1">
              <StyledText variant="label" className="mb-1.5">
                End Date
              </StyledText>
              <Pressable
                onPress={() => setShowEndPicker(true)}
                className="bg-background border border-border rounded-md px-3 py-3"
              >
                <StyledText variant="body">
                  {formatDate(endDate)}
                </StyledText>
              </Pressable>
              {showEndPicker && (
                <DateTimePicker
                  value={endDate}
                  mode="date"
                  minimumDate={startDate}
                  onChange={(_, date) => {
                    setShowEndPicker(Platform.OS === "ios");
                    if (date) setEndDate(date);
                  }}
                />
              )}
            </View>
          </View>

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
        </View>
      </View>
    </Modal>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
