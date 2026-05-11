"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, Loader2 } from "lucide-react";

import { listLaborRequirements } from "@/server/actions/labor-requirement.actions";
import { getKitchenConfig } from "@/server/actions/kitchen-config.actions";
import { DAY_NAMES } from "@/lib/validations/labor-requirement.schema";
import { getStationClasses } from "@/lib/utils/station-colors";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LaborRequirementDTO } from "@/types/labor-requirement";
import type { KitchenConfigDTO } from "@/types/kitchen-config";

import { RequirementCell } from "./RequirementCell";
import { RequirementFormDialog } from "./RequirementFormDialog";
import { BulkEditToolbar } from "./BulkEditToolbar";
import { BulkRequirementFormDialog } from "./BulkRequirementFormDialog";
import { BulkDeleteConfirmDialog } from "./BulkDeleteConfirmDialog";

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
  // Dialog state — kept as a single object so station/day/requirement are
  // always in sync when the dialog opens (avoids React batching timing issues).
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    station: string;
    dayOfWeek: number;
    requirement: LaborRequirementDTO | null;
  }>({ open: false, station: "", dayOfWeek: 1, requirement: null });

  /** Increments on each cell click so RequirementFormDialog remounts with correct defaultValues. */
  const [formDialogKey, setFormDialogKey] = useState(0);

  // Bulk edit state
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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

  // Fetch kitchen config with initial data.
  // IMPORTANT: this query key is shared across the app (schedule, shift form,
  // staff dialog, health dialog, etc.), so we MUST store the unwrapped config
  // in the cache. Otherwise consumers reading the cached value will see the
  // wrapped { success, data } response and crash on `.scheduleGenerationSettings`.
  const { data: config = null, isLoading: isLoadingConfig } = useQuery({
    queryKey: ["kitchenConfig"],
    queryFn: async () => {
      const result = await getKitchenConfig();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    initialData: initialConfig ?? undefined,
  });

  const stations = useMemo(() => config?.stations ?? [], [config?.stations]);

  // Group requirements by station and day for easy lookup, sorted by start time
  const requirementsByCell = useMemo(() => {
    const map = new Map<string, LaborRequirementDTO[]>();
    
    for (const req of requirements) {
      const key = `${req.station}-${req.dayOfWeek}`;
      const existing = map.get(key) ?? [];
      existing.push(req);
      map.set(key, existing);
    }

    // Sort each cell's slots by start time (earliest first)
    for (const [, reqs] of map) {
      reqs.sort((a, b) => a.startTime.localeCompare(b.startTime));
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

  const weeklyTotal = useMemo(() => {
    return Object.values(totalHoursByDay).reduce((sum, hours) => sum + hours, 0);
  }, [totalHoursByDay]);

  // Handle cell click to open dialog (only in normal mode)
  const handleCellClick = (station: string, dayOfWeek: number, requirement?: LaborRequirementDTO) => {
    if (bulkEditMode) return;
    setDialogState({ open: true, station, dayOfWeek, requirement: requirement ?? null });
    setFormDialogKey((k) => k + 1);
  };

  // Radix passes false when the user dismisses the dialog (overlay, Escape, etc.)
  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDialogState((prev) => ({ ...prev, open: false, requirement: null }));
    }
  };

  // Bulk edit handlers
  const toggleCellSelection = useCallback((station: string, dayOfWeek: number) => {
    const key = `${station}|${dayOfWeek}`;
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const selectAllCells = useCallback(() => {
    const allKeys = new Set<string>();
    for (const station of stations) {
      for (const day of DAY_ORDER) {
        allKeys.add(`${station}|${day}`);
      }
    }
    setSelectedCells(allKeys);
  }, [stations]);

  const clearSelection = useCallback(() => {
    setSelectedCells(new Set());
  }, []);

  const toggleBulkEditMode = useCallback(() => {
    setBulkEditMode((prev) => {
      if (prev) {
        // Exiting bulk mode - clear selection
        setSelectedCells(new Set());
      }
      return !prev;
    });
  }, []);

  const handleBulkApply = useCallback(() => {
    if (selectedCells.size > 0) {
      setBulkDialogOpen(true);
    }
  }, [selectedCells.size]);

  const handleBulkDelete = useCallback(() => {
    if (selectedCells.size > 0) {
      setDeleteDialogOpen(true);
    }
  }, [selectedCells.size]);

  const handleDeleteDialogClose = useCallback(() => {
    setDeleteDialogOpen(false);
  }, []);

  const handleDeleteSuccess = useCallback(() => {
    setSelectedCells(new Set());
    setBulkEditMode(false);
  }, []);

  const handleBulkDialogClose = useCallback(() => {
    setBulkDialogOpen(false);
    // Clear selection after successful bulk operation
    setSelectedCells(new Set());
    setBulkEditMode(false);
  }, []);

  // Convert selected cells to array format for bulk dialog
  const selectedCellsArray = useMemo(() => {
    return Array.from(selectedCells).map((key) => {
      const [station, dayStr] = key.split("|");
      return { station, dayOfWeek: Number(dayStr) };
    });
  }, [selectedCells]);

  const totalCells = stations.length * DAY_ORDER.length;
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
      {/* Bulk Edit Toolbar */}
      <BulkEditToolbar
        enabled={bulkEditMode}
        onToggle={toggleBulkEditMode}
        selectedCount={selectedCells.size}
        totalCells={totalCells}
        onSelectAll={selectAllCells}
        onClearSelection={clearSelection}
        onApply={handleBulkApply}
        onDelete={handleBulkDelete}
      />

      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="min-w-[800px]">
          {/* Grid Header */}
          <div
            className="grid border-b border-border bg-muted/40"
            style={{ gridTemplateColumns: "120px repeat(7, 1fr)" }}
          >
            <div className="px-3 py-2.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
              Station
            </div>
            {DAY_ORDER.map((day) => (
              <div
                key={day}
                className="px-2 py-2.5 text-center font-semibold text-xs uppercase tracking-wider text-muted-foreground border-l border-border"
              >
                {DAY_NAMES[day].slice(0, 3)}
              </div>
            ))}
          </div>

          {/* Station Rows */}
          {stations.map((station, stationIndex) => (
            <div
              key={station}
              className={`grid ${stationIndex < stations.length - 1 ? "border-b border-border" : ""}`}
              style={{ gridTemplateColumns: "120px repeat(7, 1fr)" }}
            >
              {/* Station Label */}
              <div
                className={`px-3 py-2 font-medium text-sm flex items-start pt-3 ${getStationClasses(station)}`}
              >
                {station}
              </div>
              
              {/* Day Cells */}
              {DAY_ORDER.map((day) => {
                const cellRequirements = requirementsByCell.get(`${station}-${day}`) ?? [];
                const cellKey = `${station}|${day}`;
                return (
                  <div
                    key={`${station}-${day}`}
                    className="border-l border-border min-h-[64px] max-h-[140px] overflow-y-auto"
                  >
                    <RequirementCell
                      station={station}
                      dayOfWeek={day}
                      requirements={cellRequirements}
                      onCellClick={handleCellClick}
                      bulkEditMode={bulkEditMode}
                      isSelected={selectedCells.has(cellKey)}
                      onToggleSelect={() => toggleCellSelection(station, day)}
                    />
                  </div>
                );
              })}
            </div>
          ))}

          {/* Summary Row */}
          <div
            className="grid border-t-2 border-border bg-muted/50"
            style={{ gridTemplateColumns: "120px repeat(7, 1fr)" }}
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="px-3 py-2 font-medium text-xs text-muted-foreground cursor-help flex items-center gap-1">
                    Total Hours
                    <Info className="h-3 w-3" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p>
                    Hours are calculated using <strong>preferred staff</strong>{" "}
                    counts. Each shift slot&apos;s duration (hours) is
                    multiplied by the preferred staff count to get total
                    person-hours.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {DAY_ORDER.map((day) => (
              <div
                key={day}
                className="px-2 py-2 text-center text-sm font-medium border-l border-border"
              >
                {totalHoursByDay[day] > 0 ? `${totalHoursByDay[day].toFixed(1)}h` : "-"}
              </div>
            ))}
          </div>

          {/* Weekly Total Row */}
          <div
            className="grid border-t border-border bg-muted/70"
            style={{ gridTemplateColumns: "120px repeat(7, 1fr)" }}
          >
            <div className="px-3 py-2 font-medium text-xs text-muted-foreground">
              Weekly Total
            </div>
            <div className="col-span-7 px-2 py-2 text-center text-sm font-bold border-l border-border">
              {weeklyTotal > 0 ? `${weeklyTotal.toFixed(1)} person-hours` : "-"}
            </div>
          </div>
        </div>
      </div>

      {/* Form Dialog — key forces remount so useForm defaultValues match the clicked cell */}
      <RequirementFormDialog
        key={formDialogKey}
        open={dialogState.open}
        onOpenChange={handleDialogOpenChange}
        requirement={dialogState.requirement ?? undefined}
        defaultStation={dialogState.station}
        defaultDayOfWeek={dialogState.dayOfWeek}
        stations={stations}
      />

      {/* Bulk Form Dialog */}
      <BulkRequirementFormDialog
        open={bulkDialogOpen}
        onOpenChange={handleBulkDialogClose}
        selectedCells={selectedCellsArray}
      />

      {/* Bulk Delete Confirmation */}
      <BulkDeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={handleDeleteDialogClose}
        selectedCells={selectedCellsArray}
        onSuccess={handleDeleteSuccess}
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
