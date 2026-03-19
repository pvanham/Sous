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
    <div className="flex w-full items-center gap-3">
      {/* Day Selector - grows from the left; only rendered in Day View */}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-1">
        {currentView === "day" && onDayChange &&
          weekDays.map((day) => {
            const isSelected =
              selectedDay &&
              day.toDateString() === selectedDay.toDateString();
            return (
              <Button
                key={day.toISOString()}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => onDayChange(day)}
                className="min-w-[60px] shrink-0 whitespace-nowrap font-mono"
              >
                {formatDayLabel(day)}
              </Button>
            );
          })}
      </div>

      {/* View Mode Tabs — always pinned to the right */}
      <div className="ml-auto shrink-0">
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
      </div>
    </div>
  );
}
