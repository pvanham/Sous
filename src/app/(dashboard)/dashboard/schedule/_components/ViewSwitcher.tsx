"use client";

import { Users, Clock, LayoutGrid } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ScheduleViewType = "staff" | "time" | "day";

interface ViewSwitcherProps {
  currentView: ScheduleViewType;
  onViewChange: (view: ScheduleViewType) => void;
}

/**
 * ViewSwitcher - Tab navigation to switch between schedule view modes.
 * - Staff View: Y-axis is staff members, X-axis is days
 * - Time View: Y-axis is time slots, X-axis is days
 * - Day View: X-axis is stations, Y-axis is time slots for a single day
 */
export function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  return (
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
          <span className="hidden sm:inline font-sans">Week View</span>
        </TabsTrigger>
        <TabsTrigger value="day" className="gap-2">
          <LayoutGrid className="h-4 w-4" />
          <span className="hidden sm:inline font-sans">Day View</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
