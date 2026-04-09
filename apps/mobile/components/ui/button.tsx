import { Pressable, ActivityIndicator } from "react-native";
import { StyledText } from "./text";

type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  destructive: "bg-destructive",
  ghost: "bg-transparent",
};

const VARIANT_TEXT_CLASSES: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  destructive: "text-destructive-foreground",
  ghost: "text-foreground",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 rounded-sm",
  md: "px-4 py-2.5 rounded-md",
  lg: "px-6 py-3.5 rounded-md",
};

const SIZE_TEXT_CLASSES: Record<ButtonSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

/**
 * Themed pressable button with variant and size support.
 * Shows an ActivityIndicator while `loading` is true.
 */
export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`flex-row items-center justify-center ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${isDisabled ? "opacity-50" : "active:opacity-80"} ${className}`}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "ghost" ? undefined : "#fff"}
          className="mr-2"
        />
      ) : null}
      <StyledText
        variant="label"
        className={`${VARIANT_TEXT_CLASSES[variant]} ${SIZE_TEXT_CLASSES[size]} font-semibold`}
      >
        {title}
      </StyledText>
    </Pressable>
  );
}
