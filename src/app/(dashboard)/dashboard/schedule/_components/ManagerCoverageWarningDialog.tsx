"use client";

import { AlertTriangle, Clock } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ManagerCoverageGap } from "@/server/services/schedule.service";
import { formatTimeString } from "@/lib/utils/date";

interface ManagerCoverageWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warnings: ManagerCoverageGap[];
}

/**
 * ManagerCoverageWarningDialog - Shows warnings about manager coverage gaps.
 * Displayed after a schedule is successfully published if there are days
 * where no manager is scheduled during store hours.
 */
export function ManagerCoverageWarningDialog({
  open,
  onOpenChange,
  warnings,
}: ManagerCoverageWarningDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Manager Coverage Gaps Detected
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                The schedule was published successfully, but the following time
                periods have no manager coverage during store hours:
              </p>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {warnings.map((warning, index) => (
                  <div
                    key={index}
                    className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50 p-3"
                  >
                    <div className="font-medium text-foreground mb-1">
                      {warning.day}
                    </div>
                    <div className="space-y-1">
                      {warning.gaps.map((gap, gapIndex) => (
                        <div
                          key={gapIndex}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <Clock className="h-3.5 w-3.5" />
                          <span>
                            {formatTimeString(gap.start)} -{" "}
                            {formatTimeString(gap.end)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm">
                Consider scheduling a manager during these times to ensure
                proper supervision.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Acknowledge</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
