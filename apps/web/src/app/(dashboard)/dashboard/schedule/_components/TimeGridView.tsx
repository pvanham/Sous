"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatDayLabel,
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

interface TimeGridViewProps {
  shifts: ShiftDTO[];
  staff: StaffDTO[];
  weekDays: Date[];
  config: KitchenConfigDTO | null;
  timeOff?: TimeOffRequestDTO[];
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
  if (!Array.isArray(staff)) return "Unknown";
  const staffMember = staff.find((s) => s.id === staffId);
  return staffMember?.name || "Unknown";
}

/**
 * ShiftBlock - Individual shift block with dynamic hover overlay.
 * Separated component to scope hover state and prevent parent re-renders.
 */
interface ShiftBlockProps {
  shift: ShiftDTO;
  day: Date;
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
  onCreateShift: (day: Date, time: string) => void;
  onDoubleClickCreate: (day: Date, time: string) => void;
}

function ShiftBlock({
  shift,
  day,
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
}: ShiftBlockProps) {
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
      onDoubleClickCreate(day, startTime);
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
    onDoubleClickCreate(day, clickTime);
  };

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onCreateShift(day, hoverTimeRef.current);
  };

  return (
    <div
      ref={containerRef}
      className="absolute"
      style={{
        top: `${topPercent}%`,
        height: `${Math.max(heightPercent, 3)}%`,
        minHeight: "16px",
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
          "absolute inset-0 rounded cursor-pointer transition-all",
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
        {/* Staff name and station - visible when shift is tall enough */}
        <div className="absolute inset-0 p-1 overflow-hidden">
          <div className="font-sans text-[10px] font-medium truncate">
            {staffName}
          </div>
          <div className="font-mono text-[9px] text-muted-foreground truncate">
            {formatTimeString(startTime)}
          </div>
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
        aria-label={`Add new shift at ${formatTimeString(hoverTimeRef.current)}`}
        title={`Add shift at ${formatTimeString(hoverTimeRef.current)}`}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * TimeGridView - Time-based schedule grid.
 * Y-axis: Time slots from kitchen open to close
 * X-axis: Days of the week (Mon-Sun)
 *
 * Shifts are rendered as positioned blocks spanning their duration.
 * Uses Warm Industrial styling with stone palette.
 */
export function TimeGridView({
  shifts,
  staff,
  weekDays,
  config,
  timeOff,
  onCreateShift,
  onEditShift,
}: TimeGridViewProps) {
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

  // Handle shift double click - creates new shift at that time
  const handleShiftDoubleClick = (day: Date, startTime: string) => {
    // Cancel pending single-click edit
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    setPendingEdit(null);
    // Create shift at this location
    onCreateShift(day, startTime);
  };

  // Calculate time range based on operating hours, expanding for shifts outside store hours
  const { earliest, latest } = useMemo(() => {
    if (!config?.operatingHours) {
      return { earliest: "09:00", latest: "21:00" };
    }
    return getDisplayTimeRange(config.operatingHours, shifts);
  }, [config, shifts]);

  // Generate time slots for Y-axis labels (every 30 minutes)
  const timeSlots = useMemo(
    () => generateTimeSlots(earliest, latest, 30),
    [earliest, latest],
  );

  // Height per slot (30 minutes = 28px)
  const slotHeight = 28;
  const totalHeight = timeSlots.length * slotHeight;

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
      <div className="min-w-[900px]">
        {/* Header Row - Day Labels - Industrial style */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)] gap-1 border-b border-stone-300 dark:border-white/10 pb-2 mb-2">
          <div className="font-mono uppercase tracking-widest text-[10px] p-2 text-stone-500 dark:text-stone-400">
            Time
          </div>
          {weekDays.map((day) => {
            const offStaff = Array.isArray(staff)
              ? staff
                  .filter((s) => s.isActive)
                  .map((s) => ({
                    staff: s,
                    overlay: findTimeOffOverlay(timeOff, s.id, day),
                  }))
                  .filter(
                    (entry): entry is { staff: StaffDTO; overlay: TimeOffRequestDTO } =>
                      entry.overlay !== undefined,
                  )
              : [];
            return (
              <div
                key={day.toISOString()}
                className="p-2 text-center text-stone-500 dark:text-stone-400"
              >
                <div className="font-sans font-semibold uppercase tracking-widest text-[10px]">
                  {formatDayLabel(day)}
                </div>
                {offStaff.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
                    {offStaff.map(({ staff: s, overlay }) => (
                      <TimeOffPill
                        key={`${s.id}-${overlay.id}`}
                        request={{ ...overlay, reason: `${s.name}: ${overlay.reason ?? ""}`.trim() }}
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
        <div className="grid grid-cols-[80px_repeat(7,1fr)] gap-1">
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

          {/* Day Columns */}
          {weekDays.map((day) => {
            const dayShifts = getShiftsForDay(shifts, day);

            return (
              <div
                key={day.toISOString()}
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
                    onClick={() => onCreateShift(day, time)}
                  >
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="h-4 w-4 text-stone-400" />
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
                    const tooltipText = `${staffName}\n${shift.station}\n${formatTimeString(startTime)} - ${formatTimeString(endTime)}`;

                    return (
                      <ShiftBlock
                        key={shift.id}
                        shift={shift}
                        day={day}
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
