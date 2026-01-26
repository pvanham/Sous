"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Plus, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatTimeString,
  generateTimeSlots,
  getOperatingHoursRange,
  getStoreHoursForDay,
  extractTimeString,
  getTimePositionPercent,
  getDurationHeightPercent,
  getTimeFromPositionPercent,
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
  stations: string[],
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
 * StationShiftBlock - Individual shift block with dynamic hover overlay for DayStationView.
 * Separated component to scope hover state and prevent parent re-renders.
 */
interface StationShiftBlockProps {
  shift: ShiftDTO;
  station: string;
  selectedDay: Date;
  startTime: string;
  endTime: string;
  topPercent: number;
  heightPercent: number;
  leftPercent: number;
  widthPercent: number;
  staffName: string;
  stationColor: string;
  tooltipText: string;
  onShiftClick: (shift: ShiftDTO) => void;
  onCreateShift: (date: Date, time: string, station: string) => void;
  onDoubleClickCreate: (time: string, station: string) => void;
}

function StationShiftBlock({
  shift,
  station,
  selectedDay,
  startTime,
  endTime,
  topPercent,
  heightPercent,
  leftPercent,
  widthPercent,
  staffName,
  stationColor,
  tooltipText,
  onShiftClick,
  onCreateShift,
  onDoubleClickCreate,
}: StationShiftBlockProps) {
  // Use refs to track hover position without causing re-renders
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hoverTimeRef = useRef<string>(startTime);
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !buttonRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const blockHeight = rect.height;
    const yPercent = (mouseY / blockHeight) * 100;

    // Calculate snapped time at this position (30-min intervals)
    const snappedTime = getTimeFromPositionPercent(
      yPercent,
      startTime,
      endTime,
      30,
    );
    hoverTimeRef.current = snappedTime;

    // Convert snapped time back to Y position for button placement
    // This makes the button snap to 30-min grid lines instead of following cursor exactly
    const snappedYPercent = getTimePositionPercent(
      snappedTime,
      startTime,
      endTime,
    );
    const snappedY = (snappedYPercent / 100) * blockHeight;

    // Clamp button position to stay within bounds
    const clampedY = Math.max(8, Math.min(snappedY, blockHeight - 8));
    buttonRef.current.style.top = `${clampedY}px`;
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();

    if (!containerRef.current) {
      onDoubleClickCreate(startTime, station);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const blockHeight = rect.height;
    const yPercent = (clickY / blockHeight) * 100;

    // Calculate time at click position
    const clickTime = getTimeFromPositionPercent(
      yPercent,
      startTime,
      endTime,
      30,
    );
    onDoubleClickCreate(clickTime, station);
  };

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onCreateShift(selectedDay, hoverTimeRef.current, station);
  };

  return (
    <div
      ref={containerRef}
      className="absolute"
      style={{
        top: `${topPercent}%`,
        height: `${Math.max(heightPercent, 3)}%`,
        minHeight: "24px",
        left: `calc(${leftPercent}% + 2px)`,
        width: `calc(${widthPercent}% - 4px)`,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Shift block */}
      <div
        className={cn(
          "absolute inset-0 rounded-md border px-1 py-1 text-xs cursor-pointer hover:shadow-md hover:ring-2 hover:ring-ring transition-shadow overflow-hidden",
          stationColor,
        )}
        onClick={(e) => {
          e.stopPropagation();
          onShiftClick(shift);
        }}
        onDoubleClick={handleDoubleClick}
        title={tooltipText}
      >
        <div className="font-medium truncate">{staffName}</div>
        <div className="text-[10px] opacity-80">
          {formatTimeString(startTime)} - {formatTimeString(endTime)}
        </div>
      </div>

      {/* Dynamic hover overlay with + icon */}
      <button
        ref={buttonRef}
        className={cn(
          "absolute right-0.5 p-0.5 rounded-full bg-background/80 hover:bg-accent border border-border z-20 cursor-pointer transition-opacity",
          isHovering ? "opacity-100" : "opacity-0",
        )}
        style={{ top: "8px", transform: "translateY(-50%)" }}
        onClick={handleButtonClick}
        aria-label={`Add new shift at ${formatTimeString(hoverTimeRef.current)}`}
        title={`Add shift at ${formatTimeString(hoverTimeRef.current)}`}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * Check if a station has coverage gaps during operating hours.
 */
function hasGaps(
  shifts: ShiftDTO[],
  earliest: string,
  latest: string,
): boolean {
  if (shifts.length === 0) return true;

  // Sort shifts by start time
  const sorted = [...shifts].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
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
    const gap = (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60);
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
  // State for managing click timing to distinguish single vs double click
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [pendingEdit, setPendingEdit] = useState<ShiftDTO | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  // Handle delayed single-click edit
  useEffect(() => {
    if (pendingEdit) {
      clickTimerRef.current = setTimeout(() => {
        onEditShift(pendingEdit);
        setPendingEdit(null);
      }, 250);

      return () => {
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
        }
      };
    }
  }, [pendingEdit, onEditShift]);

  // Handle shift single click - delayed to allow double-click to cancel
  const handleShiftClick = (shift: ShiftDTO) => {
    setPendingEdit(shift);
  };

  // Handle shift double click - creates new shift at that time and station
  const handleShiftDoubleClick = (startTime: string, station: string) => {
    // Cancel pending single-click edit
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    setPendingEdit(null);
    // Create shift at this location
    onCreateShift(selectedDay, startTime, station);
  };

  // Get stations from config
  const stations = config?.stations || [];

  // Calculate time range based on operating hours (includes 2hr buffer for display)
  const { earliest, latest } = useMemo(() => {
    if (!config) {
      return { earliest: "06:00", latest: "23:00" };
    }
    return getOperatingHoursRange(config.operatingHours);
  }, [config]);

  // Get actual store hours for the selected day (no buffer) for coverage warnings
  const storeHours = useMemo(() => {
    if (!config) return null;
    return getStoreHoursForDay(config.operatingHours, selectedDay);
  }, [config, selectedDay]);

  // Generate time slots for Y-axis labels (every 30 minutes)
  const timeSlots = useMemo(
    () => generateTimeSlots(earliest, latest, 30),
    [earliest, latest],
  );

  // Get shifts for the selected day, grouped by station
  const dayShifts = useMemo(
    () => getShiftsForDay(shifts, selectedDay),
    [shifts, selectedDay],
  );

  const shiftsByStation = useMemo(
    () => getShiftsByStation(dayShifts, stations),
    [dayShifts, stations],
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
    <div
      className="overflow-x-auto"
      style={{ userSelect: "none" }}
      onMouseDown={(e) => {
        // Prevent text selection on double-click
        if (e.detail > 1) {
          e.preventDefault();
        }
      }}
    >
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
            // Only check for gaps during actual store hours (not buffered range)
            // If store is closed on this day, no coverage warning needed
            const hasCoverageGaps = storeHours
              ? hasGaps(stationShifts, storeHours.open, storeHours.close)
              : false;

            return (
              <div
                key={station}
                className="font-semibold text-sm text-center p-2 flex items-center justify-center gap-2"
              >
                <span>{station}</span>
                {hasCoverageGaps && (
                  <span title="Coverage gaps detected during store hours">
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
                      index % 2 === 0 && "border-border",
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
                      latest,
                    );
                    const durationMinutes =
                      (new Date(shift.end).getTime() -
                        new Date(shift.start).getTime()) /
                      (1000 * 60);
                    const heightPercent = getDurationHeightPercent(
                      durationMinutes,
                      earliest,
                      latest,
                    );

                    // Calculate horizontal position based on lane
                    const widthPercent = 100 / totalLanes;
                    const leftPercent = lane * widthPercent;

                    const staffName = getStaffName(staff, shift.staffId);
                    const stationColor = getStationColor(shift.station);

                    // Build tooltip text
                    const tooltipText = `${staffName}\n${station}\n${formatTimeString(startTime)} - ${formatTimeString(endTime)}`;

                    return (
                      <StationShiftBlock
                        key={shift.id}
                        shift={shift}
                        station={station}
                        selectedDay={selectedDay}
                        startTime={startTime}
                        endTime={endTime}
                        topPercent={topPercent}
                        heightPercent={heightPercent}
                        leftPercent={leftPercent}
                        widthPercent={widthPercent}
                        staffName={staffName}
                        stationColor={stationColor}
                        tooltipText={tooltipText}
                        onShiftClick={handleShiftClick}
                        onCreateShift={onCreateShift}
                        onDoubleClickCreate={handleShiftDoubleClick}
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
