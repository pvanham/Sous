import { View } from "react-native";
import { StyledText } from "@/components/ui/text";

interface GreetingHeaderProps {
  firstName: string | null | undefined;
}

/**
 * Top-of-screen greeting row. Pairs a time-of-day salutation with the
 * user's first name and today's date so the first thing staff see when
 * they open the app is something warm and grounded in the current
 * moment, not just an abstract "Welcome back" label.
 *
 * The avatar and sign-out affordance live in the persistent `AppHeader`
 * rendered by the (tabs) layout, so they're intentionally not repeated
 * here.
 */
export function GreetingHeader({ firstName }: GreetingHeaderProps) {
  const now = new Date();
  const greeting = getGreeting(now);
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <View className="mb-5 mt-1">
      <StyledText variant="caption" className="uppercase tracking-wider">
        {dateLabel}
      </StyledText>
      <StyledText variant="title" className="mt-1 text-2xl">
        {greeting}
        {firstName ? `, ${firstName}` : ""}
      </StyledText>
    </View>
  );
}

/** Time-of-day salutation. Breakpoints match the common morning /
 * afternoon / evening buckets most kitchens run on. */
function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
