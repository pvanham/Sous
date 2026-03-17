"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, Trash2, Eye, Loader2 } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  listTimeOffRequests,
  deleteTimeOffRequest,
} from "@/server/actions/time-off-request.actions";
import type { TimeOffRequestDTO } from "@/types/time-off-request";
import type { StaffDTO } from "@/types/staff";

import { TimeOffRequestReviewDialog } from "./TimeOffRequestReviewDialog";
import { CreateTimeOffRequestDialog } from "./CreateTimeOffRequestDialog";

// Query key factory (exported for use by child dialogs)
export const timeOffRequestKeys = {
  all: ["timeOffRequests"] as const,
  list: () => [...timeOffRequestKeys.all, "list"] as const,
};

// Status filter type
type StatusFilter = "all" | "pending" | "approved" | "denied";

// Badge variant mapping for statuses
function getStatusBadgeVariant(
  status: string
): "outline" | "default" | "destructive" {
  switch (status) {
    case "pending":
      return "outline";
    case "approved":
      return "default";
    case "denied":
      return "destructive";
    default:
      return "outline";
  }
}

interface TimeOffRequestTableProps {
  initialRequests: TimeOffRequestDTO[];
  initialStaff: StaffDTO[];
  minAdvanceDays: number;
}

const columnHelper = createColumnHelper<TimeOffRequestDTO>();

export function TimeOffRequestTable({
  initialRequests,
  initialStaff,
  minAdvanceDays,
}: TimeOffRequestTableProps) {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // URL-based staff filter (from StaffTable link)
  const staffIdFilter = searchParams.get("staffId");

  // State
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [reviewRequest, setReviewRequest] =
    useState<TimeOffRequestDTO | null>(null);
  const [deleteConfirmRequest, setDeleteConfirmRequest] =
    useState<TimeOffRequestDTO | null>(null);

  // Build staff name lookup map
  const staffNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const staff of initialStaff) {
      map.set(staff.id, staff.name);
    }
    return map;
  }, [initialStaff]);

  // Fetch time-off requests
  const { data: requests, isLoading } = useQuery({
    queryKey: timeOffRequestKeys.list(),
    queryFn: async () => {
      const result = await listTimeOffRequests();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    initialData: initialRequests,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteTimeOffRequest(id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Time-off request deleted");
      queryClient.invalidateQueries({ queryKey: timeOffRequestKeys.list() });
      setDeleteConfirmRequest(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Filter requests by status and optional staffId
  const filteredRequests = useMemo(() => {
    let filtered = requests ?? [];

    // Filter by staffId from URL if present
    if (staffIdFilter) {
      filtered = filtered.filter((r) => r.staffId === staffIdFilter);
    }

    // Filter by status tab
    if (statusFilter !== "all") {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    return filtered;
  }, [requests, statusFilter, staffIdFilter]);

  // Table columns
  const columns = useMemo(
    () => [
      columnHelper.accessor("staffId", {
        header: "Staff Member",
        cell: (info) => staffNameMap.get(info.getValue()) ?? "Unknown",
      }),
      columnHelper.accessor("startDate", {
        header: "Start Date",
        cell: (info) => format(new Date(info.getValue()), "MMM d, yyyy"),
      }),
      columnHelper.accessor("endDate", {
        header: "End Date",
        cell: (info) => format(new Date(info.getValue()), "MMM d, yyyy"),
      }),
      columnHelper.accessor("reason", {
        header: "Reason",
        cell: (info) => {
          const value = info.getValue();
          if (!value) return "—";
          return (
            <span className="truncate max-w-[150px] block">{value}</span>
          );
        },
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => {
          const status = info.getValue();
          return (
            <Badge variant={getStatusBadgeVariant(status)}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          );
        },
      }),
      columnHelper.display({
        id: "reviewInfo",
        header: "Reviewed",
        cell: (info) => {
          const request = info.row.original;
          if (request.status === "pending") {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <div className="text-sm">
              {request.reviewedAt && (
                <div>
                  {format(new Date(request.reviewedAt), "MMM d, yyyy")}
                </div>
              )}
              {request.notes && (
                <div className="text-muted-foreground truncate max-w-[150px]">
                  {request.notes}
                </div>
              )}
            </div>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: (info) => {
          const request = info.row.original;
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setReviewRequest(request)}
                title="Review"
              >
                <Eye className="h-4 w-4" />
              </Button>
              {request.status === "pending" && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteConfirmRequest(request)}
                  title="Delete"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        },
      }),
    ],
    [staffNameMap]
  );

  const table = useReactTable({
    data: filteredRequests,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // Staff name for the filtered view header
  const filteredStaffName = staffIdFilter
    ? staffNameMap.get(staffIdFilter)
    : null;

  return (
    <div className="space-y-4">
      {/* Header with filter tabs and create button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="denied">Denied</TabsTrigger>
            </TabsList>
          </Tabs>

          {filteredStaffName && (
            <span className="text-sm text-muted-foreground">
              Showing requests for{" "}
              <span className="font-medium text-foreground">
                {filteredStaffName}
              </span>
            </span>
          )}
        </div>

        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Request
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <h3 className="text-lg font-medium">No Time-Off Requests</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {statusFilter !== "all"
              ? `No ${statusFilter} requests found.`
              : "No time-off requests have been submitted yet."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Review Dialog */}
      <TimeOffRequestReviewDialog
        open={!!reviewRequest}
        onOpenChange={(open) => {
          if (!open) setReviewRequest(null);
        }}
        request={reviewRequest}
        staffName={
          reviewRequest
            ? staffNameMap.get(reviewRequest.staffId) ?? "Unknown"
            : ""
        }
      />

      {/* Create Dialog */}
      <CreateTimeOffRequestDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        staffList={initialStaff}
        minAdvanceDays={minAdvanceDays}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteConfirmRequest}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmRequest(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Time-Off Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this time-off request
              {deleteConfirmRequest
                ? ` for ${staffNameMap.get(deleteConfirmRequest.staffId) ?? "this staff member"}`
                : ""}
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmRequest) {
                  deleteMutation.mutate(deleteConfirmRequest.id);
                }
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
