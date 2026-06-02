import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import type {
  NotificationCategory,
  NotificationChannel,
  NotificationPreferencesDTO,
  QuietHoursPrefs,
} from "@sous/types";

import { StyledText } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { SettingsHeader } from "../components/settings-header";
import { useAuthStore } from "@/features/auth/store";
import {
  useNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
} from "@/features/notifications/hooks";

interface CategoryRow {
  key: NotificationCategory;
  label: string;
  description: string;
  /**
   * If `managerOnly` is true the row is hidden for staff because the
   * server never delivers that category to them anyway. Showing it
   * would just lead to "I turned this off but still got nothing"
   * confusion.
   */
  managerOnly?: boolean;
}

interface CategorySection {
  title: string;
  description: string;
  rows: CategoryRow[];
}

const CATEGORY_SECTIONS: CategorySection[] = [
  {
    title: "Schedule & shifts",
    description: "Updates to your week and individual shifts.",
    rows: [
      {
        key: "schedule_published",
        label: "Schedule published",
        description: "Your manager publishes a new week.",
      },
      {
        key: "schedule_unpublished",
        label: "Schedule revised",
        description: "A published week is pulled back to draft.",
      },
      {
        key: "shift_assignment_changed",
        label: "Your shifts change",
        description: "A shift is added, moved, or removed from your week.",
      },
      {
        key: "schedule_generation_async",
        label: "Auto-scheduler results",
        description: "Notifies you when a generation job finishes.",
        managerOnly: true,
      },
      {
        key: "manager_coverage_gap",
        label: "Manager coverage gaps",
        description: "Days without a manager on the floor.",
        managerOnly: true,
      },
    ],
  },
  {
    title: "Time off",
    description: "Requests submitted by you and your team.",
    rows: [
      {
        key: "time_off_submitted",
        label: "New time-off request",
        description: "A staff member submits a request.",
        managerOnly: true,
      },
      {
        key: "time_off_decision",
        label: "Time-off decision",
        description: "Your request is approved or denied.",
      },
    ],
  },
  {
    title: "Exchange board",
    description: "Drops, pickups, and approvals.",
    rows: [
      {
        key: "exchange_new_drop",
        label: "New shift on the board",
        description: "Someone drops a shift you can pick up.",
      },
      {
        key: "exchange_pending_approval",
        label: "Swap awaiting approval",
        description: "A picker claims a dropped shift.",
        managerOnly: true,
      },
      {
        key: "exchange_decision",
        label: "Swap decision",
        description: "An exchange you're part of is approved or denied.",
      },
    ],
  },
  {
    title: "Other",
    description: "Announcements and account-level alerts.",
    rows: [
      {
        key: "announcements",
        label: "Announcements",
        description: "Posts from your manager pinned to home.",
      },
      {
        key: "billing_alerts",
        label: "Billing",
        description: "Subscription state changes for your organization.",
        managerOnly: true,
      },
    ],
  },
];

const MANAGER_ROLES = new Set(["owner", "manager", "shift_lead"]);

/**
 * Notification settings — the user's master switches, quiet-hours
 * window, and the full per-category × per-channel matrix.
 *
 * Every interaction is optimistic. We hand each toggle directly to
 * the mutation hook, which patches the cache, fires the request,
 * and rolls back on failure. The screen renders the canonical
 * snapshot so it stays in sync with whatever the server agreed to.
 */
export function NotificationsScreen() {
  const membership = useAuthStore((s) => s.membership);
  const isManager = membership ? MANAGER_ROLES.has(membership.role) : false;

  const { data, isLoading, isError, refetch } =
    useNotificationPreferencesQuery();
  const mutation = useUpdateNotificationPreferencesMutation();

  const visibleSections = useMemo(() => {
    if (isManager) return CATEGORY_SECTIONS;
    return CATEGORY_SECTIONS.map((section) => ({
      ...section,
      rows: section.rows.filter((row) => !row.managerOnly),
    })).filter((section) => section.rows.length > 0);
  }, [isManager]);

  return (
    <View className="flex-1 bg-background">
      <SettingsHeader title="Notifications" />
      <ScrollView contentContainerClassName="px-4 pt-6 pb-10">
        {isLoading ? (
          <LoadingState />
        ) : isError || !data ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : (
          <NotificationsBody
            prefs={data}
            visibleSections={visibleSections}
            onPatch={(patch) => mutation.mutate(patch)}
          />
        )}
      </ScrollView>
    </View>
  );
}

function LoadingState() {
  return (
    <View className="items-center justify-center py-12">
      <ActivityIndicator />
      <StyledText variant="caption" className="mt-3">
        Loading your notification preferences…
      </StyledText>
    </View>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="border border-border bg-muted/40 rounded-md px-4 py-6 items-center">
      <StyledText variant="body" className="mb-3 text-center">
        We couldn&apos;t load your notification preferences.
      </StyledText>
      <Button title="Try again" variant="secondary" onPress={onRetry} />
    </View>
  );
}

interface BodyProps {
  prefs: NotificationPreferencesDTO;
  visibleSections: CategorySection[];
  onPatch: (
    patch: Parameters<
      ReturnType<typeof useUpdateNotificationPreferencesMutation>["mutate"]
    >[0],
  ) => void;
}

function NotificationsBody({ prefs, visibleSections, onPatch }: BodyProps) {
  const [quietHoursEditor, setQuietHoursEditor] = useState<
    "start" | "end" | null
  >(null);

  return (
    <>
      <SectionHeader label="Channels" />
      <Group>
        <ToggleRow
          label="Push notifications"
          description="Alerts on this device"
          value={prefs.channels.push}
          onValueChange={(next) =>
            onPatch({ channels: { push: next } })
          }
        />
        <ToggleRow
          label="Email notifications"
          description="Updates delivered to your inbox"
          value={prefs.channels.email}
          onValueChange={(next) =>
            onPatch({ channels: { email: next } })
          }
          divider
        />
      </Group>

      <SectionHeader label="Quiet hours" />
      <Group>
        <ToggleRow
          label="Enable quiet hours"
          description={describeQuietHours(prefs.quietHours)}
          value={Boolean(prefs.quietHours?.enabled)}
          onValueChange={(next) =>
            onPatch({
              quietHours: next
                ? prefs.quietHours
                  ? { ...prefs.quietHours, enabled: true }
                  : defaultQuietHoursForUser()
                : prefs.quietHours
                  ? { ...prefs.quietHours, enabled: false }
                  : null,
            })
          }
        />
        {prefs.quietHours?.enabled ? (
          <>
            <TimeRow
              label="Start"
              minute={prefs.quietHours.startMinute}
              onPress={() => setQuietHoursEditor("start")}
              divider
            />
            <TimeRow
              label="End"
              minute={prefs.quietHours.endMinute}
              onPress={() => setQuietHoursEditor("end")}
              divider
            />
          </>
        ) : null}
      </Group>

      {visibleSections.map((section) => (
        <View key={section.title} className="mb-2">
          <SectionHeader label={section.title} />
          <StyledText variant="caption" className="mb-2">
            {section.description}
          </StyledText>
          <Group>
            <View className="flex-row items-center px-4 py-2 bg-muted/40 border-b border-border">
              <StyledText variant="caption" className="flex-1">
                Category
              </StyledText>
              <ChannelHeader label="Push" disabled={!prefs.channels.push} />
              <ChannelHeader label="Email" disabled={!prefs.channels.email} />
            </View>
            {(!prefs.channels.push || !prefs.channels.email) && (
              <View className="px-4 py-2 bg-muted/40 border-b border-border">
                <StyledText variant="caption" className="text-muted-foreground">
                  {!prefs.channels.push && !prefs.channels.email
                    ? "Push and email notifications are off — enable them above to configure categories."
                    : !prefs.channels.push
                      ? "Push notifications are off — enable them above to configure the Push column."
                      : "Email notifications are off — enable them above to configure the Email column."}
                </StyledText>
              </View>
            )}
            {section.rows.map((row, index) => (
              <CategoryToggleRow
                key={row.key}
                row={row}
                values={prefs.categories[row.key]}
                onPatch={(channel, next) =>
                  onPatch({
                    categories: {
                      [row.key]: { [channel]: next },
                    } as Parameters<typeof onPatch>[0]["categories"],
                  })
                }
                pushDisabled={!prefs.channels.push}
                emailDisabled={!prefs.channels.email}
                divider={index > 0}
              />
            ))}
          </Group>
        </View>
      ))}

      <QuietHoursPickerSheet
        visible={quietHoursEditor !== null}
        title={
          quietHoursEditor === "start"
            ? "Quiet hours start"
            : "Quiet hours end"
        }
        currentMinute={
          quietHoursEditor === "start"
            ? prefs.quietHours?.startMinute ?? 22 * 60
            : prefs.quietHours?.endMinute ?? 7 * 60
        }
        onClose={() => setQuietHoursEditor(null)}
        onSelect={(minute) => {
          if (!prefs.quietHours) {
            setQuietHoursEditor(null);
            return;
          }
          const next: QuietHoursPrefs = {
            ...prefs.quietHours,
            startMinute:
              quietHoursEditor === "start"
                ? minute
                : prefs.quietHours.startMinute,
            endMinute:
              quietHoursEditor === "end"
                ? minute
                : prefs.quietHours.endMinute,
          };
          onPatch({ quietHours: next });
          setQuietHoursEditor(null);
        }}
      />
    </>
  );
}

interface CategoryToggleRowProps {
  row: CategoryRow;
  values?: { push: boolean; email: boolean };
  onPatch: (channel: NotificationChannel, next: boolean) => void;
  pushDisabled?: boolean;
  emailDisabled?: boolean;
  divider?: boolean;
}

function CategoryToggleRow({
  row,
  values,
  onPatch,
  pushDisabled = false,
  emailDisabled = false,
  divider,
}: CategoryToggleRowProps) {
  const push = values?.push ?? true;
  const email = values?.email ?? true;
  return (
    <View
      className={`flex-row items-start px-4 py-3 ${
        divider ? "border-t border-border" : ""
      }`}
    >
      <View className="flex-1 pr-3">
        <StyledText variant="body">{row.label}</StyledText>
        <StyledText variant="caption" className="mt-0.5">
          {row.description}
        </StyledText>
      </View>
      <View className="w-16 items-center">
        <Toggle
          value={push}
          onValueChange={(next) => onPatch("push", next)}
          disabled={pushDisabled}
          accessibilityLabel={`${row.label} push`}
        />
      </View>
      <View className="w-16 items-center">
        <Toggle
          value={email}
          onValueChange={(next) => onPatch("email", next)}
          disabled={emailDisabled}
          accessibilityLabel={`${row.label} email`}
        />
      </View>
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
      <Toggle
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
      />
    </View>
  );
}

interface TimeRowProps {
  label: string;
  minute: number;
  onPress: () => void;
  divider?: boolean;
}

function TimeRow({ label, minute, onPress, divider }: TimeRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center px-4 py-3 active:bg-muted/40 ${
        divider ? "border-t border-border" : ""
      }`}
      accessibilityRole="button"
      accessibilityLabel={`${label} time, currently ${formatMinute(minute)}`}
    >
      <StyledText variant="body" className="flex-1">
        {label}
      </StyledText>
      <StyledText variant="body" className="text-muted-foreground">
        {formatMinute(minute)}
      </StyledText>
    </Pressable>
  );
}

function ChannelHeader({
  label,
  disabled = false,
}: {
  label: string;
  disabled?: boolean;
}) {
  return (
    <View className="w-16 items-center">
      <StyledText
        variant="caption"
        className={`uppercase tracking-wider ${disabled ? "opacity-40" : ""}`}
      >
        {label}
      </StyledText>
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

interface QuietHoursPickerSheetProps {
  visible: boolean;
  title: string;
  currentMinute: number;
  onClose: () => void;
  onSelect: (minute: number) => void;
}

type Period = "AM" | "PM";

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const MINUTE_OPTIONS = [0, 15, 30, 45] as const;

/**
 * Bottom sheet for picking a quiet-hours boundary as a 12-hour
 * AM/PM time. The user dials in the hour, the minute, and the
 * period independently and confirms — a deliberate, low-error
 * pattern that reads identically on iOS and Android (unlike the
 * native time picker, which renders very differently per platform).
 */
function QuietHoursPickerSheet({
  visible,
  title,
  currentMinute,
  onClose,
  onSelect,
}: QuietHoursPickerSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeightClassName="max-h-[85%]">
      <QuietHoursPickerContent
        active={visible}
        title={title}
        currentMinute={currentMinute}
        onSelect={onSelect}
      />
    </BottomSheet>
  );
}

interface QuietHoursPickerContentProps {
  /** When this flips true, the draft re-seeds from `currentMinute`. */
  active: boolean;
  title: string;
  currentMinute: number;
  onSelect: (minute: number) => void;
}

/**
 * The interactive body of the quiet-hours picker, kept separate from
 * the {@link BottomSheet} wrapper so it can be rendered and inspected
 * on its own.
 */
function QuietHoursPickerContent({
  active,
  title,
  currentMinute,
  onSelect,
}: QuietHoursPickerContentProps) {
  // Seed the draft from the incoming value on first mount so the very
  // first frame already shows the right time (no flash of a default).
  const [hour12, setHour12] = useState(() => splitMinute(currentMinute).hour12);
  const [minute, setMinute] = useState(() => splitMinute(currentMinute).minute);
  const [period, setPeriod] = useState<Period>(
    () => splitMinute(currentMinute).period,
  );

  // Re-seed when the sheet reopens for a different field (the instance
  // is reused across opens), so reopening start vs end shows the
  // right value rather than the previously-edited one.
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) {
      const parts = splitMinute(currentMinute);
      setHour12(parts.hour12);
      setMinute(parts.minute);
      setPeriod(parts.period);
    }
    wasActive.current = active;
  }, [active, currentMinute]);

  const draftMinute = composeMinute(hour12, minute, period);

  return (
    <>
      <View className="mb-4">
        <StyledText variant="subtitle">{title}</StyledText>
        <StyledText variant="caption" className="mt-1">
          Notifications stay silent during this window in your timezone.
        </StyledText>
      </View>

      <View className="items-center mb-5">
        <StyledText variant="title" className="text-4xl">
          {formatMinute(draftMinute)}
        </StyledText>
      </View>

      <View className="flex-row self-center mb-5 rounded-full bg-muted p-1">
        {(["AM", "PM"] as const).map((p) => {
          const active = period === p;
          return (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={p}
              className={`px-6 py-2 rounded-full ${active ? "bg-primary" : ""}`}
            >
              <StyledText
                variant="label"
                className={active ? "text-primary-foreground" : "text-muted-foreground"}
              >
                {p}
              </StyledText>
            </Pressable>
          );
        })}
      </View>

      <StyledText variant="caption" className="uppercase tracking-wider mb-2">
        Hour
      </StyledText>
      <View className="flex-row flex-wrap mb-4">
        {HOURS_12.map((h) => {
          const active = h === hour12;
          return (
            <PickerChip
              key={h}
              label={String(h)}
              active={active}
              onPress={() => setHour12(h)}
            />
          );
        })}
      </View>

      <StyledText variant="caption" className="uppercase tracking-wider mb-2">
        Minute
      </StyledText>
      <View className="flex-row mb-6">
        {MINUTE_OPTIONS.map((m) => {
          const active = m === minute;
          return (
            <PickerChip
              key={m}
              label={`:${String(m).padStart(2, "0")}`}
              active={active}
              onPress={() => setMinute(m)}
            />
          );
        })}
      </View>

      <Button title="Set time" onPress={() => onSelect(draftMinute)} />
    </>
  );
}

function PickerChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      className={`w-[58px] h-11 items-center justify-center rounded-md mr-2 mb-2 border ${
        active
          ? "bg-primary border-primary"
          : "bg-card border-border active:bg-muted/40"
      }`}
    >
      <StyledText
        variant="body"
        className={active ? "text-primary-foreground font-semibold" : ""}
      >
        {label}
      </StyledText>
    </Pressable>
  );
}

function describeQuietHours(quietHours: QuietHoursPrefs): string {
  if (!quietHours) {
    return "We won't pause notifications.";
  }
  if (!quietHours.enabled) {
    return "Quiet hours are off.";
  }
  return `Silent ${formatMinute(quietHours.startMinute)} to ${formatMinute(quietHours.endMinute)} (${quietHours.timezone}).`;
}

function defaultQuietHoursForUser(): QuietHoursPrefs {
  let timezone = "UTC";
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved) timezone = resolved;
  } catch {
    // ignore — fall back to UTC
  }
  return {
    enabled: true,
    startMinute: 22 * 60,
    endMinute: 7 * 60,
    timezone,
  };
}

function formatMinute(total: number): string {
  const safe = Math.max(0, Math.min(total, 24 * 60 - 1));
  const h24 = Math.floor(safe / 60);
  const m = safe % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(m).padStart(2, "0");
  return `${h12}:${mm} ${period}`;
}

/** Split minutes-since-midnight into 12-hour clock parts for the picker. */
function splitMinute(total: number): {
  hour12: number;
  minute: number;
  period: Period;
} {
  const safe = Math.max(0, Math.min(total, 24 * 60 - 1));
  const h24 = Math.floor(safe / 60);
  const rawMinute = safe % 60;
  const period: Period = h24 < 12 ? "AM" : "PM";
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  // Snap to the nearest offered option so an arbitrary stored minute
  // still highlights a chip when the sheet opens.
  const minute = MINUTE_OPTIONS.reduce((closest, option) =>
    Math.abs(option - rawMinute) < Math.abs(closest - rawMinute)
      ? option
      : closest,
  );
  return { hour12, minute, period };
}

/** Inverse of {@link splitMinute}: 12-hour parts → minutes since midnight. */
function composeMinute(hour12: number, minute: number, period: Period): number {
  const base = hour12 % 12;
  const h24 = period === "PM" ? base + 12 : base;
  return h24 * 60 + minute;
}
