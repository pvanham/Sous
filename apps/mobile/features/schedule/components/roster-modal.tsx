import { View, FlatList } from "react-native";
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
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      maxHeightClassName="max-h-[60%]"
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
          renderItem={({ item }) => (
            <View className="flex-row items-center py-3 border-b border-border">
              <View className="w-9 h-9 rounded-full bg-secondary items-center justify-center mr-3">
                <StyledText
                  variant="label"
                  className="text-secondary-foreground text-xs"
                >
                  {item.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </StyledText>
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
