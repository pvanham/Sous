import { useState, useMemo, useCallback } from "react";
import { View, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { ShiftDTO, StaffDTO } from "@sous/types";
import { ScreenWrapper } from "@/components/ui/screen-wrapper";
import { StyledText } from "@/components/ui/text";
import { WeeklyStrip } from "../components/weekly-strip";
import { ShiftCard } from "../components/shift-card";
import { RosterModal } from "../components/roster-modal";
import { fetchWeekShifts, fetchShiftRoster } from "../api";

export function ScheduleScreen() {
  const weekStart = useMemo(() => getWeekStart(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [rosterShift, setRosterShift] = useState<ShiftDTO | null>(null);
  const [roster, setRoster] = useState<StaffDTO[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const shiftsQuery = useQuery({
    queryKey: ["weekShifts", weekStart.toISOString()],
    queryFn: () => fetchWeekShifts(weekStart),
  });

  const shiftDates = useMemo(() => {
    const dates = new Set<string>();
    for (const shift of shiftsQuery.data ?? []) {
      dates.add(new Date(shift.start).toISOString().split("T")[0]);
    }
    return dates;
  }, [shiftsQuery.data]);

  const selectedIso = selectedDate.toISOString().split("T")[0];
  const dayShifts = useMemo(
    () =>
      (shiftsQuery.data ?? []).filter(
        (s) => new Date(s.start).toISOString().split("T")[0] === selectedIso
      ),
    [shiftsQuery.data, selectedIso]
  );

  const handleShiftPress = useCallback(async (shift: ShiftDTO) => {
    setRosterShift(shift);
    setRosterLoading(true);
    try {
      const data = await fetchShiftRoster(shift.id);
      setRoster(data);
    } finally {
      setRosterLoading(false);
    }
  }, []);

  const rosterLabel = rosterShift
    ? `${new Date(rosterShift.start).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })} · ${rosterShift.station}`
    : "";

  return (
    <ScreenWrapper>
      <StyledText variant="title" className="mb-4 mt-2">
        Schedule
      </StyledText>

      <WeeklyStrip
        weekStart={weekStart}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        shiftDates={shiftDates}
      />

      <View className="mt-4 flex-1">
        {shiftsQuery.isLoading ? (
          <StyledText variant="body" className="text-muted-foreground text-center py-12">
            Loading shifts...
          </StyledText>
        ) : dayShifts.length === 0 ? (
          <View className="py-12 items-center">
            <StyledText variant="body" className="text-muted-foreground">
              No shifts this day.
            </StyledText>
          </View>
        ) : (
          <FlatList
            data={dayShifts}
            keyExtractor={(s) => s.id}
            renderItem={({ item }) => (
              <ShiftCard shift={item} onPress={handleShiftPress} />
            )}
            ItemSeparatorComponent={() => <View className="h-3" />}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <RosterModal
        visible={rosterShift !== null}
        onClose={() => setRosterShift(null)}
        shiftLabel={rosterLabel}
        roster={roster}
        loading={rosterLoading}
      />
    </ScreenWrapper>
  );
}

/** Returns the most recent Sunday at midnight. */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}
