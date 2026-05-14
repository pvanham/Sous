"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { decodeAudience, encodeAudience } from "@/lib/announcement/audience";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ANNOUNCEMENT_AUDIENCE_TOKENS } from "@sous/types";

type AudienceSelectorProps = {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  initialAvailableRoles: string[];
  initialManagerRoles: string[];
};

function uniqueStable(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function AudienceSelector({
  value,
  onChange,
  disabled = false,
  initialAvailableRoles,
  initialManagerRoles,
}: AudienceSelectorProps) {
  // Shares the canonical ["kitchenConfig"] cache used across the dashboard.
  // TanStack Query re-fetches on window focus by default, so role lists
  // update automatically when the manager edits kitchen settings in another
  // tab and returns — no manual refresh button needed.
  const { data: config } = useQuery({
    queryKey: ["kitchenConfig"],
    queryFn: async () => {
      const result = await getKitchenConfig();
      if (!result.success) throw new Error(result.error || "Failed to load config");
      return result.data;
    },
  });

  // Fall back to RSC-fetched props until the first client fetch resolves.
  const availableRoles = uniqueStable(config?.roles ?? initialAvailableRoles);
  const managerRoles = uniqueStable(config?.managerRoles ?? initialManagerRoles);

  const selection = useMemo(() => decodeAudience(value), [value]);
  const managerRoleSet = useMemo(() => new Set(managerRoles), [managerRoles]);
  const hasNoConfiguredAudience =
    availableRoles.length === 0 && managerRoles.length === 0;

  const syncSelection = (patch: Partial<ReturnType<typeof decodeAudience>>) => {
    onChange(encodeAudience({ ...selection, ...patch }));
  };

  const toggleRole = (role: string) => {
    const set = new Set(selection.specificRoles);
    if (set.has(role)) {
      set.delete(role);
    } else {
      set.add(role);
    }
    syncSelection({ includeEveryone: false, specificRoles: Array.from(set) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audience</CardTitle>
        <CardDescription>Choose who should receive this announcement.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasNoConfiguredAudience && (
          <div className="rounded border border-dashed border-stone-300 p-3 text-sm dark:border-white/20">
            No kitchen roles are configured yet. Update{" "}
            <Link className="underline underline-offset-2" href="/dashboard/settings/kitchen">
              kitchen settings
            </Link>{" "}
            to target specific teams.
          </div>
        )}

        <div className="flex items-center justify-between rounded border p-3">
          <div>
            <p className="text-sm font-medium">Everyone</p>
            <p className="text-xs text-muted-foreground">Send to all location staff</p>
          </div>
          <Switch
            checked={selection.includeEveryone}
            disabled={disabled}
            onCheckedChange={(checked) => {
              if (checked) {
                onChange([ANNOUNCEMENT_AUDIENCE_TOKENS.everyone]);
                return;
              }
              syncSelection({
                includeEveryone: false,
                includeManagers: false,
                specificRoles: [],
              });
            }}
          />
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded border p-3">
            <Checkbox
              checked={selection.includeManagers}
              disabled={disabled || selection.includeEveryone}
              onCheckedChange={(checked) =>
                syncSelection({ includeEveryone: false, includeManagers: Boolean(checked) })
              }
            />
            <span>
              <span className="text-sm font-medium leading-none">All manager roles</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Includes every role currently marked as a manager role.
              </span>
            </span>
          </label>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Specific roles
            </p>
            <div className="flex flex-wrap gap-2">
              {availableRoles.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  No specific roles available.
                </span>
              )}
              {availableRoles.map((role) => {
                const selected = selection.specificRoles.includes(role);
                return (
                  <Button
                    key={role}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    size="sm"
                    disabled={disabled || selection.includeEveryone}
                    onClick={() => toggleRole(role)}
                  >
                    {role}
                    {managerRoleSet.has(role) ? " (manager)" : ""}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
