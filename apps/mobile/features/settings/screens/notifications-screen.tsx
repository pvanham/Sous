import { View, ScrollView, Switch } from "react-native";

import { StyledText } from "@/components/ui/text";
import { SettingsHeader } from "../components/settings-header";
import { useSettingsPreferences } from "../preferences-store";

/**
 * Notification preferences. Push + email channels aren't delivered
 * yet (SHI-19 explicitly calls this out), so every toggle here is
 * persisted locally by `useSettingsPreferences`. When the backend
 * channel lands we can point the setters at a `/api/me/notifications`
 * mutation without changing this UI.
 *
 * Toggles auto-save on flip — per the design rules, no Save button is
 * needed for boolean settings.
 */
export function NotificationsScreen() {
  const prefs = useSettingsPreferences();

  return (
    <View className="flex-1 bg-background">
      <SettingsHeader title="Notifications" />
      <ScrollView contentContainerClassName="px-4 pt-6 pb-10">
        <View className="border border-border bg-muted/40 rounded-md px-3 py-2 mb-4">
          <StyledText variant="caption" className="text-sm">
            Push and email notifications aren&apos;t delivered yet. Your
            preferences are saved on this device and will apply once the
            channels are live.
          </StyledText>
        </View>

        <SectionHeader label="Channels" />
        <Group>
          <ToggleRow
            label="Push notifications"
            description="Alerts on this device"
            value={prefs.notifyPush}
            onValueChange={prefs.setNotifyPush}
          />
          <ToggleRow
            label="Email notifications"
            description="Updates delivered to your inbox"
            value={prefs.notifyEmail}
            onValueChange={prefs.setNotifyEmail}
            divider
          />
        </Group>

        <SectionHeader label="What to notify me about" />
        <Group>
          <ToggleRow
            label="Schedule updates"
            description="New shifts, changes, and published weeks"
            value={prefs.notifyScheduleUpdates}
            onValueChange={prefs.setNotifyScheduleUpdates}
          />
          <ToggleRow
            label="Time-off decisions"
            description="When a manager approves or denies a request"
            value={prefs.notifyTimeOffUpdates}
            onValueChange={prefs.setNotifyTimeOffUpdates}
            divider
          />
          <ToggleRow
            label="Exchange board activity"
            description="Shifts picked up, approved, or denied"
            value={prefs.notifyExchangeUpdates}
            onValueChange={prefs.setNotifyExchangeUpdates}
            divider
          />
        </Group>
      </ScrollView>
    </View>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  divider?: boolean;
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  divider = false,
}: ToggleRowProps) {
  return (
    <View
      className={`flex-row items-center px-4 py-3 ${
        divider ? "border-t border-border" : ""
      }`}
    >
      <View className="flex-1 pr-3">
        <StyledText variant="body">{label}</StyledText>
        <StyledText variant="caption" className="mt-0.5">
          {description}
        </StyledText>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityRole="switch"
        accessibilityLabel={label}
      />
    </View>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <View className="bg-card border border-border rounded-md overflow-hidden mb-4">
      {children}
    </View>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <StyledText variant="caption" className="uppercase tracking-wider mt-2 mb-2">
      {label}
    </StyledText>
  );
}
