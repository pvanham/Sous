"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { bulkDeleteLaborRequirements } from "@/server/actions/labor-requirement.actions";
import { laborRequirementKeys } from "./LaborGrid";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface BulkDeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCells: Array<{ station: string; dayOfWeek: number }>;
  onSuccess?: () => void;
}

export function BulkDeleteConfirmDialog({
  open,
  onOpenChange,
  selectedCells,
  onSuccess,
}: BulkDeleteConfirmDialogProps) {
  const queryClient = useQueryClient();
  const count = selectedCells.length;

  const mutation = useMutation({
    mutationFn: () => bulkDeleteLaborRequirements({ cells: selectedCells }),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: laborRequirementKeys.list() });
        toast.success(
          `Deleted ${result.data.deleted} requirement(s) from ${count} cell(s).`
        );
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(result.error);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    },
  });

  const handleConfirm = () => {
    mutation.mutate();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Requirements</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete all labor requirements in the {count} selected
            cell{count !== 1 ? "s" : ""}. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
