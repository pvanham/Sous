import { View, Modal, FlatList, Pressable } from "react-native";
import type { StaffDTO } from "@sous/types";
import { StyledText } from "@/components/ui/text";

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
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable className="flex-1" onPress={onClose} />
        <View className="bg-card border-t border-border rounded-t-2xl px-4 pt-4 pb-8 max-h-[60%]">
          <View className="w-10 h-1 bg-border rounded-full self-center mb-4" />

          <StyledText variant="subtitle" className="mb-1">
            Shift Roster
          </StyledText>
          <StyledText variant="caption" className="mb-4">
            {shiftLabel}
          </StyledText>

          {loading ? (
            <StyledText variant="body" className="text-muted-foreground py-8 text-center">
              Loading roster...
            </StyledText>
          ) : (
            <FlatList
              data={roster}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View className="flex-row items-center py-3 border-b border-border">
                  <View className="w-9 h-9 rounded-full bg-secondary items-center justify-center mr-3">
                    <StyledText variant="label" className="text-secondary-foreground text-xs">
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
                <StyledText variant="body" className="text-muted-foreground py-8 text-center">
                  No roster data available.
                </StyledText>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
