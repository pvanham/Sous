import { useCallback, useEffect, useMemo, useState } from "react";
import { View, ScrollView, Pressable, ActivityIndicator } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "../components/settings-header";
import { useMyStaff, useUpdateMyStaff } from "@/features/profile/hooks";

/**
 * Preferred stations screen. The staff member toggles each station
 * from their approved skill list on/off; the selected subset is
 * written back to `Staff.preferredStations`, which the AI scheduler
 * uses as a soft bias when placing shifts.
 *
 * Why station choices come from the skills list (not KitchenConfig):
 *   A staff member can only *work* stations the manager has approved
 *   them for (their skills). Allowing preferred selections outside
 *   that set would be misleading — the scheduler would never pick
 *   them for the bonus station. When we need a broader list later
 *   (e.g. "stations I'd like to train on"), we can add a new field
 *   and a dedicated screen.
 */
export function StationsScreen() {
  const myStaffQuery = useMyStaff();
  const updateMyStaff = useUpdateMyStaff();

  const staff = myStaffQuery.data ?? null;

  const approvedStations = useMemo(() => {
    if (!staff) return [] as string[];
    const set = new Set<string>();
    for (const skill of staff.skills) set.add(skill.station);
    return Array.from(set).sort();
  }, [staff]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (staff) {
      setSelected(new Set(staff.preferredStations));
    }
  }, [staff]);

  const toggle = useCallback((station: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(station)) {
        next.delete(station);
      } else {
        next.add(station);
      }
      return next;
    });
  }, []);

  const dirty = useMemo(() => {
    if (!staff) return false;
    const current = new Set(staff.preferredStations);
    if (current.size !== selected.size) return true;
    for (const s of selected) if (!current.has(s)) return true;
    return false;
  }, [staff, selected]);

  const canSubmit = dirty && !updateMyStaff.isPending;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    setSuccess(false);
    try {
      await updateMyStaff.mutateAsync({
        preferredStations: Array.from(selected),
      });
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your stations.",
      );
    }
  }, [canSubmit, updateMyStaff, selected]);

  if (myStaffQuery.isLoading) {
    return (
      <View className="flex-1 bg-background">
        <SettingsHeader title="Station preferences" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  if (!staff) {
    return (
      <View className="flex-1 bg-background">
        <SettingsHeader title="Station preferences" />
        <View className="px-4 pt-6">
          <StyledText variant="body">
            We couldn&apos;t find your staff record at this location. Ask
            your manager to add you before setting station preferences.
          </StyledText>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SettingsHeader title="Station preferences" />
      <ScrollView contentContainerClassName="px-4 pt-6 pb-10">
        <StyledText variant="caption" className="mb-3">
          Pick the stations you&apos;d prefer to work. The scheduler will try
          to place you there before using your other approved stations.
        </StyledText>

        {approvedStations.length === 0 ? (
          <View className="bg-card border border-border rounded-md px-4 py-4">
            <StyledText variant="caption" className="text-sm">
              You don&apos;t have any approved stations yet — ask your
              manager to add stations to your profile before picking
              preferences.
            </StyledText>
          </View>
        ) : (
          <View className="bg-card border border-border rounded-md overflow-hidden">
            {approvedStations.map((station, index) => {
              const isSelected = selected.has(station);
              return (
                <Pressable
                  key={station}
                  onPress={() => toggle(station)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={station}
                  className={`flex-row items-center px-4 py-3 active:opacity-80 ${
                    index > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <View className="flex-1 pr-3">
                    <StyledText variant="body">{station}</StyledText>
                  </View>
                  <View
                    className={`w-6 h-6 rounded-sm border items-center justify-center ${
                      isSelected
                        ? "bg-primary border-primary"
                        : "bg-background border-border"
                    }`}
                  >
                    {isSelected ? (
                      <MaterialIcons
                        name="check"
                        size={16}
                        color="#fefce8"
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {error ? (
          <View className="border border-destructive rounded-md px-3 py-2 mt-3">
            <StyledText variant="caption" className="text-destructive text-sm">
              {error}
            </StyledText>
          </View>
        ) : null}

        {success ? (
          <View className="border border-primary rounded-md px-3 py-2 mt-3">
            <StyledText variant="caption" className="text-sm">
              Station preferences updated.
            </StyledText>
          </View>
        ) : null}

        {approvedStations.length > 0 ? (
          <Button
            title="Save changes"
            onPress={handleSubmit}
            loading={updateMyStaff.isPending}
            disabled={!canSubmit}
            size="lg"
            className="mt-4"
          />
        ) : null}

        <StyledText variant="caption" className="mt-4">
          Only your approved stations appear here. To add more, ask
          your manager to update your skills.
        </StyledText>
      </ScrollView>
    </View>
  );
}
