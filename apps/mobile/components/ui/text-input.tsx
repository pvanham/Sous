import { forwardRef } from "react";
import { TextInput as RNTextInput } from "react-native";
import type { TextInputProps } from "react-native";

export type AppTextInputProps = TextInputProps & { className?: string };

// NativeWind's `text-*` utilities compile to BOTH a fontSize and a
// lineHeight (`text-base` -> { fontSize: 16, lineHeight: 24 }). On iOS a
// lineHeight set on a TextInput makes the native editor clip descenders
// (g, y, p, j, q) while the field is focused — the value renders fine when
// blurred, which is why it looks centered until you start typing.
//
// We can't correct this through the `style` prop: react-native-css maps
// TextInput's className to the string "style" target, and its prop merge
// (mergeDefinedProps) overwrites — rather than merges — the `style` key, so
// any inline style we pass wipes out the className-derived background and
// border. Instead we swap the `text-base` size token for the arbitrary
// `text-[16px]`, which sets the font size WITHOUT a lineHeight and lets the
// field fall back to the font's natural metrics.
const TEXT_BASE_PATTERN = /\btext-base\b/g;
const FONT_SIZE_ONLY_CLASS = "text-[16px]";

/**
 * Drop-in replacement for React Native's TextInput that fixes the iOS
 * descender-clipping bug (see note above). Every input in the app should
 * use this instead of the bare React Native `TextInput`.
 */
export const AppTextInput = forwardRef<RNTextInput, AppTextInputProps>(
  function AppTextInput({ className, ...props }, ref) {
    const fixedClassName = className?.replace(
      TEXT_BASE_PATTERN,
      FONT_SIZE_ONLY_CLASS,
    );
    return <RNTextInput ref={ref} className={fixedClassName} {...props} />;
  },
);
