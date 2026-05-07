"use client";

import { useState } from "react";
import { AlertTriangle, Users, Clock, ChevronDown, ChevronUp, ClipboardList, UserCircle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import type { ConfigChangeImpact, SaveKitchenConfigOptions } from "@/types/kitchen-config";

interface ConfigChangeWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  impact: ConfigChangeImpact | null;
  onConfirm: (options?: SaveKitchenConfigOptions) => void;
  isPending: boolean;
}

/**
 * Dialog shown when removing stations or roles from kitchen config.
 * Handles:
 * - Station removal: Shows affected staff, confirms cleanup
 * - Role removal (safe): Shows affected staff, confirms removal
 * - Role removal (requires replacement): Forces user to select replacement role
 */
export function ConfigChangeWarningDialog({
  open,
  onOpenChange,
  impact,
  onConfirm,
  isPending,
}: ConfigChangeWarningDialogProps) {
  const [selectedReplacementRole, setSelectedReplacementRole] = useState<string>("");
  const [showStationDetails, setShowStationDetails] = useState(false);
  const [showRoleDetails, setShowRoleDetails] = useState(false);

  if (!impact) return null;

  const hasStationImpact =
    impact.removedStations.length > 0 &&
    (impact.stationImpact.affectedStaffCount > 0 ||
      impact.stationImpact.laborRequirementCount > 0 ||
      impact.stationImpact.preferredStationStaffCount > 0);
  const hasRoleImpact = impact.removedRoles.length > 0 && impact.roleImpact.affectedStaffCount > 0;
  const requiresReplacement = impact.requiresRoleReplacement;

  // Determine dialog type
  const isStationOnlyRemoval = hasStationImpact && !hasRoleImpact;
  const isRoleOnlyRemoval = hasRoleImpact && !hasStationImpact;
  const isMixedRemoval = hasStationImpact && hasRoleImpact;

  const handleConfirm = () => {
    if (requiresReplacement && selectedReplacementRole) {
      onConfirm({
        roleReplacement: {
          oldRole: impact.removedRoles[0], // Only one role at a time
          newRole: selectedReplacementRole,
        },
      });
    } else {
      onConfirm();
    }
  };

  const canConfirm = !requiresReplacement || selectedReplacementRole !== "";

  // Title based on what's being removed
  const getTitle = () => {
    if (isMixedRemoval) {
      return "Confirm Configuration Changes";
    }
    if (isStationOnlyRemoval) {
      return `Removing Station: ${impact.removedStations[0]}`;
    }
    if (isRoleOnlyRemoval) {
      return `Removing Role: ${impact.removedRoles[0]}`;
    }
    return "Confirm Changes";
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            {getTitle()}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {/* Station Removal Section */}
              {hasStationImpact && (
                <div className="rounded border border-stone-200 dark:border-stone-700 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-stone-500" />
                      <span className="font-medium text-stone-900 dark:text-stone-100">
                        Station Removal
                      </span>
                    </div>
                    <Badge variant="secondary">
                      {impact.stationImpact.affectedStaffCount > 0
                        ? `${impact.stationImpact.affectedStaffCount} staff affected`
                        : "Data will be removed"}
                    </Badge>
                  </div>

                  {impact.stationImpact.affectedStaffCount > 0 && (
                    <p className="text-sm">
                      <strong>{impact.stationImpact.affectedStaffCount}</strong> staff member(s) have
                      skills for <strong>{impact.removedStations.join(", ")}</strong> that will be
                      removed.
                    </p>
                  )}

                  {/* Expandable staff list */}
                  {impact.stationImpact.affectedStaff.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowStationDetails(!showStationDetails)}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        {showStationDetails ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        {showStationDetails ? "Hide" : "Show"} affected staff
                      </button>

                      {showStationDetails && (
                        <ul className="mt-2 space-y-1 text-sm pl-4 border-l-2 border-stone-200 dark:border-stone-700">
                          {impact.stationImpact.affectedStaff.map((staff) => (
                            <li key={staff.id} className="text-stone-600 dark:text-stone-400">
                              <span className="font-medium text-stone-800 dark:text-stone-200">
                                {staff.name}
                              </span>
                              {" - "}
                              {staff.skillsToRemove
                                .map((s) => `${s.station} (${"★".repeat(s.proficiency)})`)
                                .join(", ")}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Historical shifts notice */}
                  {impact.stationImpact.historicalShiftCount > 0 && (
                    <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-800/50 p-2 rounded">
                      <Clock className="h-4 w-4" />
                      <span>
                        {impact.stationImpact.historicalShiftCount} historical shift(s) reference
                        this station (data will be preserved)
                      </span>
                    </div>
                  )}

                  {/* Labor requirements notice */}
                  {impact.stationImpact.laborRequirementCount > 0 && (
                    <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-800/50 p-2 rounded">
                      <ClipboardList className="h-4 w-4" />
                      <span>
                        {impact.stationImpact.laborRequirementCount} labor requirement(s) for this
                        station will be permanently deleted.
                      </span>
                    </div>
                  )}

                  {/* Preferred stations notice */}
                  {impact.stationImpact.preferredStationStaffCount > 0 && (
                    <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-800/50 p-2 rounded">
                      <UserCircle className="h-4 w-4" />
                      <span>
                        {impact.stationImpact.preferredStationStaffCount} staff member(s) have this
                        station in their preferences. It will be removed.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Role Removal Section */}
              {hasRoleImpact && (
                <div
                  className={`rounded border p-3 space-y-2 ${
                    requiresReplacement
                      ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20"
                      : "border-stone-200 dark:border-stone-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-stone-500" />
                      <span className="font-medium text-stone-900 dark:text-stone-100">
                        Role Removal
                      </span>
                    </div>
                    <Badge variant={requiresReplacement ? "destructive" : "secondary"}>
                      {impact.roleImpact.affectedStaffCount} staff affected
                    </Badge>
                  </div>

                  {/* Warning if replacement required */}
                  {requiresReplacement && (
                    <div className="flex items-start gap-2 p-2 bg-amber-100 dark:bg-amber-900/40 rounded text-amber-800 dark:text-amber-200">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <strong>{impact.roleImpact.staffWithOnlyThisRole.length}</strong> staff
                        member(s) have this as their <strong>only role</strong>. They must be
                        assigned a replacement role.
                      </div>
                    </div>
                  )}

                  {/* Staff with only this role */}
                  {impact.roleImpact.staffWithOnlyThisRole.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                        Staff requiring replacement role:
                      </p>
                      <ul className="text-sm pl-4 border-l-2 border-amber-300 dark:border-amber-700 space-y-0.5">
                        {impact.roleImpact.staffWithOnlyThisRole.map((staff) => (
                          <li key={staff.id} className="text-stone-600 dark:text-stone-400">
                            {staff.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Replacement role selector */}
                  {requiresReplacement && (
                    <div className="pt-2">
                      <label className="text-sm font-medium text-stone-700 dark:text-stone-300 block mb-1">
                        Select replacement role:
                      </label>
                      <Select
                        value={selectedReplacementRole}
                        onValueChange={setSelectedReplacementRole}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose a role..." />
                        </SelectTrigger>
                        <SelectContent>
                          {impact.availableReplacementRoles.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Staff with other roles (expandable) */}
                  {impact.roleImpact.staffWithOtherRoles.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowRoleDetails(!showRoleDetails)}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        {showRoleDetails ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        {showRoleDetails ? "Hide" : "Show"}{" "}
                        {impact.roleImpact.staffWithOtherRoles.length} staff with other roles
                      </button>

                      {showRoleDetails && (
                        <ul className="mt-2 space-y-1 text-sm pl-4 border-l-2 border-stone-200 dark:border-stone-700">
                          {impact.roleImpact.staffWithOtherRoles.map((staff) => (
                            <li key={staff.id} className="text-stone-600 dark:text-stone-400">
                              <span className="font-medium text-stone-800 dark:text-stone-200">
                                {staff.name}
                              </span>
                              {" - will keep: "}
                              {staff.remainingRoles.join(", ")}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm || isPending}
            variant={requiresReplacement ? "destructive" : "default"}
          >
            {isPending
              ? "Saving..."
              : requiresReplacement
                ? "Remove & Replace Role"
                : hasStationImpact && hasRoleImpact
                  ? "Confirm Changes"
                  : hasStationImpact
                    ? "Remove Station"
                    : "Remove Role"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
