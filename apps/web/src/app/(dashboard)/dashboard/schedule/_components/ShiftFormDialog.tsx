"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import type { ShiftDTO } from "@/types/shift";
import { ShiftForm } from "./ShiftForm";

interface ShiftFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string;

  // For create mode - pre-filled values
  staffId?: string;
  date?: Date;
  startTime?: string; // Pre-filled start time in "HH:mm" format
  station?: string; // Pre-filled station

  // For edit mode - existing shift data
  shift?: ShiftDTO;

  // Optional callback for delete action
  onDeleteClick?: () => void;

  // Enable staff selection via combobox (for Time/Day views)
  allowStaffSelection?: boolean;
}

export function ShiftFormDialog({
  mode,
  open,
  onOpenChange,
  scheduleId,
  staffId,
  date,
  startTime: prefilledStartTime,
  station: prefilledStation,
  shift,
  onDeleteClick,
  allowStaffSelection = false,
}: ShiftFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create Shift" : "Edit Shift"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a new shift to the schedule."
              : "Modify the existing shift details."}
          </DialogDescription>
        </DialogHeader>

        <div className="pt-2">
          {open && (
            <ShiftForm
              mode={mode}
              scheduleId={scheduleId}
              staffId={staffId}
              date={date}
              startTime={prefilledStartTime}
              station={prefilledStation}
              shift={shift}
              onDeleteClick={onDeleteClick}
              allowStaffSelection={allowStaffSelection}
              onSuccess={() => onOpenChange(false)}
              onCancel={() => onOpenChange(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
