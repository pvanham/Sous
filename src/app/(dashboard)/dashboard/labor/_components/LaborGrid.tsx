"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { listLaborRequirements } from "@/server/actions/labor-requirement.actions";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { DAY_NAMES } from "@/lib/validations/labor-requirement.schema";
import { getStationClasses } from "@/lib/utils/station-colors";
import type { LaborRequirementDTO } from "@/types/labor-requirement";
import type { KitchenConfigDTO } from "@/types/kitchen-config";

import { RequirementCell } from "./RequirementCell";
import { RequirementFormDialog } from "./RequirementFormDialog";

// Query keys for TanStack Query
export const laborRequirementKeys = {
  all: ["laborRequirements"] as const,
  list: () => [...laborRequirementKeys.all, "list"] as const,
};

interface LaborGridProps {
  initialRequirements: LaborRequirementDTO[];
  initialConfig: KitchenConfigDTO | null;
}

// Day order starting from Monday (1) through Sunday (0)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function LaborGrid({ initialRequirements, initialConfig }: LaborGridProps) {
  const queryClient = useQueryClient();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<LaborRequirementDTO | null>(null);
  const [defaultStation, setDefaultStation] = useState<string>("");
  const [defaultDayOfWeek, setDefaultDayOfWeek] = useState<number>(1);

  // Fetch requirements with initial data
  const { data: requirements = [], isLoading: isLoadingRequirements } = useQuery({
    queryKey: laborRequirementKeys.list(),
    queryFn: async () => {
      const result = await listLaborRequirements();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    initialData: initialRequirements,
  });

  // Fetch kitchen config with initial data
  const { data: configResponse, isLoading: isLoadingConfig } = useQuery({
    queryKey: ["kitchenConfig"],
    queryFn: () => getKitchenConfig(),
    initialData: initialConfig ? { success: true as const, data: initialConfig } : undefined,
  });

  const config = configResponse?.success ? configResponse.data : null;
  const stations = config?.stations ?? [];

  // Group requirements by station and day for easy lookup
  const requirementsByCell = useMemo(() => {
    const map = new Map<string, LaborRequirementDTO[]>();
    
    for (const req of requirements) {
      const key = `${req.station}-${req.dayOfWeek}`;
      const existing = map.get(key) ?? [];
      existing.push(req);
      map.set(key, existing);
    }
    
    return map;
  }, [requirements]);

  // Calculate total hours per day for summary row
  const totalHoursByDay = useMemo(() => {
    const totals: Record<number, number> = {};
    
    for (const day of DAY_ORDER) {
      totals[day] = 0;
    }
    
    for (const req of requirements) {
      const startMinutes = parseTimeToMinutes(req.startTime);
      const endMinutes = parseTimeToMinutes(req.endTime);
      const hours = (endMinutes - startMinutes) / 60;
      // Multiply by preferredStaff to get total person-hours
      totals[req.dayOfWeek] += hours * req.preferredStaff;
    }
    
    return totals;
  }, [requirements]);

  // Handle cell click to open dialog
  const handleCellClick = (station: string, dayOfWeek: number, requirement?: LaborRequirementDTO) => {
    setDefaultStation(station);
    setDefaultDayOfWeek(dayOfWeek);
    setSelectedRequirement(requirement ?? null);
    setDialogOpen(true);
  };

  // Handle dialog close
  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedRequirement(null);
  };

  const isLoading = isLoadingRequirements || isLoadingConfig;

  if (isLoading && requirements.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Grid Header */}
          <div className="grid grid-cols-8 gap-1 border-b pb-2">
            <div className="px-3 py-2 font-medium text-sm text-muted-foreground">
              Station
            </div>
            {DAY_ORDER.map((day) => (
              <div
                key={day}
                className="px-3 py-2 text-center font-medium text-sm text-muted-foreground"
              >
                {DAY_NAMES[day].slice(0, 3)}
              </div>
            ))}
          </div>

          {/* Station Rows */}
          {stations.map((station) => (
            <div key={station} className="grid grid-cols-8 gap-1 border-b">
              {/* Station Label */}
              <div
                className={`px-3 py-3 font-medium text-sm flex items-center ${getStationClasses(station)}`}
              >
                {station}
              </div>
              
              {/* Day Cells */}
              {DAY_ORDER.map((day) => {
                const cellRequirements = requirementsByCell.get(`${station}-${day}`) ?? [];
                return (
                  <RequirementCell
                    key={`${station}-${day}`}
                    station={station}
                    dayOfWeek={day}
                    requirements={cellRequirements}
                    onCellClick={handleCellClick}
                  />
                );
              })}
            </div>
          ))}

          {/* Summary Row */}
          <div className="grid grid-cols-8 gap-1 bg-muted/50 mt-1">
            <div className="px-3 py-2 font-medium text-sm text-muted-foreground">
              Total Hours
            </div>
            {DAY_ORDER.map((day) => (
              <div
                key={day}
                className="px-3 py-2 text-center text-sm font-medium"
              >
                {totalHoursByDay[day] > 0 ? `${totalHoursByDay[day].toFixed(1)}h` : "-"}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form Dialog */}
      <RequirementFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        requirement={selectedRequirement ?? undefined}
        defaultStation={defaultStation}
        defaultDayOfWeek={defaultDayOfWeek}
        stations={stations}
      />
    </>
  );
}

/**
 * Parse time string (HH:MM) to minutes since midnight
 */
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
