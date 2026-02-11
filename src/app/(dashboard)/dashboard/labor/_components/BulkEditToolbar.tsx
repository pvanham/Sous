"use client";

import { Button } from "@/components/ui/button";
import { Edit, X, CheckSquare, Square } from "lucide-react";

interface BulkEditToolbarProps {
  /** Whether bulk edit mode is enabled */
  enabled: boolean;
  /** Toggle bulk edit mode on/off */
  onToggle: () => void;
  /** Number of currently selected cells */
  selectedCount: number;
  /** Total number of selectable cells */
  totalCells: number;
  /** Select all cells */
  onSelectAll: () => void;
  /** Clear all selections */
  onClearSelection: () => void;
  /** Apply bulk operation to selected cells */
  onApply: () => void;
  /** Delete all requirements in selected cells */
  onDelete: () => void;
}

export function BulkEditToolbar({
  enabled,
  onToggle,
  selectedCount,
  totalCells,
  onSelectAll,
  onClearSelection,
  onApply,
  onDelete,
}: BulkEditToolbarProps) {
  return (
    <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg mb-4">
      <Button
        variant={enabled ? "default" : "outline"}
        size="sm"
        onClick={onToggle}
      >
        {enabled ? (
          <X className="h-4 w-4 mr-2" />
        ) : (
          <Edit className="h-4 w-4 mr-2" />
        )}
        {enabled ? "Exit Bulk Edit" : "Bulk Edit"}
      </Button>

      {enabled && (
        <>
          <div className="text-sm text-muted-foreground">
            {selectedCount} of {totalCells} cells selected
          </div>
          <Button variant="outline" size="sm" onClick={onSelectAll}>
            <CheckSquare className="h-4 w-4 mr-2" />
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={onClearSelection}>
            <Square className="h-4 w-4 mr-2" />
            Clear Selection
          </Button>
          <div className="border-l h-6 mx-2" />
          <Button size="sm" onClick={onApply} disabled={selectedCount === 0}>
            Add to Selected ({selectedCount})
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={selectedCount === 0}
          >
            Delete Selected
          </Button>
        </>
      )}
    </div>
  );
}
