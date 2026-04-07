"use client";

import { Badge } from "@/components/ui/badge";
import type { StaffDTO } from "@/types/staff";

interface StaffRowProps {
  staff: StaffDTO;
}

export function StaffRow({ staff }: StaffRowProps) {
  return (
    <div className="flex items-center gap-2 py-1 px-2 min-h-[44px] border-r border-stone-300/50 dark:border-white/5">
      <div className="flex flex-col">
        <span className="font-sans font-medium text-sm text-stone-900 dark:text-stone-100">
          {staff.name}
        </span>
        {staff.roles.length > 0 && (
          <span className="text-xs text-stone-500 dark:text-stone-400">
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
