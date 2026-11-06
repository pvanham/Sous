import { View } from "react-native";
import { StyledText } from "./text";
import { Button } from "./button";

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}

/**
 * Inline load-failure state with a retry button. Keep this separate from
 * empty-state copy so a failed request never reads as "nothing here".
 */
export function ErrorState({
  message,
  onRetry,
  retrying = false,
  className = "",
}: ErrorStateProps) {
  return (
    <View className={`items-center px-4 py-12 ${className}`}>
      <StyledText variant="body" className="mb-3 text-center text-muted-foreground">
        {message}
      </StyledText>
      <Button
        title="Try again"
        variant="secondary"
        onPress={onRetry}
        loading={retrying}
      />
    </View>
  );
}
