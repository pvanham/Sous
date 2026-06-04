import { useEffect, type ReactNode } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * Optional NativeWind max-height class to apply to the sheet card
   * (e.g. `max-h-[60%]`). Defaults to `max-h-[90%]`.
   */
  maxHeightClassName?: string;
  /**
   * Set when the sheet contains its own scrollable child (e.g. a
   * `FlatList`). The swipe-to-dismiss Pan gesture is then confined to the
   * drag handle so it no longer intercepts the list's scroll touches.
   */
  scrollable?: boolean;
}

// Drag far enough down, OR flick fast enough, and we dismiss. Values
// tuned for a typical 56pt sheet header; they match the feel of
// system bottom-sheets on iOS (InstagramStories-like).
const DISMISS_TRANSLATION = 100;
const DISMISS_VELOCITY = 800;

/**
 * Swipe-to-dismiss bottom sheet. Wraps a native `<Modal>` with a pan
 * gesture so users can drag the card down to close, while still
 * supporting a tap on the dim backdrop to dismiss.
 *
 * RN's `<Modal>` renders into a separate native view tree, so the
 * app-root `<GestureHandlerRootView>` (in `app/_layout.tsx`) does NOT
 * cover it. We therefore mount a dedicated `<GestureHandlerRootView>`
 * inside the modal so gestures actually fire on the sheet content.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  maxHeightClassName = "max-h-[90%]",
  scrollable = false,
}: BottomSheetProps) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
    }
  }, [visible, translateY]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (
        e.translationY > DISMISS_TRANSLATION ||
        e.velocityY > DISMISS_VELOCITY
      ) {
        translateY.value = withTiming(600, { duration: 180 }, () => {
          runOnJS(onClose)();
        });
      } else {
        translateY.value = withTiming(0, { duration: 160 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View className="flex-1 justify-end">
            <Pressable className="flex-1" onPress={onClose} />
            <Animated.View
              style={animatedStyle}
              className={`bg-card border-t border-border rounded-t-2xl px-4 pt-4 pb-8 ${maxHeightClassName}`}
            >
              {scrollable ? (
                <>
                  {/*
                   * Scrollable content (e.g. a FlatList) must own its own
                   * vertical drags, so the dismiss Pan gesture is bound to
                   * the handle alone rather than the whole card.
                   */}
                  <GestureDetector gesture={panGesture}>
                    <View className="pt-1 pb-4">
                      <View className="w-10 h-1 bg-border rounded-full self-center" />
                    </View>
                  </GestureDetector>
                  {children}
                </>
              ) : (
                <GestureDetector gesture={panGesture}>
                  {/*
                   * Tapping anywhere inside the sheet (outside a focused
                   * TextInput) dismisses the keyboard without closing
                   * the sheet — this is what users reach for when the
                   * whole form is visible above the keyboard. We keep
                   * `accessible={false}` so the wrapper itself doesn't
                   * become a screen-reader target.
                   */}
                  <TouchableWithoutFeedback
                    onPress={Keyboard.dismiss}
                    accessible={false}
                  >
                    <View>
                      <View className="w-10 h-1 bg-border rounded-full self-center mb-4" />
                      {children}
                    </View>
                  </TouchableWithoutFeedback>
                </GestureDetector>
              )}
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}
