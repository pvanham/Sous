"use client";

import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";

import { updateWebNotificationPreferences } from "@/server/actions/notification-preference.actions";
import {
  webNotificationCategoryValues,
  type WebNotificationCategory,
  type WebNotificationCategoriesPrefs,
} from "@sous/types";
import type { WebNotificationPreferencesDTO } from "@/types/notification";
import type { MemberRole } from "@/server/models/OrganizationMember";

interface CategoryMeta {
  key: WebNotificationCategory;
  label: string;
  description: string;
  /** Only owners are recipients (e.g. billing); hidden for managers. */
  ownerOnly?: boolean;
}

/**
 * Copy for each web-facing category. Framed from the manager/owner's
 * perspective — i.e. the event that *triggers* the email — to make the
 * separation from the mobile (staff-facing) settings obvious. For
 * example "Time-off requests" here is a staff member *submitting* a
 * request, not the mobile decision push a staff member receives.
 */
const CATEGORY_META: readonly CategoryMeta[] = [
  {
    key: "time_off_submitted",
    label: "Time-off requests",
    description: "When a staff member submits a new time-off request to review.",
  },
  {
    key: "exchange_pending_approval",
    label: "Shift swaps awaiting approval",
    description:
      "When a staff member picks up a dropped shift and needs your approval.",
  },
  {
    key: "manager_coverage_gap",
    label: "Coverage gaps",
    description:
      "When a schedule you publish leaves shifts understaffed for the week.",
  },
  {
    key: "skill_change_submitted",
    label: "Skill change requests",
    description:
      "When a staff member asks to add or remove a station skill from their profile.",
  },
  {
    key: "schedule_generation_async",
    label: "Schedule generation results",
    description:
      "When an AI schedule draft you started finishes generating in the background.",
  },
  {
    key: "billing_alerts",
    label: "Billing alerts",
    description: "Payment, subscription, and invoice notifications for your plan.",
    ownerOnly: true,
  },
];

interface FormValues {
  email: boolean;
  categories: Record<WebNotificationCategory, boolean>;
}

function buildDefaults(
  prefs: WebNotificationPreferencesDTO | null,
): FormValues {
  const categories = {} as Record<WebNotificationCategory, boolean>;
  for (const key of webNotificationCategoryValues) {
    categories[key] = prefs ? prefs.categories[key] !== false : true;
  }
  return { email: prefs ? prefs.email : true, categories };
}

interface NotificationSettingsFormProps {
  initialPreferences: WebNotificationPreferencesDTO | null;
  role: MemberRole;
}

export function NotificationSettingsForm({
  initialPreferences,
  role,
}: NotificationSettingsFormProps) {
  const queryClient = useQueryClient();
  const defaults = buildDefaults(initialPreferences);

  const form = useForm<FormValues>({ defaultValues: defaults });

  const masterEmail = form.watch("email");

  const visibleCategories = CATEGORY_META.filter(
    (c) => !c.ownerOnly || role === "owner",
  );

  const saveMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const result = await updateWebNotificationPreferences(data);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      toast.success("Notification settings saved!");
      form.reset(buildDefaults(data));
      queryClient.invalidateQueries({
        queryKey: ["webNotificationPreferences"],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Failed to save notification settings");
    },
  });

  const resetFormToOriginal = () => {
    form.reset(defaults);
  };

  const onSubmit = (data: FormValues) => {
    // Only persist toggles the user can actually see/control; this keeps
    // a manager from ever flipping owner-only categories like billing.
    const categories = {} as Partial<WebNotificationCategoriesPrefs>;
    for (const meta of visibleCategories) {
      categories[meta.key] = data.categories[meta.key];
    }
    saveMutation.mutate({ email: data.email, categories } as FormValues);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-8 max-w-2xl"
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5 pr-4">
                <FormLabel className="text-base">Email notifications</FormLabel>
                <FormDescription>
                  Master switch for every web email below. Turn this off to stop
                  all dashboard email notifications without losing your
                  per-topic choices.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="space-y-4">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground">
              By topic
            </h2>
            <p className="text-sm text-muted-foreground">
              Each topic controls a manager or owner email the dashboard sends
              when staff take an action that needs your attention.
            </p>
          </div>

          {visibleCategories.map((meta) => (
            <FormField
              key={meta.key}
              control={form.control}
              name={`categories.${meta.key}` as const}
              render={({ field }) => (
                <FormItem
                  className={`flex items-center justify-between rounded-lg border p-4 transition-opacity ${
                    masterEmail ? "" : "opacity-60"
                  }`}
                >
                  <div className="space-y-0.5 pr-4">
                    <FormLabel className="text-base">{meta.label}</FormLabel>
                    <FormDescription>{meta.description}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={masterEmail && field.value}
                      disabled={!masterEmail}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          ))}
        </div>

        {form.formState.isDirty && (
          <div className="sticky bottom-6 z-50 mt-8 animate-in slide-in-from-bottom-4 fade-in">
            <Card className="flex items-center justify-between p-4 shadow-xl border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex flex-col">
                <span className="font-medium">Unsaved Changes</span>
                <span className="text-sm text-muted-foreground">
                  Don&apos;t forget to save your settings
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetFormToOriginal}
                  disabled={saveMutation.isPending}
                >
                  Discard
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </form>
    </Form>
  );
}
