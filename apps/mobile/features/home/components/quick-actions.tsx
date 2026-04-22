import { View, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { StyledText } from "@/components/ui/text";

/**
 * Row of tappable shortcuts to the other tabs, so staff can jump
 * straight from the home hub to the actions they actually came to
 * perform (browse schedule, pick up a shift, request time off).
 *
 * Mirroring the bottom tab bar here might seem redundant, but on a
 * tall phone the thumb reach between the top hero card and the
 * bottom tab bar is non-trivial — these shortcuts put the same
 * affordances within reach while scrolling the hub.
 */
export function QuickActions() {
  const router = useRouter();

  return (
    <View className="mt-6">
      <StyledText variant="subtitle" className="mb-3">
        Quick actions
      </StyledText>
      <View className="flex-row gap-3">
        <ActionTile
          icon="calendar-today"
          label="Schedule"
          onPress={() => router.navigate("/(tabs)/schedule")}
        />
        <ActionTile
          icon="swap-horiz"
          label="Exchange"
          onPress={() => router.navigate("/(tabs)/exchange")}
        />
        <ActionTile
          icon="event-available"
          label="Time off"
          onPress={() => router.navigate("/(tabs)/time-off")}
        />
      </View>
    </View>
  );
}

interface ActionTileProps {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  onPress: () => void;
}

function ActionTile({ icon, label, onPress }: ActionTileProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 bg-card border border-border rounded-md p-4 items-center active:opacity-70"
    >
      <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center mb-2">
        <MaterialIcons name={icon} size={20} color="#b45309" />
      </View>
      <StyledText variant="label" className="text-xs">
        {label}
      </StyledText>
    </Pressable>
  );
}
