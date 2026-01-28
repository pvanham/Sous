"use client";

import { Users, Clock, LayoutGrid } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { formatDayLabel } from "@/lib/utils/date";

export type ScheduleViewType = "staff" | "time" | "day";

interface ViewSwitcherProps {
  currentView: ScheduleViewType;
  onViewChange: (view: ScheduleViewType) => void;
  weekDays: Date[];
  selectedDay?: Date;
  onDayChange?: (day: Date) => void;
}

/**
 * ViewSwitcher - Tab navigation to switch between schedule view modes.
 * - Staff View: Y-axis is staff members, X-axis is days
 * - Time View: Y-axis is time slots, X-axis is days
 * - Day View: X-axis is stations, Y-axis is time slots for a single day
 */
export function ViewSwitcher({
  currentView,
  onViewChange,
  weekDays,
  selectedDay,
  onDayChange,
}: ViewSwitcherProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* View Mode Tabs */}
      <Tabs
        value={currentView}
        onValueChange={(value) => onViewChange(value as ScheduleViewType)}
      >
        <TabsList>
          <TabsTrigger value="staff" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline font-sans">Staff View</span>
          </TabsTrigger>
          <TabsTrigger value="time" className="gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline font-sans">Time View</span>
          </TabsTrigger>
          <TabsTrigger value="day" className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline font-sans">Day View</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Day Selector - Only shown in Day View */}
      {currentView === "day" && onDayChange && (
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {weekDays.map((day) => {
            const isSelected =
              selectedDay &&
              day.toDateString() === selectedDay.toDateString();
            return (
              <Button
                key={day.toISOString()}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => onDayChange(day)}
                className="min-w-[60px] whitespace-nowrap font-mono"
              >
                {formatDayLabel(day)}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
