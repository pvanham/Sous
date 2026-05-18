"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnnouncementPriority } from "@sous/types";

type PriorityToggleProps = {
  value: AnnouncementPriority;
  onChange: (value: AnnouncementPriority) => void;
  disabled?: boolean;
};

const PRIORITIES: AnnouncementPriority[] = ["Standard", "Urgent"];

export function PriorityToggle({
  value,
  onChange,
  disabled = false,
}: PriorityToggleProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PRIORITIES.map((priority) => {
        const active = value === priority;

        return (
          <Button
            key={priority}
            type="button"
            variant={active ? (priority === "Urgent" ? "destructive" : "default") : "outline"}
            aria-pressed={active}
            disabled={disabled}
            className={cn(!active && "text-muted-foreground")}
            onClick={() => onChange(priority)}
          >
            {priority}
          </Button>
        );
      })}
    </div>
  );
}
