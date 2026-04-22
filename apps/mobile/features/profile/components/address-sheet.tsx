import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import { View, TextInput, Pressable, ScrollView } from "react-native";
import type { StaffAddress } from "@sous/types";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";

const PLACEHOLDER_COLOR = "#a8a29e";

interface AddressSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Current address on the Staff record. `null` / `undefined` means
   * the staff member has no address saved; the form renders all
   * fields empty so they can enter one for the first time.
   */
  initialValue: StaffAddress | null | undefined;
  /**
   * Called when the user taps Update. Receives the structured
   * address, or `null` if every field was cleared (the route treats
   * `null` as `$unset` so the record goes back to "no address").
   */
  onSubmit: (value: StaffAddress | null) => Promise<void>;
}

type FormState = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
};

const EMPTY_FORM: FormState = {
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
};

function toForm(address: StaffAddress | null | undefined): FormState {
  if (!address) return EMPTY_FORM;
  return {
    line1: address.line1 ?? "",
    line2: address.line2 ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    postalCode: address.postalCode ?? "",
  };
}

/**
 * Grouped editor for the five address fields. Opens when the Address
 * row on the profile screen is tapped. Unlike `EditFieldSheet`, the
 * entire record is replaced in one patch — partial field edits don't
 * make sense for an address.
 *
 * Clearing every required field and tapping Update submits `null`,
 * which the PATCH route translates to `$unset`.
 */
export function AddressSheet({
  visible,
  onClose,
  initialValue,
  onSubmit,
}: AddressSheetProps) {
  const [form, setForm] = useState<FormState>(() => toForm(initialValue));
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setForm(toForm(initialValue));
      setServerError(null);
      setSubmitting(false);
    }
  }, [visible, initialValue]);

  const initialForm = toForm(initialValue);
  const dirty = (Object.keys(form) as (keyof FormState)[]).some(
    (key) => form[key].trim() !== initialForm[key].trim(),
  );

  const trimmed: FormState = {
    line1: form.line1.trim(),
    line2: form.line2.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    postalCode: form.postalCode.trim(),
  };

  // "Clear" path: user blanked out every field. Submitting sends
  // `null` so the server unsets the address.
  const allEmpty =
    !trimmed.line1 &&
    !trimmed.line2 &&
    !trimmed.city &&
    !trimmed.state &&
    !trimmed.postalCode;

  // Any non-empty field means the user intends to save an address;
  // enforce that the required pieces are present before enabling
  // the button.
  const missingRequired =
    !allEmpty &&
    (!trimmed.line1 ||
      !trimmed.city ||
      trimmed.state.length < 2 ||
      !trimmed.postalCode);

  const canSubmit = dirty && !missingRequired && !submitting;

  const setField = (key: keyof FormState) => (next: string) => {
    setForm((prev) => ({ ...prev, [key]: next }));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const payload: StaffAddress | null = allEmpty
        ? null
        : {
            line1: trimmed.line1,
            line2: trimmed.line2 || undefined,
            city: trimmed.city,
            state: trimmed.state.toUpperCase(),
            postalCode: trimmed.postalCode,
          };
      await onSubmit(payload);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save your address.";
      setServerError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (submitting) return;
    onClose();
  };

  const displayedError =
    serverError ?? (missingRequired ? "Fill street, city, state, and ZIP." : null);

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
        <StyledText variant="subtitle">Address</StyledText>
        <View className="w-14" />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SheetField
          label="Street address"
          value={form.line1}
          onChangeText={setField("line1")}
          autoCapitalize="words"
          autoComplete="street-address"
          textContentType="fullStreetAddress"
          placeholder="123 Main St"
        />
        <SheetField
          label="Apt / suite"
          value={form.line2}
          onChangeText={setField("line2")}
          autoCapitalize="words"
          placeholder="Optional"
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <SheetField
              label="City"
              value={form.city}
              onChangeText={setField("city")}
              autoCapitalize="words"
              autoComplete="postal-address-locality"
              placeholder="City"
            />
          </View>
          <View className="w-24">
            <SheetField
              label="State"
              value={form.state}
              onChangeText={setField("state")}
              autoCapitalize="characters"
              autoComplete="postal-address-region"
              maxLength={3}
              placeholder="NY"
            />
          </View>
        </View>
        <SheetField
          label="ZIP / postal code"
          value={form.postalCode}
          onChangeText={setField("postalCode")}
          keyboardType="number-pad"
          autoComplete="postal-code"
          textContentType="postalCode"
          maxLength={10}
          placeholder="10001"
        />

        {displayedError ? (
          <View className="border border-destructive rounded-md px-3 py-2 mt-1 mb-2">
            <StyledText variant="caption" className="text-destructive text-sm">
              {displayedError}
            </StyledText>
          </View>
        ) : null}

        <Button
          title={allEmpty && initialValue ? "Remove address" : "Update"}
          onPress={handleSubmit}
          loading={submitting}
          disabled={!canSubmit}
          size="lg"
          className="mt-3"
        />
      </ScrollView>
    </BottomSheet>
  );
}

interface SheetFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  autoCapitalize?: ComponentProps<typeof TextInput>["autoCapitalize"];
  autoComplete?: ComponentProps<typeof TextInput>["autoComplete"];
  textContentType?: ComponentProps<typeof TextInput>["textContentType"];
  keyboardType?: ComponentProps<typeof TextInput>["keyboardType"];
  maxLength?: number;
}

function SheetField({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize = "sentences",
  autoComplete,
  textContentType,
  keyboardType,
  maxLength,
}: SheetFieldProps) {
  return (
    <View className="mb-3">
      <StyledText variant="label" className="mb-1.5">
        {label}
      </StyledText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER_COLOR}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType={textContentType}
        keyboardType={keyboardType}
        maxLength={maxLength}
        className="bg-background text-foreground border border-border rounded-md px-4 py-3 text-base"
      />
    </View>
  );
}
