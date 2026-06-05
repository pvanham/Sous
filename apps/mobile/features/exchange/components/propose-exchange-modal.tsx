import { useEffect, useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { AppTextInput } from "@/components/ui/text-input";
import type { ShiftDTO } from "@sous/types";
import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";

interface ProposeExchangeModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: { shiftId: string; reason?: string }) => void;
  submitting: boolean;
  shifts: ShiftDTO[];
  loading: boolean;
}

/**
 * Bottom-sheet form for proposing a shift exchange (dropping one of
 * the caller's upcoming shifts onto the exchange board). Mirrors the
 * look of the time-off request modal: picker + optional reason +
 * primary submit button.
 */
export function ProposeExchangeModal({
  visible,
  onClose,
  onSubmit,
  submitting,
  shifts,
  loading,
}: ProposeExchangeModalProps) {
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (visible) {
      setSelectedShiftId(null);
      setReason("");
    }
  }, [visible]);

  const handleSubmit = () => {
    if (!selectedShiftId) return;
    onSubmit({
      shiftId: selectedShiftId,
      reason: reason.trim() || undefined,
    });
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <StyledText variant="subtitle" className="mb-5">
        Propose Shift Exchange
      </StyledText>

      <StyledText variant="label" className="mb-1.5">
        Shift to Drop
      </StyledText>

      {loading ? (
        <View className="py-6 items-center">
          <StyledText variant="body" className="text-muted-foreground">
            Loading upcoming shifts...
          </StyledText>
        </View>
      ) : shifts.length === 0 ? (
        <View className="py-6 items-center">
          <StyledText variant="body" className="text-muted-foreground">
            No upcoming shifts to drop.
          </StyledText>
        </View>
      ) : (
        <ScrollView
          className="max-h-64 mb-4"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-2">
            {shifts.map((shift) => {
              const selected = selectedShiftId === shift.id;
              const start = new Date(shift.start);
              const end = new Date(shift.end);
              return (
                <Pressable
                  key={shift.id}
                  onPress={() => setSelectedShiftId(shift.id)}
                  className={`rounded-md border px-3 py-3 ${
                    selected
                      ? "bg-primary border-primary"
                      : "bg-background border-border"
                  }`}
                >
                  <StyledText
                    variant="label"
                    className={
                      selected
                        ? "text-primary-foreground"
                        : "text-foreground"
                    }
                  >
                    {formatDateLabel(start)}
                  </StyledText>
                  <StyledText
                    variant="caption"
                    className={
                      selected
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    }
                  >
                    {formatTime(start)} – {formatTime(end)} · {shift.station}
                  </StyledText>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      <StyledText variant="label" className="mb-1.5">
        Reason (optional)
      </StyledText>
      <AppTextInput
        value={reason}
        onChangeText={setReason}
        placeholder="Optional — let the team know why"
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
        disabled={!selectedShiftId}
        size="lg"
      />
    </BottomSheet>
  );
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
