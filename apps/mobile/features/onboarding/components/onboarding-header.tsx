import { View, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StyledText } from "@/components/ui/text";
import { ONBOARDING_STEPS, type OnboardingStepId } from "../lib/steps";
import { useOnboardingNav } from "../use-onboarding-nav";

const ICON_COLOR = "#78716c";

/** Data-entry steps (welcome / done excluded) paired with their list index. */
const DATA_STEPS = ONBOARDING_STEPS.map((s, index) => ({ ...s, index })).filter(
  (s) => s.step !== null,
);

interface OnboardingHeaderProps {
  /** The step this header is rendered on. Drives the dots + back button. */
  currentStepId: OnboardingStepId;
}

/**
 * Shared header for every wizard step. Renders a back chevron on the
 * left (on data steps after the first) and a row of tappable progress
 * dots: the user can jump to any step they've already reached, which —
 * combined with the back chevron and each step's "Next" CTA — lets
 * them move freely backward and forward through the flow.
 *
 * Lives in the onboarding feature rather than `components/ui/` because
 * it bakes in wizard navigation.
 */
export function OnboardingHeader({ currentStepId }: OnboardingHeaderProps) {
  const insets = useSafeAreaInsets();
  const { step, totalSteps, canGoBack, furthestIndex, goBack, goToIndex } =
    useOnboardingNav(currentStepId);

  return (
    <View
      style={{ paddingTop: insets.top }}
      className="bg-background border-b border-border"
    >
      <View className="flex-row items-center justify-between px-4 py-2 min-h-[44px]">
        <View className="w-10">
          {canGoBack ? (
            <Pressable
              onPress={goBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back"
              className="w-10 h-10 items-center justify-center -ml-2 active:opacity-60"
            >
              <MaterialIcons name="arrow-back" size={22} color={ICON_COLOR} />
            </Pressable>
          ) : null}
        </View>

        {step !== null ? (
          <View className="flex-row gap-1.5">
            {DATA_STEPS.map((dataStep) => {
              const unlocked = dataStep.index <= furthestIndex;
              const filled = (dataStep.step ?? 0) <= step;
              const isCurrent = dataStep.step === step;
              return (
                <Pressable
                  key={dataStep.id}
                  onPress={() => goToIndex(dataStep.index)}
                  disabled={!unlocked || isCurrent}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to step ${dataStep.step}`}
                  accessibilityState={{
                    disabled: !unlocked,
                    selected: isCurrent,
                  }}
                  className="py-2"
                >
                  <View
                    className={`h-1.5 w-6 rounded-full ${
                      filled ? "bg-primary" : "bg-border"
                    } ${isCurrent ? "opacity-100" : unlocked ? "opacity-100" : "opacity-60"}`}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View />
        )}

        {step !== null ? (
          <StyledText variant="caption" className="w-10 text-right text-xs">
            {step}/{totalSteps}
          </StyledText>
        ) : (
          <View className="w-10" />
        )}
      </View>
    </View>
  );
}
