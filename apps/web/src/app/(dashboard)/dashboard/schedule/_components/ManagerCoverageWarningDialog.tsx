"use client";

import { AlertTriangle, Clock, Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
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
  onPublishAnyway: () => void;
  isPublishing?: boolean;
}

/**
 * ManagerCoverageWarningDialog - Shows warnings about manager coverage gaps.
 * Displayed before publishing a schedule if there are days where no manager
 * is scheduled during store hours. User can cancel to keep editing or
 * publish anyway.
 */
export function ManagerCoverageWarningDialog({
  open,
  onOpenChange,
  warnings,
  onPublishAnyway,
  isPublishing = false,
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
                The following time periods have no manager coverage during store
                hours:
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
                Would you like to continue editing to add manager coverage, or
                publish anyway?
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPublishing}>
            Keep Editing
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onPublishAnyway();
            }}
            disabled={isPublishing}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {isPublishing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Publishing...
              </>
            ) : (
              "Publish Anyway"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
