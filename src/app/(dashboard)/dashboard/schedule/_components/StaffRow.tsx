"use client";

import { Badge } from "@/components/ui/badge";
import type { StaffDTO } from "@/types/staff";

interface StaffRowProps {
  staff: StaffDTO;
}

export function StaffRow({ staff }: StaffRowProps) {
  return (
    <div className="flex items-center gap-2 py-2 px-2 min-h-[80px] border-r border-border">
      <div className="flex flex-col">
        <span className="font-medium text-sm">{staff.name}</span>
        {staff.roles.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {staff.roles[0]}
          </span>
        )}
      </div>
      {!staff.isActive && (
        <Badge variant="outline" className="text-[10px] px-1 py-0">
          Inactive
        </Badge>
      )}
    </div>
  );
}
