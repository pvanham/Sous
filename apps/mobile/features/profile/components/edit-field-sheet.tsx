import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import { View, TextInput, Pressable } from "react-native";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";

const PLACEHOLDER_COLOR = "#a8a29e";

interface EditFieldSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Section header rendered inside the sheet (e.g. "First name",
   * "Phone number"). The sheet has no standalone title — the label
   * doubles as one.
   */
  label: string;
  /** Current value. Used as the initial text; the sheet resets to
   * this every time `visible` flips from false to true so re-opening
   * never shows stale input from a previous edit. */
  initialValue: string;
  placeholder?: string;
  keyboardType?: ComponentProps<typeof TextInput>["keyboardType"];
  autoCapitalize?: ComponentProps<typeof TextInput>["autoCapitalize"];
  autoComplete?: ComponentProps<typeof TextInput>["autoComplete"];
  textContentType?: ComponentProps<typeof TextInput>["textContentType"];
  maxLength?: number;
  /**
   * Optional client-side validator. Return an error message string to
   * disable the Update button and surface the message, or `null` to
   * allow submission.
   */
  validate?: (value: string) => string | null;
  /**
   * Called when the user taps Update. Receives the trimmed value.
   * Must throw to surface a server error inside the sheet; on
   * success the sheet closes automatically.
   */
  onSubmit: (value: string) => Promise<void>;
}

/**
 * One-field editor rendered in a `BottomSheet`. Used for name, phone,
 * and any other single-input field on the profile screen. Slides up
 * when the associated read-only row is tapped and dismisses on
 * swipe-down, backdrop tap, Cancel, or successful Update.
 */
export function EditFieldSheet({
  visible,
  onClose,
  label,
  initialValue,
  placeholder,
  keyboardType,
  autoCapitalize = "sentences",
  autoComplete,
  textContentType,
  maxLength,
  validate,
  onSubmit,
}: EditFieldSheetProps) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      setServerError(null);
      setSubmitting(false);
    }
  }, [visible, initialValue]);

  const trimmed = value.trim();
  const clientError = validate ? validate(trimmed) : null;
  const dirty = trimmed !== initialValue.trim();
  const canSubmit = dirty && !clientError && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save your changes.";
      setServerError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (submitting) return;
    onClose();
  };

  const displayedError = serverError ?? (dirty ? clientError : null);

  return (
    <BottomSheet visible={visible} onClose={handleCancel}>
      <View className="flex-row items-center justify-between mb-4">
        <Pressable
          onPress={handleCancel}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          disabled={submitting}
        >
          <StyledText
            variant="body"
            className="text-muted-foreground text-base"
          >
            Cancel
          </StyledText>
        </Pressable>
        <StyledText variant="subtitle">{label}</StyledText>
        {/* Spacer so the label sits centered relative to the Cancel
            button. Width roughly matches "Cancel" at body size. */}
        <View className="w-14" />
      </View>

      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER_COLOR}
        autoFocus
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType={textContentType}
        keyboardType={keyboardType}
        maxLength={maxLength}
        editable={!submitting}
        className="bg-background text-foreground border border-border rounded-md px-4 py-3 text-base"
      />

      {displayedError ? (
        <View className="border border-destructive rounded-md px-3 py-2 mt-3">
          <StyledText variant="caption" className="text-destructive text-sm">
            {displayedError}
          </StyledText>
        </View>
      ) : null}

      <Button
        title="Update"
        onPress={handleSubmit}
        loading={submitting}
        disabled={!canSubmit}
        size="lg"
        className="mt-4"
      />
    </BottomSheet>
  );
}
