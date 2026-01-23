"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { listStaff } from "@/server/actions/staff.actions";
import { formatTimeRange, formatFullDayLabel } from "@/lib/utils/date";
import type { ShiftDTO } from "@/types/shift";

// Query keys
const staffKeys = {
  all: ["staff"] as const,
  list: () => [...staffKeys.all, "list"] as const,
};

interface ShiftDeleteConfirmProps {
  shift: ShiftDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function ShiftDeleteConfirm({
  shift,
  open,
  onOpenChange,
  onConfirm,
  isDeleting = false,
}: ShiftDeleteConfirmProps) {
  // Fetch staff list to display staff name
  const { data: staffResponse } = useQuery({
    queryKey: staffKeys.list(),
    queryFn: () => listStaff(),
    enabled: open,
  });

  const allStaff = staffResponse?.success ? staffResponse.data : [];

  // Get the staff member for display
  const staffMember = useMemo(
    () => allStaff.find((s) => s.id === shift.staffId),
    [allStaff, shift.staffId]
  );

  const shiftStart = new Date(shift.start);
  const shiftEnd = new Date(shift.end);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Shift
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this shift? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Staff Member</span>
            <span className="text-sm font-medium">
              {staffMember?.name || "Unknown"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Date</span>
            <span className="text-sm font-medium">
              {formatFullDayLabel(shiftStart)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Time</span>
            <span className="text-sm font-medium">
              {formatTimeRange(shiftStart, shiftEnd)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Station</span>
            <span className="text-sm font-medium">{shift.station}</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete Shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
