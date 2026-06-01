import { useEffect } from "react";
import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface ToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

// Compact, fixed-size track so two toggles sit side-by-side in a
// narrow column without the overlap the native <Switch> caused on
// Android (its intrinsic width is ~12pt wider than iOS).
const TRACK_WIDTH = 46;
const TRACK_HEIGHT = 28;
const THUMB_SIZE = 22;
const TRACK_PADDING = 3;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - TRACK_PADDING * 2;

const THUMB_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.18,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
  elevation: 2,
} as const;

/**
 * Themed on/off switch used across the app in place of the platform
 * `<Switch>`. The track colour follows the warm-industrial palette
 * (rust `primary` when on, `input` grey when off) and adapts to dark
 * mode through NativeWind CSS variables, while the thumb position is
 * animated with Reanimated so the slide feels native on both
 * platforms.
 */
export function Toggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: ToggleProps) {
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 160 });
  }, [value, progress]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * THUMB_TRAVEL }],
  }));

  return (
    <Pressable
      onPress={() => {
        if (!disabled) onValueChange(!value);
      }}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={{ width: TRACK_WIDTH, height: TRACK_HEIGHT, padding: TRACK_PADDING }}
      className={`justify-center rounded-full active:opacity-90 ${
        value ? "bg-primary" : "bg-input"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <Animated.View
        style={[
          { width: THUMB_SIZE, height: THUMB_SIZE, ...THUMB_SHADOW },
          thumbStyle,
        ]}
        className="rounded-full bg-white"
      />
    </Pressable>
  );
}
