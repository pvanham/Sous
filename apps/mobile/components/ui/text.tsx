import { Text as RNText } from "react-native";

type TextVariant = "title" | "subtitle" | "body" | "caption" | "label";

interface StyledTextProps {
  children: React.ReactNode;
  variant?: TextVariant;
  className?: string;
}

const VARIANT_CLASSES: Record<TextVariant, string> = {
  title: "text-2xl font-bold text-foreground",
  subtitle: "text-lg font-semibold text-foreground",
  body: "text-base text-foreground",
  caption: "text-xs text-muted-foreground",
  label: "text-sm font-medium text-foreground",
};

/**
 * Design-system text component. Defaults to `body` variant.
 * Append extra Tailwind classes via the `className` prop.
 */
export function StyledText({
  children,
  variant = "body",
  className = "",
}: StyledTextProps) {
  return (
    <RNText className={`${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </RNText>
  );
}
