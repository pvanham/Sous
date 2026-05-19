"use client";

import { useMemo, useState } from "react";
import type { ShiftSlotTemplate } from "@/lib/onboarding/templates";
import { DAY_NAMES } from "@/lib/validations/labor-requirement.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimePicker } from "@/components/ui/time-picker";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StepShiftSlotsProps = {
  stations: string[];
  initialShiftSlots: ShiftSlotTemplate[];
  onBackAction: () => void;
  onNextAction: (payload: ShiftSlotTemplate[]) => Promise<void>;
};

function dedupeNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function StepShiftSlots({
  stations,
  initialShiftSlots,
  onBackAction,
  onNextAction,
}: StepShiftSlotsProps) {
  const [slots, setSlots] = useState<ShiftSlotTemplate[]>(
    initialShiftSlots.length > 0
      ? initialShiftSlots
      : [
          {
            name: "Morning",
            startTime: "08:00",
            endTime: "16:00",
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            minStaff: 1,
            preferredStaff: 2,
            priority: "normal",
          },
        ],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withStation = slots.map((slot) => ({
    ...slot,
    station:
      (slot as ShiftSlotTemplate & { station?: string }).station ||
      stations[0] ||
      "Main Station",
  }));

  const canContinue = useMemo(
    () =>
      withStation.length > 0 &&
      withStation.every(
        (slot) =>
          Boolean(slot.station && slot.station.trim().length > 0) &&
          slot.startTime < slot.endTime &&
          slot.daysOfWeek.length > 0,
      ) &&
      !isSaving,
    [withStation, isSaving],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Shift Slots</h2>
        <p className="text-sm text-muted-foreground">
          Define your default staffing blocks. You can fine-tune requirements
          later in Shift Slots.
        </p>
      </div>

      <div className="space-y-3">
        {withStation.map((slot, index) => (
          <div
            key={`slot-${index}`}
            className="rounded border border-border p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <Label>Shift Slot {index + 1}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSlots((prev) =>
                    prev.filter((_, current) => current !== index),
                  )
                }
              >
                Remove
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Station</Label>
                <Select
                  value={slot.station}
                  onValueChange={(value) =>
                    setSlots((prev) =>
                      prev.map((current, currentIndex) =>
                        currentIndex === index
                          ? ({
                              ...current,
                              station: value,
                            } as ShiftSlotTemplate)
                          : current,
                      ),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select station" />
                  </SelectTrigger>
                  <SelectContent>
                    {stations.map((station) => (
                      <SelectItem key={station} value={station}>
                        {station}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start time</Label>
                <TimePicker
                  value={slot.startTime}
                  onChange={(event) =>
                    setSlots((prev) =>
                      prev.map((current, currentIndex) =>
                        currentIndex === index
                          ? { ...current, startTime: event.target.value }
                          : current,
                      ),
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>End time</Label>
                <TimePicker
                  value={slot.endTime}
                  onChange={(event) =>
                    setSlots((prev) =>
                      prev.map((current, currentIndex) =>
                        currentIndex === index
                          ? { ...current, endTime: event.target.value }
                          : current,
                      ),
                    )
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Min staff</Label>
                <Input
                  type="number"
                  min={0}
                  value={slot.minStaff}
                  onChange={(event) =>
                    setSlots((prev) =>
                      prev.map((current, currentIndex) =>
                        currentIndex === index
                          ? {
                              ...current,
                              minStaff: Number(event.target.value) || 0,
                            }
                          : current,
                      ),
                    )
                  }
                  placeholder="Min staff"
                />
              </div>
              <div className="space-y-2">
                <Label>Preferred staff</Label>
                <Input
                  type="number"
                  min={0}
                  value={slot.preferredStaff}
                  onChange={(event) =>
                    setSlots((prev) =>
                      prev.map((current, currentIndex) =>
                        currentIndex === index
                          ? {
                              ...current,
                              preferredStaff: Number(event.target.value) || 0,
                            }
                          : current,
                      ),
                    )
                  }
                  placeholder="Preferred staff"
                />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={slot.priority}
                  onValueChange={(value) =>
                    setSlots((prev) =>
                      prev.map((current, currentIndex) =>
                        currentIndex === index
                          ? {
                              ...current,
                              priority: value as ShiftSlotTemplate["priority"],
                            }
                          : current,
                      ),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Days of week</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {DAY_NAMES.map((day, dayIndex) => {
                  const checked = slot.daysOfWeek.includes(dayIndex);
                  return (
                    <label
                      key={`${slot.name}-${day}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          setSlots((prev) =>
                            prev.map((current, currentIndex) =>
                              currentIndex === index
                                ? {
                                    ...current,
                                    daysOfWeek: next
                                      ? dedupeNumbers([
                                          ...current.daysOfWeek,
                                          dayIndex,
                                        ])
                                      : current.daysOfWeek.filter(
                                          (value) => value !== dayIndex,
                                        ),
                                  }
                                : current,
                            ),
                          )
                        }
                      />
                      <span>{day}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() =>
          setSlots((prev) => [
            ...prev,
            {
              name: "",
              startTime: "09:00",
              endTime: "17:00",
              daysOfWeek: [1, 2, 3, 4, 5],
              minStaff: 1,
              preferredStaff: 2,
              priority: "normal",
            },
          ])
        }
      >
        Add Shift Slot
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBackAction}
          disabled={isSaving}
        >
          Back
        </Button>
        <Button
          type="button"
          disabled={!canContinue}
          onClick={async () => {
            setIsSaving(true);
            setError(null);
            try {
              await onNextAction(withStation);
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Failed to save shift slots",
              );
            } finally {
              setIsSaving(false);
            }
          }}
        >
          {isSaving ? "Saving..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}
