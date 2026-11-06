import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { StyledText } from "@/components/ui/text";

interface AuthGateNoticeProps {
  title: string;
  message: string;
  onRetry: () => void;
  retrying: boolean;
  onSignOut: () => void;
}

/**
 * Full-screen hold state AuthGate shows when it can't decide where a
 * signed-in user belongs. The session stays intact; the user can retry
 * or sign out on their own terms.
 */
export function AuthGateNotice({
  title,
  message,
  onRetry,
  retrying,
  onSignOut,
}: AuthGateNoticeProps) {
  return (
    <View
      pointerEvents="auto"
      className="bg-background px-6"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <StyledText variant="subtitle" className="mb-2 text-center">
        {title}
      </StyledText>
      <StyledText variant="body" className="mb-6 text-center text-muted-foreground">
        {message}
      </StyledText>
      <Button
        title="Try again"
        onPress={onRetry}
        loading={retrying}
        className="mb-3 self-stretch"
      />
      <Button
        title="Sign out"
        variant="ghost"
        onPress={onSignOut}
        className="self-stretch"
      />
    </View>
  );
}
