import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StyledText } from "@/components/ui/text";

const ICON_COLOR = "#78716c";

interface OnboardingHeaderProps {
  /** 1-indexed step number (`null` to hide the dots, e.g. on the welcome screen). */
  step: number | null;
  /** Total number of steps in the wizard. */
  totalSteps: number;
  /** When false, the back chevron isn't rendered (e.g. on welcome / done). */
  canGoBack?: boolean;
}

/**
 * Shared header for every wizard step. Renders a back chevron on the
 * left (when allowed) and a row of progress dots on the right so the
 * user always sees how far through they are.
 *
 * Lives in the onboarding feature rather than `components/ui/`
 * because it bakes in `expo-router` navigation — moving it into the
 * shared UI directory would couple `components/ui/` to navigation.
 */
export function OnboardingHeader({
  step,
  totalSteps,
  canGoBack = true,
}: OnboardingHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    }
  };

  return (
    <View
      style={{ paddingTop: insets.top }}
      className="bg-background border-b border-border"
    >
      <View className="flex-row items-center justify-between px-4 py-2 min-h-[44px]">
        <View className="w-10">
          {canGoBack && router.canGoBack() ? (
            <Pressable
              onPress={handleBack}
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
            {Array.from({ length: totalSteps }, (_, i) => (
              <View
                key={i}
                className={`h-1.5 w-6 rounded-full ${
                  i < step ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
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
