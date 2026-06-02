"use client";

import { useState } from "react";
import type { DayOfWeek, WeeklyOperatingHoursDTO } from "@sous/types";
import { DAYS_OF_WEEK } from "@sous/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TimePicker } from "@/components/ui/time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StepOperationalSettingsProps = {
  initialWeekStartsOn: DayOfWeek;
  initialOperatingHours: WeeklyOperatingHoursDTO;
  onBackAction: () => void;
  onNextAction: (payload: {
    weekStartsOn: DayOfWeek;
    operatingHours: WeeklyOperatingHoursDTO;
  }) => void;
};

const dayLabels: Record<DayOfWeek, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export function StepOperationalSettings({
  initialWeekStartsOn,
  initialOperatingHours,
  onBackAction,
  onNextAction,
}: StepOperationalSettingsProps) {
  const [weekStartsOn, setWeekStartsOn] =
    useState<DayOfWeek>(initialWeekStartsOn);
  const [operatingHours, setOperatingHours] = useState<WeeklyOperatingHoursDTO>(
    initialOperatingHours,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Operational Settings
        </h2>
        <p className="text-sm text-muted-foreground">
          Set your week start and standard operating hours for this location.
        </p>
      </div>

      <div className="space-y-2 max-w-xs">
        <Label htmlFor="week-start-day">Week Start Day</Label>
        <Select
          value={weekStartsOn}
          onValueChange={(value) => setWeekStartsOn(value as DayOfWeek)}
        >
          <SelectTrigger id="week-start-day">
            <SelectValue placeholder="Select week start day" />
          </SelectTrigger>
          <SelectContent>
            {DAYS_OF_WEEK.map((day) => (
              <SelectItem key={day} value={day}>
                {dayLabels[day]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label>Operating Hours</Label>
        <div className="space-y-2">
          {DAYS_OF_WEEK.map((day) => {
            const slot = operatingHours[day];
            return (
              <div
                key={day}
                className="rounded border border-border p-3 flex items-center gap-3"
              >
                <div className="w-28 shrink-0 text-sm font-medium">{dayLabels[day]}</div>
                <div className="w-24 shrink-0 flex items-center gap-2">
                  <Switch
                    checked={slot.isOpen}
                    onCheckedChange={(checked) =>
                      setOperatingHours((prev) => ({
                        ...prev,
                        [day]: { ...prev[day], isOpen: checked },
                      }))
                    }
                  />
                  <span className="text-xs text-muted-foreground w-10">
                    {slot.isOpen ? "Open" : "Closed"}
                  </span>
                </div>
                <TimePicker
                  value={slot.open || "09:00"}
                  onChange={(event) =>
                    setOperatingHours((prev) => ({
                      ...prev,
                      [day]: { ...prev[day], open: event.target.value },
                    }))
                  }
                  disabled={!slot.isOpen}
                />
                <span className="text-muted-foreground">to</span>
                <TimePicker
                  value={slot.close || "17:00"}
                  onChange={(event) =>
                    setOperatingHours((prev) => ({
                      ...prev,
                      [day]: { ...prev[day], close: event.target.value },
                    }))
                  }
                  disabled={!slot.isOpen}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={onBackAction}>
          Back
        </Button>
        <Button
          type="button"
          onClick={() => onNextAction({ weekStartsOn, operatingHours })}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
