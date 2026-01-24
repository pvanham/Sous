"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatDayLabel,
  formatTimeString,
  generateTimeSlots,
  getOperatingHoursRange,
  extractTimeString,
  getTimePositionPercent,
  getDurationHeightPercent,
} from "@/lib/utils/date";
import { assignLanes } from "@/lib/utils/shift-overlap";
import { getStationColor } from "@/lib/utils/station-colors";
import type { ShiftDTO } from "@/types/shift";
import type { StaffDTO } from "@/types/staff";
import type { KitchenConfigDTO } from "@/types/kitchen-config";

interface TimeGridViewProps {
  shifts: ShiftDTO[];
  staff: StaffDTO[];
  weekDays: Date[];
  config: KitchenConfigDTO | null;
  onCreateShift: (date: Date, startTime: string) => void;
  onEditShift: (shift: ShiftDTO) => void;
}

/**
 * Get shifts for a specific day.
 */
function getShiftsForDay(shifts: ShiftDTO[], day: Date): ShiftDTO[] {
  return shifts.filter((shift) => {
    const shiftDay = new Date(shift.start);
    return (
      shiftDay.getFullYear() === day.getFullYear() &&
      shiftDay.getMonth() === day.getMonth() &&
      shiftDay.getDate() === day.getDate()
    );
  });
}

/**
 * Get staff name by ID.
 */
function getStaffName(staff: StaffDTO[], staffId: string): string {
  const staffMember = staff.find((s) => s.id === staffId);
  return staffMember?.name || "Unknown";
}

/**
 * TimeGridView - Time-based schedule grid.
 * Y-axis: Time slots from kitchen open to close
 * X-axis: Days of the week (Mon-Sun)
 *
 * Shifts are rendered as positioned blocks spanning their duration.
 */
export function TimeGridView({
  shifts,
  staff,
  weekDays,
  config,
  onCreateShift,
  onEditShift,
}: TimeGridViewProps) {
  // Calculate time range based on operating hours
  const { earliest, latest } = useMemo(() => {
    if (!config) {
      return { earliest: "06:00", latest: "23:00" };
    }
    return getOperatingHoursRange(config.operatingHours);
  }, [config]);

  // Generate time slots for Y-axis labels (every 30 minutes)
  const timeSlots = useMemo(
    () => generateTimeSlots(earliest, latest, 30),
    [earliest, latest]
  );

  // Height per slot (30 minutes = 40px)
  const slotHeight = 40;
  const totalHeight = timeSlots.length * slotHeight;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px]">
        {/* Header Row - Day Labels */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)] gap-1 border-b border-border pb-2 mb-2">
          <div className="font-semibold text-sm p-2 text-muted-foreground">
            Time
          </div>
          {weekDays.map((day) => (
            <div
              key={day.toISOString()}
              className="font-semibold text-sm text-center p-2"
            >
              {formatDayLabel(day)}
            </div>
          ))}
        </div>

        {/* Grid Body */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)] gap-1">
          {/* Time Labels Column */}
          <div className="relative" style={{ height: totalHeight }}>
            {timeSlots.map((time, index) => (
              <div
                key={time}
                className="absolute left-0 right-0 text-xs text-muted-foreground pr-2 text-right"
                style={{ top: index * slotHeight, height: slotHeight }}
              >
                <span className="-translate-y-1/2 inline-block">
                  {formatTimeString(time)}
                </span>
              </div>
            ))}
          </div>

          {/* Day Columns */}
          {weekDays.map((day) => {
            const dayShifts = getShiftsForDay(shifts, day);

            return (
              <div
                key={day.toISOString()}
                className="relative border-l border-border"
                style={{ height: totalHeight }}
              >
                {/* Time Grid Lines */}
                {timeSlots.map((time, index) => (
                  <div
                    key={time}
                    className={cn(
                      "absolute left-0 right-0 border-t border-border/50 cursor-pointer hover:bg-muted/50 transition-colors group",
                      index % 2 === 0 && "border-border"
                    )}
                    style={{ top: index * slotHeight, height: slotHeight }}
                    onClick={() => onCreateShift(day, time)}
                  >
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}

                {/* Shifts with lane assignment for overlapping */}
                {(() => {
                  const laneAssignments = assignLanes(dayShifts);
                  
                  return laneAssignments.map(({ shift, lane, totalLanes }) => {
                    const startTime = extractTimeString(new Date(shift.start));
                    const endTime = extractTimeString(new Date(shift.end));

                    // Calculate vertical position and height
                    const topPercent = getTimePositionPercent(
                      startTime,
                      earliest,
                      latest
                    );
                    const durationMinutes =
                      (new Date(shift.end).getTime() -
                        new Date(shift.start).getTime()) /
                      (1000 * 60);
                    const heightPercent = getDurationHeightPercent(
                      durationMinutes,
                      earliest,
                      latest
                    );

                    // Calculate horizontal position based on lane
                    const widthPercent = 100 / totalLanes;
                    const leftPercent = lane * widthPercent;

                    const staffName = getStaffName(staff, shift.staffId);
                    const stationColor = getStationColor(shift.station);

                    // Build tooltip text
                    const tooltipText = `${staffName}\n${shift.station}\n${formatTimeString(startTime)} - ${formatTimeString(endTime)}`;

                    return (
                      <div
                        key={shift.id}
                        className={cn(
                          "absolute rounded-md border cursor-pointer hover:shadow-md hover:ring-2 hover:ring-ring transition-shadow",
                          stationColor
                        )}
                        style={{
                          top: `${topPercent}%`,
                          height: `${Math.max(heightPercent, 3)}%`,
                          minHeight: "16px",
                          left: `calc(${leftPercent}% + 2px)`,
                          width: `calc(${widthPercent}% - 4px)`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditShift(shift);
                        }}
                        title={tooltipText}
                      />
                    );
                  });
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
