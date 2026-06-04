import { View, FlatList, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import type { StaffDTO } from "@sous/types";
import { StyledText } from "@/components/ui/text";
import { BottomSheet } from "@/components/ui/bottom-sheet";

interface RosterModalProps {
  visible: boolean;
  onClose: () => void;
  shiftLabel: string;
  roster: StaffDTO[];
  loading: boolean;
}

/**
 * Bottom-sheet-style modal showing everyone working a given shift.
 */
export function RosterModal({
  visible,
  onClose,
  shiftLabel,
  roster,
  loading,
}: RosterModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  // The sheet cap is 60% of screen. Reserve space for:
  // drag handle (20px) + top/bottom padding (48px) + header texts (~80px) = ~148px
  const listMaxHeight = windowHeight * 0.6 - 148;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      maxHeightClassName="max-h-[60%]"
      scrollable
    >
      <StyledText variant="subtitle" className="mb-1">
        Shift Roster
      </StyledText>
      <StyledText variant="caption" className="mb-4">
        {shiftLabel}
      </StyledText>

      {loading ? (
        <StyledText
          variant="body"
          className="text-muted-foreground py-8 text-center"
        >
          Loading roster...
        </StyledText>
      ) : (
        <FlatList
          data={roster}
          keyExtractor={(item) => item.id}
          style={{ maxHeight: listMaxHeight }}
          renderItem={({ item }) => (
            <View className="flex-row items-center py-3 border-b border-border">
              <View className="w-9 h-9 rounded-full bg-secondary items-center justify-center overflow-hidden mr-3">
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={{ width: 36, height: 36 }}
                    contentFit="cover"
                    transition={150}
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <StyledText
                    variant="label"
                    className="text-secondary-foreground text-xs"
                  >
                    {item.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </StyledText>
                )}
              </View>
              <View className="flex-1">
                <StyledText variant="label">{item.name}</StyledText>
                <StyledText variant="caption">
                  {item.roles.join(", ")}
                </StyledText>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <StyledText
              variant="body"
              className="text-muted-foreground py-8 text-center"
            >
              No roster data available.
            </StyledText>
          }
        />
      )}
    </BottomSheet>
  );
}
