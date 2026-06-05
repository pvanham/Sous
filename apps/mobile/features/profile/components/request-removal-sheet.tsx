import { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { AppTextInput } from "@/components/ui/text-input";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";

const PLACEHOLDER_COLOR = "#a8a29e";
const MAX_REASON_LENGTH = 500;

interface RequestRemovalSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Station being removed; `null` keeps the sheet closed. */
  station: string | null;
  /**
   * Submit the removal request with a reason. Must throw to surface a
   * server error inside the sheet; on success the sheet closes.
   */
  onSubmit: (reason: string) => Promise<void>;
}

/**
 * Removal-reason sheet. Asks for a short reason (e.g. injury, no longer
 * working this station) before queuing a removal request for manager
 * approval. The skill stays active until the manager approves.
 */
export function RequestRemovalSheet({
  visible,
  onClose,
  station,
  onSubmit,
}: RequestRemovalSheetProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setReason("");
      setServerError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setServerError(
        err instanceof Error
          ? err.message
          : "Could not submit the removal request.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={submitting ? () => {} : onClose}>
      <View className="flex-row items-center justify-between mb-4">
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          disabled={submitting}
        >
          <StyledText variant="body" className="text-muted-foreground text-base">
            Cancel
          </StyledText>
        </Pressable>
        <StyledText variant="subtitle">Request removal</StyledText>
        <View className="w-14" />
      </View>

      <StyledText variant="caption" className="mb-3 text-sm">
        Tell your manager why you want to drop{" "}
        <StyledText variant="caption" className="text-sm font-semibold">
          {station ?? "this station"}
        </StyledText>
        . It stays active until they approve the removal.
      </StyledText>

      <AppTextInput
        value={reason}
        onChangeText={setReason}
        placeholder="e.g. Injury, no longer working this station"
        placeholderTextColor={PLACEHOLDER_COLOR}
        autoFocus
        multiline
        maxLength={MAX_REASON_LENGTH}
        editable={!submitting}
        className="bg-background text-foreground border border-border rounded-md px-4 py-3 text-base min-h-[88px]"
        style={{ textAlignVertical: "top" }}
      />

      {serverError ? (
        <View className="border border-destructive rounded-md px-3 py-2 mt-3">
          <StyledText variant="caption" className="text-destructive text-sm">
            {serverError}
          </StyledText>
        </View>
      ) : null}

      <Button
        title="Send request"
        onPress={handleSubmit}
        loading={submitting}
        disabled={!canSubmit}
        size="lg"
        className="mt-4"
      />
    </BottomSheet>
  );
}
