"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { toast } from "sonner";
import {
  UserX,
  UserCheck,
  Pencil,
  Trash2,
  ArrowUpAZ,
  ArrowDownZA,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Calendar,
  CalendarOff,
  Mail,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  listStaffPaginated,
  setStaffActive,
  deleteStaff,
} from "@/server/actions/staff.actions";
import { inviteStaffToApp } from "@/server/actions/invitation.actions";
import type { StaffDTO, PaginatedStaffResult } from "@/types/staff";
import { StaffFormDialog } from "./StaffFormDialog";
import { cn } from "@/lib/utils";

interface StaffTableProps {
  initialData: PaginatedStaffResult;
}

const columnHelper = createColumnHelper<StaffDTO>();

// Helper to render proficiency stars
function ProficiencyStars({ level }: { level: number }) {
  return (
    <span className="text-yellow-500">
      {"★".repeat(level)}
      {"☆".repeat(5 - level)}
    </span>
  );
}

export function StaffTable({ initialData }: StaffTableProps) {
  const queryClient = useQueryClient();

  // State for pagination, sorting, and search
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Dialog states
  const [editStaff, setEditStaff] = useState<StaffDTO | null>(null);
  const [deleteConfirmStaff, setDeleteConfirmStaff] = useState<StaffDTO | null>(
    null,
  );

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch staff with pagination
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["staff", { page, pageSize, sortOrder, search }],
    queryFn: async () => {
      const result = await listStaffPaginated({
        page,
        pageSize,
        sortOrder,
        search: search || undefined,
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    initialData: page === 1 && !search ? initialData : undefined,
    placeholderData: (previousData) => previousData,
  });

  const staff = data?.staff || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({
      staffId,
      isActive,
    }: {
      staffId: string;
      isActive: boolean;
    }) => {
      const result = await setStaffActive(staffId, isActive);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      toast.success(
        `${data.name} is now ${data.isActive ? "active" : "inactive"}`,
      );
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (staffId: string) => {
      const result = await deleteStaff(staffId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Staff member deleted");
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      setDeleteConfirmStaff(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Send / resend invite mutation
  const inviteMutation = useMutation({
    mutationFn: async (staffId: string) => {
      const result = await inviteStaffToApp({ staffId });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      toast.success(`Invitation sent to ${data.emailAddress}`);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Define table columns
  const columns = [
    columnHelper.accessor("name", {
      header: () => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 data-[state=open]:bg-accent"
          onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
        >
          Name
          {sortOrder === "asc" ? (
            <ArrowUpAZ className="ml-2 h-4 w-4" />
          ) : (
            <ArrowDownZA className="ml-2 h-4 w-4" />
          )}
        </Button>
      ),
      cell: (info) => {
        const isInactive = !info.row.original.isActive;
        return (
          <span
            className={cn("font-medium", isInactive && "text-muted-foreground")}
          >
            {info.getValue()}
          </span>
        );
      },
    }),
    columnHelper.accessor("email", {
      header: "Email",
      cell: (info) => {
        const isInactive = !info.row.original.isActive;
        return (
          <span className={cn(isInactive && "text-muted-foreground/70")}>
            {info.getValue()}
          </span>
        );
      },
    }),
    columnHelper.accessor("phone", {
      header: "Phone",
      cell: (info) => {
        const phone = info.getValue();
        const isInactive = !info.row.original.isActive;
        // Format phone for display (if numeric)
        const formatted = /^\d{10,}$/.test(phone)
          ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`
          : phone;
        return (
          <span
            className={cn(
              "font-mono text-sm",
              isInactive && "text-muted-foreground/70",
            )}
          >
            {formatted}
          </span>
        );
      },
    }),
    columnHelper.accessor("roles", {
      header: "Roles",
      cell: (info) => {
        const isInactive = !info.row.original.isActive;
        return (
          <div className="flex flex-wrap gap-1">
            {info.getValue().map((role) => (
              <Badge
                key={role}
                variant={isInactive ? "outline" : "secondary"}
                className={cn(isInactive && "opacity-60")}
              >
                {role}
              </Badge>
            ))}
          </div>
        );
      },
    }),
    columnHelper.accessor("skills", {
      header: "Skills",
      cell: (info) => {
        const skills = info.getValue();
        const isInactive = !info.row.original.isActive;
        if (skills.length === 0) {
          return (
            <span className="text-muted-foreground text-sm">No skills</span>
          );
        }
        return (
          <div className="flex flex-wrap gap-1">
            {skills.map((skill) => (
              <Badge
                key={skill.station}
                variant="outline"
                className={cn(
                  "flex items-center gap-1",
                  isInactive && "opacity-60",
                )}
              >
                {skill.station}
                <ProficiencyStars level={skill.proficiency} />
              </Badge>
            ))}
          </div>
        );
      },
    }),
    columnHelper.accessor("isActive", {
      header: "Status",
      cell: (info) => (
        <Badge variant={info.getValue() ? "default" : "secondary"}>
          {info.getValue() ? "Active" : "Inactive"}
        </Badge>
      ),
    }),
    columnHelper.accessor("invitationStatus", {
      header: "App Access",
      cell: (info) => {
        const status = info.getValue();
        if (status === "accepted") {
          return (
            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
              Linked
            </Badge>
          );
        }
        if (status === "pending") {
          return (
            <Badge variant="outline" className="text-amber-600 border-amber-400">
              Pending
            </Badge>
          );
        }
        return (
          <span className="text-muted-foreground text-sm">Not Invited</span>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "Actions",
      cell: (info) => {
        const staffMember = info.row.original;
        const canInvite =
          !staffMember.clerkUserId &&
          staffMember.invitationStatus !== "pending";
        const canResend =
          !staffMember.clerkUserId &&
          staffMember.invitationStatus === "pending";
        return (
          <div className="flex items-center gap-1">
            {/* Send / Resend Invite Button */}
            {(canInvite || canResend) && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => inviteMutation.mutate(staffMember.id)}
                disabled={inviteMutation.isPending}
                title={canResend ? "Resend Invitation" : "Send App Invitation"}
              >
                <Mail className="h-4 w-4" />
              </Button>
            )}

            {/* Edit Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditStaff(staffMember)}
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </Button>

            {/* Availability Button */}
            <Button
              variant="ghost"
              size="icon"
              asChild
              title="Set Availability"
            >
              <Link href={`/dashboard/staff/${staffMember.id}/availability`}>
                <Calendar className="h-4 w-4" />
              </Link>
            </Button>

            {/* Time Off Button */}
            <Button
              variant="ghost"
              size="icon"
              asChild
              title="Time Off Requests"
            >
              <Link href={`/dashboard/time-off?staffId=${staffMember.id}`}>
                <CalendarOff className="h-4 w-4" />
              </Link>
            </Button>

            {/* Toggle Active Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                toggleActiveMutation.mutate({
                  staffId: staffMember.id,
                  isActive: !staffMember.isActive,
                })
              }
              disabled={toggleActiveMutation.isPending}
              title={staffMember.isActive ? "Deactivate" : "Activate"}
            >
              {staffMember.isActive ? (
                <UserX className="h-4 w-4" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )}
            </Button>

            {/* Delete Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeleteConfirmStaff(staffMember)}
              title="Delete"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    }),
  ];

  const table = useReactTable({
    data: staff,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      {/* Search and Controls */}
      <div className="flex items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        {/* Page Size Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">per page</span>
        </div>
      </div>

      {/* Loading Indicator */}
      {isFetching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      )}

      {/* Table */}
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
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {staff.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {search ? (
                    <div className="text-muted-foreground">
                      No staff found matching &quot;{search}&quot;
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      No staff members yet. Add staff to get started.
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    !row.original.isActive && "bg-muted/30 opacity-75",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-stone-500 dark:text-stone-400">
          Showing{" "}
          <span className="font-mono tabular-nums">
            {staff.length > 0 ? (page - 1) * pageSize + 1 : 0}
          </span>{" "}
          to{" "}
          <span className="font-mono tabular-nums">
            {Math.min(page * pageSize, total)}
          </span>{" "}
          of <span className="font-mono tabular-nums">{total}</span> staff
          members
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <div className="flex items-center gap-1 text-sm">
            Page{" "}
            <span className="font-mono font-medium tabular-nums">
              {page} of {totalPages}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Edit Dialog */}
      <StaffFormDialog
        open={!!editStaff}
        onOpenChange={(open) => !open && setEditStaff(null)}
        staff={editStaff || undefined}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmStaff}
        onOpenChange={(open) => !open && setDeleteConfirmStaff(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Staff Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete{" "}
              <span className="font-medium">{deleteConfirmStaff?.name}</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmStaff(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteConfirmStaff &&
                deleteMutation.mutate(deleteConfirmStaff.id)
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
