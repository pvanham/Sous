"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const LABELS: Record<string, string> = {
  preferences: "Staff Preferences (Station/Time)",
  fairness: "Hour Fairness (Minimize hour disparity)",
  cost: "Labor Cost (Prefer lower rates)",
};

interface ArrayRankingFieldProps {
  items: ("preferences" | "fairness" | "cost")[];
  onChange: (items: ("preferences" | "fairness" | "cost")[]) => void;
}

export function ArrayRankingField({ items, onChange }: ArrayRankingFieldProps) {
  
  const moveUp = (index: number) => {
    if (index === 0) return;
    const newItems = [...items];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    onChange(newItems);
  };

  const moveDown = (index: number) => {
    if (index === items.length - 1) return;
    const newItems = [...items];
    [newItems[index + 1], newItems[index]] = [newItems[index], newItems[index + 1]];
    onChange(newItems);
  };

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div
          key={item}
          className="flex items-center justify-between p-3 border rounded-md bg-background"
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium">
              {index + 1}
            </span>
            <span className="text-sm font-medium">{LABELS[item]}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={index === 0}
              onClick={() => moveUp(index)}
            >
              <ArrowUp className="h-4 w-4" />
              <span className="sr-only">Move Up</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={index === items.length - 1}
              onClick={() => moveDown(index)}
            >
              <ArrowDown className="h-4 w-4" />
              <span className="sr-only">Move Down</span>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
