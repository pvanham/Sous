import { View } from "react-native";
import { StyledText } from "@/components/ui/text";

interface AnnouncementEmptyStateProps {
  loading: boolean;
  error: boolean;
  emptyCopy?: string;
}

export function AnnouncementEmptyState({
  loading,
  error,
  emptyCopy = "No announcements right now.",
}: AnnouncementEmptyStateProps) {
  let message = emptyCopy;

  if (error) {
    message = "Couldn't load announcements.";
  } else if (loading) {
    message = "Loading announcements...";
  }

  return (
    <View className="bg-card border border-border rounded-md p-6 items-center">
      <StyledText variant="body" className="text-muted-foreground text-center">
        {message}
      </StyledText>
    </View>
  );
}
