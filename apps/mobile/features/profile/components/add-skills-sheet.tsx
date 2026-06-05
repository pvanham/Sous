import { useEffect, useMemo, useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";

const ICON_COLOR = "#78716c";
const STAR_FILLED_COLOR = "#f59e0b";
const STAR_EMPTY_COLOR = "#d6d3d1";

interface AddSkillsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Full station catalogue for the location (from GET /me/stations). */
  availableStations: string[];
  /** Stations the staff member already holds (excluded from the list). */
  activeStations: Set<string>;
  /** Stations with an open addition request (excluded from the list). */
  pendingStations: Set<string>;
  /**
   * Propose the chosen station + proficiency. Must throw to surface a
   * server error inside the sheet; on success the sheet closes.
   */
  onSubmit: (input: { station: string; proficiency: number }) => Promise<void>;
}

/**
 * "Add skills" bottom sheet. The staff member picks a station from the
 * chip selector (mirrors onboarding), sets a proficiency, and submits
 * it for manager approval. The proposed skill is not active until the
 * manager approves it — the sheet copy makes that explicit.
 */
export function AddSkillsSheet({
  visible,
  onClose,
  availableStations,
  activeStations,
  pendingStations,
  onSubmit,
}: AddSkillsSheetProps) {
  const [station, setStation] = useState<string | null>(null);
  const [proficiency, setProficiency] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const selectable = useMemo(
    () =>
      availableStations.filter(
        (s) => !activeStations.has(s) && !pendingStations.has(s),
      ),
    [availableStations, activeStations, pendingStations],
  );

  useEffect(() => {
    if (visible) {
      setStation(null);
      setProficiency(3);
      setServerError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const canSubmit = station !== null && !submitting;

  const handleSubmit = async () => {
    if (station === null || submitting) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await onSubmit({ station, proficiency });
      onClose();
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Could not submit the skill.",
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
        <StyledText variant="subtitle">Add skills</StyledText>
        <View className="w-14" />
      </View>

      <StyledText variant="caption" className="mb-3 text-sm">
        Pick a station and your skill level. Your manager approves new
        skills before they count toward scheduling.
      </StyledText>

      {selectable.length === 0 ? (
        <View className="bg-background border border-border rounded-md px-4 py-5">
          <StyledText variant="caption" className="text-sm">
            You&apos;ve already added or proposed every station your kitchen
            offers. Check back if your manager adds new stations.
          </StyledText>
        </View>
      ) : (
        <>
          <ScrollView
            className="max-h-44"
            contentContainerClassName="flex-row flex-wrap gap-2 pb-1"
            keyboardShouldPersistTaps="handled"
          >
            {selectable.map((s) => {
              const selected = s === station;
              return (
                <Pressable
                  key={s}
                  onPress={() => setStation(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`flex-row items-center rounded-full px-4 py-2 border active:opacity-80 ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card"
                  }`}
                >
                  <StyledText variant="body" className="text-sm">
                    {s}
                  </StyledText>
                  {selected ? (
                    <View className="ml-2">
                      <MaterialIcons name="check" size={16} color="#3f6212" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {station !== null ? (
            <View className="mt-5">
              <StyledText variant="label" className="mb-2 text-sm font-semibold">
                Proficiency
              </StyledText>
              <ProficiencyPicker value={proficiency} onChange={setProficiency} />
            </View>
          ) : null}

          {serverError ? (
            <View className="border border-destructive rounded-md px-3 py-2 mt-3">
              <StyledText
                variant="caption"
                className="text-destructive text-sm"
              >
                {serverError}
              </StyledText>
            </View>
          ) : null}

          <Button
            title="Send for approval"
            onPress={handleSubmit}
            loading={submitting}
            disabled={!canSubmit}
            size="lg"
            className="mt-4"
          />
        </>
      )}
    </BottomSheet>
  );
}

function ProficiencyPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <View className="flex-row">
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable
          key={i}
          onPress={() => onChange(i)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Set proficiency to ${i}`}
          className="pr-1.5 active:opacity-70"
        >
          <MaterialIcons
            name={i <= value ? "star" : "star-border"}
            size={30}
            color={i <= value ? STAR_FILLED_COLOR : STAR_EMPTY_COLOR}
          />
        </Pressable>
      ))}
    </View>
  );
}
