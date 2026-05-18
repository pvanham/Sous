"use client";

import { useState, useEffect } from "react";
import { Plus, ArrowUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatFullDayLabel, formatTimeRange, formatShiftDuration } from "@/lib/utils/date";
import { getStationClasses } from "@/lib/utils/station-colors";
import type { ShiftDTO } from "@/types/shift";
import type { StaffDTO } from "@/types/staff";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ShiftForm } from "./ShiftForm";

interface ScheduleListViewProps {
  scheduleId: string;
  shifts: ShiftDTO[];
  staff: StaffDTO[];
  selectedDay: Date;
  onDeleteShift: (shift: ShiftDTO) => void;
}

export function ScheduleListView({
  scheduleId,
  shifts,
  staff,
  selectedDay,
  onDeleteShift,
}: ScheduleListViewProps) {
  const [activeMode, setActiveMode] = useState<"create" | "edit" | null>(null);
  const [activeShift, setActiveShift] = useState<ShiftDTO | null>(null);
  const [sortBy, setSortBy] = useState<"time" | "station" | "role">("time");

  const closeForm = () => {
    setActiveMode(null);
    setActiveShift(null);
  };

  // Close form if the active shift is deleted
  useEffect(() => {
    if (activeMode === "edit" && activeShift) {
      const stillExists = shifts.find((s) => s.id === activeShift.id);
      if (!stillExists) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        closeForm();
      }
    }
  }, [shifts, activeShift, activeMode]);

  // Find shifts for this day and apply sorting
  const dayShifts = shifts
    .filter((shift) => {
      const shiftDate = new Date(shift.start);
      return (
        shiftDate.getDate() === selectedDay.getDate() &&
        shiftDate.getMonth() === selectedDay.getMonth() &&
        shiftDate.getFullYear() === selectedDay.getFullYear()
      );
    })
    .sort((a, b) => {
      if (sortBy === "station") {
        if (a.station !== b.station) {
          return a.station.localeCompare(b.station);
        }
      } else if (sortBy === "role") {
        const staffA = staff.find((s) => s.id === a.staffId);
        const staffB = staff.find((s) => s.id === b.staffId);
        const roleA = staffA?.roles?.[0] || "";
        const roleB = staffB?.roles?.[0] || "";
        if (roleA !== roleB) {
          return roleA.localeCompare(roleB);
        }
      }
      
      // Fallback or "time" default sort
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });

  const handleCreateClick = () => {
    setActiveShift(null);
    setActiveMode("create");
  };

  const handleEditClick = (shift: ShiftDTO) => {
    setActiveShift(shift);
    setActiveMode("edit");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Pane: Shift List */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-lg font-semibold text-stone-800 dark:text-stone-200">
            Shifts for {formatFullDayLabel(selectedDay)}
          </h3>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 px-3 text-stone-700 hover:text-stone-900 border-stone-300 dark:border-stone-700 dark:text-stone-300">
                  <ArrowUpDown className="h-4 w-4 mr-2 text-stone-500" />
                  Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[160px]">
                <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as "time" | "station" | "role")}>
                  <DropdownMenuRadioItem value="time">Start Time</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="station">Station</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="role">Role</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateClick}
              className="h-9 px-4 text-stone-700 hover:text-stone-900 border-stone-300 dark:border-stone-700 dark:text-stone-300"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Shift
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-card overflow-hidden shadow-sm">
          <div className="flex flex-col divide-y divide-stone-200 dark:divide-stone-800">
            {dayShifts.length === 0 ? (
               <div className="text-center py-12 text-sm text-stone-500 dark:text-stone-400 font-medium bg-stone-50/50 dark:bg-stone-900/20">
                 No shifts scheduled for this day
               </div>
            ) : (
              dayShifts.map((shift) => {
                const staffMember = staff.find((s) => s.id === shift.staffId);
                const start = new Date(shift.start);
                const end = new Date(shift.end);
                const isSelected = activeMode === "edit" && activeShift?.id === shift.id;

                return (
                  <div
                    key={shift.id}
                    onClick={() => handleEditClick(shift)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleEditClick(shift);
                      }
                    }}
                    className={cn(
                      "flex flex-col sm:flex-row sm:items-center justify-between py-2 px-4 cursor-pointer transition-colors hover:bg-stone-50 dark:hover:bg-stone-900/50",
                      isSelected ? "bg-stone-100 dark:bg-stone-800/60 ring-1 ring-inset ring-stone-300 dark:ring-stone-600" : "bg-white dark:bg-black/20",
                      getStationClasses(shift.station)
                    )}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6">
                      {/* Time Range */}
                      <div className="font-mono text-[13px] font-semibold text-stone-700 dark:text-stone-300 w-32 shrink-0">
                        {formatTimeRange(start, end)}
                      </div>
                      {/* Staff Name and Role */}
                      <div className="flex flex-row items-center gap-2">
                        <span className="font-medium text-stone-900 dark:text-stone-100 text-[14px] leading-tight">
                          {staffMember ? staffMember.name : "Unknown Staff"}
                        </span>
                        {staffMember?.roles?.[0] && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800/80 px-1.5 py-0.5 rounded">
                            {staffMember.roles[0]}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:items-end gap-1 mt-1.5 sm:mt-0">
                      <div className="flex items-center justify-between sm:justify-end gap-4 text-sm w-full">
                        {/* Station */}
                        <div className="font-medium bg-stone-100 dark:bg-stone-800/80 px-2 py-0.5 rounded text-[11px] text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700/50 shadow-sm leading-tight">
                          {shift.station}
                        </div>

                        {/* Duration */}
                        <div className="font-mono text-[13px] font-bold text-stone-800 dark:text-stone-200 bg-stone-200/50 dark:bg-stone-800/50 px-2 py-0.5 rounded min-w-16 text-center border border-stone-300/50 dark:border-stone-700/50 shadow-sm shrink-0">
                          {formatShiftDuration(start, end)}
                        </div>
                      </div>
                      {/* Notes */}
                      {shift.notes && (
                        <span className="text-[10px] text-muted-foreground italic truncate max-w-[250px] leading-tight">
                          {shift.notes}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right Pane: Shift Form (Sticky) */}
      <div className="lg:col-span-1 border-t lg:border-t-0 pt-6 lg:pt-0">
        <div className="sticky top-6">
          {activeMode ? (
            <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-card p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold tracking-tight">
                {activeMode === "create" ? "Add Shift" : "Edit Shift"}
              </h3>
              <ShiftForm
                mode={activeMode}
                scheduleId={scheduleId}
                date={selectedDay}
                shift={activeShift || undefined}
                allowStaffSelection={true}
                onDeleteClick={activeMode === "edit" && activeShift ? () => onDeleteShift(activeShift) : undefined}
                onSuccess={closeForm}
                onCancel={closeForm}
              />
            </div>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/20 px-6 text-center text-stone-500">
              <p className="text-sm">Select a shift to view details or click &quot;Add Shift&quot; to create a new one.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
