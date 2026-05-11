"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatTimeString,
  generateTimeSlots,
  getDisplayTimeRange,
  extractTimeString,
  getTimePositionPercent,
  getDurationHeightPercent,
  getTimeFromPositionPercent,
} from "@/lib/utils/date";
import { assignLanes } from "@/lib/utils/shift-overlap";
import { getStationClasses } from "@/lib/utils/station-colors";
import type { ShiftDTO } from "@/types/shift";
import type { StaffDTO } from "@/types/staff";
import type { TimeOffRequestDTO } from "@/types/time-off-request";
import type { KitchenConfigDTO } from "@/types/kitchen-config";
import { TimeOffPill } from "./TimeOffPill";
import { findTimeOffOverlay } from "./time-off-overlay";

interface DayStationViewProps {
  shifts: ShiftDTO[];
  staff: StaffDTO[];
  selectedDay: Date;
  config: KitchenConfigDTO | null;
  timeOff?: TimeOffRequestDTO[];
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
  if (!Array.isArray(staff)) return "Unknown";
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
  stationClasses: string;
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
  stationClasses,
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
      {/* Shift block - Glass pill style with stone palette */}
      <div
        className={cn(
          "absolute inset-0 rounded px-1.5 py-1 cursor-pointer transition-all overflow-hidden",
          // Glass background - stone-based
          "bg-stone-100/50 dark:bg-stone-900/50 backdrop-blur-sm",
          // Borders - stone palette
          "border-y border-r border-stone-300 dark:border-white/10",
          // Station-specific colors (includes left border)
          stationClasses,
          // Hover state - brighten border only
          "hover:border-stone-400 dark:hover:border-white/20 hover:ring-1 hover:ring-primary",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onShiftClick(shift);
        }}
        onDoubleClick={handleDoubleClick}
        title={tooltipText}
      >
        <div className="font-sans text-xs font-medium truncate">
          {staffName}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {formatTimeString(startTime)} - {formatTimeString(endTime)}
        </div>
      </div>

      {/* Dynamic hover overlay with + icon */}
      <button
        ref={buttonRef}
        className={cn(
          "absolute right-0.5 p-0.5 rounded-full bg-card hover:bg-stone-100 dark:hover:bg-stone-700 border border-stone-300 dark:border-white/10 z-20 cursor-pointer transition-opacity",
          isHovering ? "opacity-100" : "opacity-0",
        )}
        style={{ top: "8px", transform: "translateY(-50%)" }}
        onClick={handleButtonClick}
        // eslint-disable-next-line react-hooks/refs
        aria-label={`Add new shift at ${formatTimeString(hoverTimeRef.current)}`}
        // eslint-disable-next-line react-hooks/refs
        title={`Add shift at ${formatTimeString(hoverTimeRef.current)}`}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}


/**
 * DayStationView - Station-based view for a single day.
 * X-axis: Stations
 * Y-axis: Time slots from kitchen open to close
 *
 * Helps visualize coverage per station.
 * Uses Warm Industrial styling with stone palette.
 */
export function DayStationView({
  shifts,
  staff,
  selectedDay,
  config,
  timeOff,
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
  const stations = useMemo(() => config?.stations || [], [config?.stations]);

  // Get shifts for the selected day
  const dayShifts = useMemo(
    () => getShiftsForDay(shifts, selectedDay),
    [shifts, selectedDay],
  );

  // Calculate time range based on operating hours, expanding for shifts outside store hours
  const { earliest, latest } = useMemo(() => {
    if (!config?.operatingHours) {
      return { earliest: "09:00", latest: "21:00" };
    }
    return getDisplayTimeRange(config.operatingHours, dayShifts);
  }, [config, dayShifts]);


  // Generate time slots for Y-axis labels (every 30 minutes)
  const timeSlots = useMemo(
    () => generateTimeSlots(earliest, latest, 30),
    [earliest, latest],
  );

  const shiftsByStation = useMemo(
    () => getShiftsByStation(dayShifts, stations),
    [dayShifts, stations],
  );

  // Height per slot (30 minutes = 28px)
  const slotHeight = 28;
  const totalHeight = timeSlots.length * slotHeight;

  if (stations.length === 0) {
    return (
      <div className="rounded border border-stone-300 dark:border-white/10 bg-muted/50 p-8 text-center">
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
        {/* Header Row - Station Labels - Industrial style */}
        <div
          className="grid gap-1 border-b border-stone-300 dark:border-white/10 pb-2 mb-2"
          style={{
            gridTemplateColumns: `80px repeat(${stations.length}, 1fr)`,
          }}
        >
          <div className="font-mono uppercase tracking-widest text-[10px] p-2 text-stone-500 dark:text-stone-400">
            Time
          </div>
          {stations.map((station) => {
            // Staff with overlapping time off on the selected day who
            // are NOT assigned this station today — surfacing them in
            // any column they're already on would be noise.
            const assignedStaffIds = new Set(
              (shiftsByStation.get(station) ?? []).map((s) => s.staffId),
            );
            const offStaff = Array.isArray(staff)
              ? staff
                  .filter((s) => s.isActive && !assignedStaffIds.has(s.id))
                  .map((s) => ({
                    staff: s,
                    overlay: findTimeOffOverlay(timeOff, s.id, selectedDay),
                  }))
                  .filter(
                    (entry): entry is { staff: StaffDTO; overlay: TimeOffRequestDTO } =>
                      entry.overlay !== undefined,
                  )
              : [];
            return (
              <div
                key={station}
                className="p-2 text-center text-stone-500 dark:text-stone-400"
              >
                <div className="font-sans font-semibold uppercase tracking-widest text-[10px] flex items-center justify-center gap-2">
                  <span>{station}</span>
                </div>
                {offStaff.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
                    {offStaff.map(({ staff: s, overlay }) => (
                      <TimeOffPill
                        key={`${s.id}-${overlay.id}`}
                        request={{
                          ...overlay,
                          reason: `${s.name}: ${overlay.reason ?? ""}`.trim(),
                        }}
                        className="normal-case"
                      />
                    ))}
                  </div>
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
                className="absolute left-0 right-0 font-mono text-xs text-stone-500 dark:text-stone-400 pr-2 text-right"
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
                className="relative border-l border-stone-300/50 dark:border-white/5"
                style={{ height: totalHeight }}
              >
                {/* Time Grid Lines - Subtle (Industrial) */}
                {timeSlots.map((time, index) => (
                  <div
                    key={time}
                    className={cn(
                      "absolute left-0 right-0 cursor-pointer hover:bg-stone-100/50 dark:hover:bg-stone-800/30 transition-colors group",
                      // Subtle grid lines - stone palette
                      "border-t border-stone-400/20",
                      // Hour lines slightly more visible
                      index % 2 === 0 && "border-stone-400/30",
                    )}
                    style={{ top: index * slotHeight, height: slotHeight }}
                    onClick={() => onCreateShift(selectedDay, time, station)}
                  >
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="h-4 w-4 text-stone-400" />
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
                    const stationClasses = getStationClasses(shift.station);

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
                        stationClasses={stationClasses}
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
