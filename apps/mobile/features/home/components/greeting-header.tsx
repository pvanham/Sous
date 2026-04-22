import { View, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { StyledText } from "@/components/ui/text";

interface GreetingHeaderProps {
  firstName: string | null | undefined;
  initials: string;
  onSignOut: () => void;
}

/**
 * Top-of-screen greeting row. Pairs a time-of-day salutation with the
 * user's first name and today's date so the first thing staff see when
 * they open the app is something warm and grounded in the current
 * moment, not just an abstract "Welcome back" label.
 *
 * The right side carries the user's initials avatar and a quiet
 * sign-out affordance. Avatar rendering is intentionally initials-only
 * (no remote image) so the header renders instantly and doesn't
 * flicker while Clerk's user object is loading.
 */
export function GreetingHeader({
  firstName,
  initials,
  onSignOut,
}: GreetingHeaderProps) {
  const now = new Date();
  const greeting = getGreeting(now);
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <View className="flex-row justify-between items-start mb-5 mt-1">
      <View className="flex-1 pr-3">
        <StyledText variant="caption" className="uppercase tracking-wider">
          {dateLabel}
        </StyledText>
        <StyledText variant="title" className="mt-1 text-2xl">
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </StyledText>
      </View>

      <View className="flex-row items-center gap-2">
        <View className="w-11 h-11 rounded-full bg-primary items-center justify-center">
          <StyledText
            variant="label"
            className="text-primary-foreground text-sm"
          >
            {initials}
          </StyledText>
        </View>
        <Pressable
          onPress={onSignOut}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          className="w-11 h-11 rounded-full bg-card border border-border items-center justify-center active:opacity-60"
        >
          <MaterialIcons name="logout" size={20} color="#78716c" />
        </Pressable>
      </View>
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
