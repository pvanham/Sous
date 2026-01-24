"use client";

import { useMemo } from "react";
import { Plus, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import {
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

interface DayStationViewProps {
  shifts: ShiftDTO[];
  staff: StaffDTO[];
  selectedDay: Date;
  config: KitchenConfigDTO | null;
  onCreateShift: (date: Date, startTime: string, station: string) => void;
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
 * Get shifts grouped by station.
 */
function getShiftsByStation(
  shifts: ShiftDTO[],
  stations: string[]
): Map<string, ShiftDTO[]> {
  const grouped = new Map<string, ShiftDTO[]>();

  for (const station of stations) {
    grouped.set(station, []);
  }

  for (const shift of shifts) {
    const stationShifts = grouped.get(shift.station);
    if (stationShifts) {
      stationShifts.push(shift);
    }
  }

  return grouped;
}

/**
 * Get staff name by ID.
 */
function getStaffName(staff: StaffDTO[], staffId: string): string {
  const staffMember = staff.find((s) => s.id === staffId);
  return staffMember?.name || "Unknown";
}

/**
 * Check if a station has coverage gaps during operating hours.
 */
function hasGaps(
  shifts: ShiftDTO[],
  earliest: string,
  latest: string
): boolean {
  if (shifts.length === 0) return true;

  // Sort shifts by start time
  const sorted = [...shifts].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const [startHour, startMin] = earliest.split(":").map(Number);
  const [endHour, endMin] = latest.split(":").map(Number);

  const operatingStart = startHour * 60 + startMin;
  const operatingEnd = endHour * 60 + endMin;

  // Check if first shift starts after operating hours begin
  const firstShiftStart = new Date(sorted[0].start);
  const firstShiftMinutes =
    firstShiftStart.getHours() * 60 + firstShiftStart.getMinutes();
  if (firstShiftMinutes > operatingStart + 30) return true; // 30 min tolerance

  // Check for gaps between shifts
  for (let i = 0; i < sorted.length - 1; i++) {
    const currentEnd = new Date(sorted[i].end);
    const nextStart = new Date(sorted[i + 1].start);
    const gap =
      (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60);
    if (gap > 30) return true; // More than 30 min gap
  }

  // Check if last shift ends before operating hours end
  const lastShiftEnd = new Date(sorted[sorted.length - 1].end);
  const lastShiftMinutes =
    lastShiftEnd.getHours() * 60 + lastShiftEnd.getMinutes();
  if (lastShiftMinutes < operatingEnd - 30) return true; // 30 min tolerance

  return false;
}

/**
 * DayStationView - Station-based view for a single day.
 * X-axis: Stations
 * Y-axis: Time slots from kitchen open to close
 *
 * Helps visualize coverage per station.
 */
export function DayStationView({
  shifts,
  staff,
  selectedDay,
  config,
  onCreateShift,
  onEditShift,
}: DayStationViewProps) {
  // Get stations from config
  const stations = config?.stations || [];

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

  // Get shifts for the selected day, grouped by station
  const dayShifts = useMemo(
    () => getShiftsForDay(shifts, selectedDay),
    [shifts, selectedDay]
  );

  const shiftsByStation = useMemo(
    () => getShiftsByStation(dayShifts, stations),
    [dayShifts, stations]
  );

  // Height per slot (30 minutes = 40px)
  const slotHeight = 40;
  const totalHeight = timeSlots.length * slotHeight;

  if (stations.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-8 text-center">
        <p className="text-muted-foreground">No stations configured.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Configure stations in Settings to use this view.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Header Row - Station Labels */}
        <div
          className="grid gap-1 border-b border-border pb-2 mb-2"
          style={{
            gridTemplateColumns: `80px repeat(${stations.length}, 1fr)`,
          }}
        >
          <div className="font-semibold text-sm p-2 text-muted-foreground">
            Time
          </div>
          {stations.map((station) => {
            const stationShifts = shiftsByStation.get(station) || [];
            const hasCoverageGaps = hasGaps(stationShifts, earliest, latest);

            return (
              <div
                key={station}
                className="font-semibold text-sm text-center p-2 flex items-center justify-center gap-2"
              >
                <span>{station}</span>
                {hasCoverageGaps && (
                  <span title="Coverage gaps detected">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Grid Body */}
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `80px repeat(${stations.length}, 1fr)`,
          }}
        >
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

          {/* Station Columns */}
          {stations.map((station) => {
            const stationShifts = shiftsByStation.get(station) || [];

            return (
              <div
                key={station}
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
                    onClick={() => onCreateShift(selectedDay, time, station)}
                  >
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}

                {/* Shifts with lane assignment for overlapping */}
                {(() => {
                  const laneAssignments = assignLanes(stationShifts);
                  
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

                    return (
                      <div
                        key={shift.id}
                        className={cn(
                          "absolute rounded-md border px-1 py-1 text-xs cursor-pointer hover:shadow-md transition-shadow overflow-hidden",
                          stationColor
                        )}
                        style={{
                          top: `${topPercent}%`,
                          height: `${Math.max(heightPercent, 3)}%`,
                          minHeight: "24px",
                          left: `calc(${leftPercent}% + 2px)`,
                          width: `calc(${widthPercent}% - 4px)`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditShift(shift);
                        }}
                      >
                        <div className="font-medium truncate">{staffName}</div>
                        <div className="text-[10px] opacity-80">
                          {formatTimeString(startTime)} -{" "}
                          {formatTimeString(endTime)}
                        </div>
                      </div>
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
