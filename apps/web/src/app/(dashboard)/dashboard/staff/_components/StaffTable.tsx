"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { toast } from "sonner";
import {
  UserX,
  UserCheck,
  Trash2,
  ArrowUpAZ,
  ArrowDownZA,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  Wrench,
  MoreHorizontal,
  SquarePen,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  listStaffPaginated,
  setStaffActive,
  deleteStaff,
} from "@/server/actions/staff.actions";
import { inviteStaffToApp } from "@/server/actions/invitation.actions";
import { listSkillChangeRequests } from "@/server/actions/skill-change-request.actions";
import type { StaffDTO, PaginatedStaffResult } from "@/types/staff";
import type { StaffListParams } from "@sous/types";
import { staffListParamsToSearchString } from "@/lib/staff-list-params";
import type { SkillChangeRequestDTO } from "@/types/skill-change-request";
import { cn } from "@/lib/utils";

export const staffKeys = {
  all: ["staff"] as const,
  list: (params: StaffListParams) =>
    [...staffKeys.all, "list", params] as const,
};

interface StaffTableProps {
  initialData: PaginatedStaffResult;
  initialParams: StaffListParams;
  initialError: string | null;
  initialSkillChangeRequests: SkillChangeRequestDTO[];
  roles: string[];
  stations: string[];
}

const tableFeaturesConfig = tableFeatures({});

const columnHelper = createColumnHelper<typeof tableFeaturesConfig, StaffDTO>();

const ALL_FILTER = "all";

function listParamsEqual(a: StaffListParams, b: StaffListParams): boolean {
  return (
    a.page === b.page &&
    a.pageSize === b.pageSize &&
    a.sortOrder === b.sortOrder &&
    (a.search || "") === (b.search || "") &&
    a.status === b.status &&
    (a.role || "") === (b.role || "") &&
    a.invitationStatus === b.invitationStatus &&
    (a.station || "") === (b.station || "")
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ProficiencyStars({ level }: { level: number }) {
  return (
    <>
      <span className="text-primary" aria-hidden="true">
        {"★".repeat(level)}
        {"☆".repeat(5 - level)}
      </span>
      <span className="sr-only">Proficiency {level} of 5</span>
    </>
  );
}

export function StaffTable({
  initialData,
  initialParams,
  initialError,
  initialSkillChangeRequests,
  roles,
  stations,
}: StaffTableProps) {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(initialParams.page);
  const [pageSize, setPageSize] = useState(initialParams.pageSize);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(
    initialParams.sortOrder,
  );
  const [searchInput, setSearchInput] = useState(initialParams.search ?? "");
  const [search, setSearch] = useState(initialParams.search ?? "");
  const [status, setStatus] = useState(initialParams.status ?? "all");
  const [role, setRole] = useState(initialParams.role);
  const [invitationStatus, setInvitationStatus] = useState(
    initialParams.invitationStatus ?? "all",
  );
  const [station, setStation] = useState(initialParams.station);

  const [deleteConfirmStaff, setDeleteConfirmStaff] = useState<StaffDTO | null>(
    null,
  );
  const [deactivateConfirmStaff, setDeactivateConfirmStaff] =
    useState<StaffDTO | null>(null);

  const listParams = useMemo<StaffListParams>(
    () => ({
      page,
      pageSize,
      sortOrder,
      search: search || undefined,
      status,
      role,
      invitationStatus,
      station,
    }),
    [
      page,
      pageSize,
      sortOrder,
      search,
      status,
      role,
      invitationStatus,
      station,
    ],
  );

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const qs = staffListParamsToSearchString(listParams);
    const next = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [listParams]);

  const { data: skillChangeRequests = initialSkillChangeRequests } = useQuery({
    queryKey: ["skillChangeRequests", "pending"],
    queryFn: async () => {
      const result = await listSkillChangeRequests({ status: "pending" });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    initialData: initialSkillChangeRequests,
  });

  const pendingByStaff = useMemo(() => {
    const map = new Map<string, SkillChangeRequestDTO[]>();
    for (const request of skillChangeRequests) {
      const existing = map.get(request.staffId);
      if (existing) existing.push(request);
      else map.set(request.staffId, [request]);
    }
    return map;
  }, [skillChangeRequests]);

  const matchesInitial = listParamsEqual(listParams, initialParams);

  const { data, isFetching, isError, error } = useQuery({
    queryKey: staffKeys.list(listParams),
    queryFn: async () => {
      const result = await listStaffPaginated(listParams);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    initialData: matchesInitial && !initialError ? initialData : undefined,
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page]);

  const staff = data?.staff || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const loadError =
    isError && error instanceof Error
      ? error.message
      : !data && initialError
        ? initialError
        : null;

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
    onMutate: async ({ staffId, isActive }) => {
      await queryClient.cancelQueries({ queryKey: staffKeys.all });
      const key = staffKeys.list(listParams);
      const previous = queryClient.getQueryData<PaginatedStaffResult>(key);
      queryClient.setQueryData<PaginatedStaffResult>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          staff: old.staff.map((member) =>
            member.id === staffId ? { ...member, isActive } : member,
          ),
        };
      });
      return { previous, key };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
      toast.error(err.message);
    },
    onSuccess: (updated) => {
      toast.success(
        `${updated.name} is now ${updated.isActive ? "active" : "inactive"}`,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.all });
      setDeactivateConfirmStaff(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (staffId: string) => {
      const result = await deleteStaff(staffId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (staffId) => {
      await queryClient.cancelQueries({ queryKey: staffKeys.all });
      const key = staffKeys.list(listParams);
      const previous = queryClient.getQueryData<PaginatedStaffResult>(key);
      queryClient.setQueryData<PaginatedStaffResult>(key, (old) => {
        if (!old) return old;
        const nextTotal = Math.max(0, old.total - 1);
        return {
          ...old,
          staff: old.staff.filter((member) => member.id !== staffId),
          total: nextTotal,
          totalPages: Math.max(1, Math.ceil(nextTotal / old.pageSize)),
        };
      });
      return { previous, key };
    },
    onError: (err: Error, _staffId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
      toast.error(err.message);
    },
    onSuccess: () => {
      toast.success("Staff member deleted");
      setDeleteConfirmStaff(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (staffId: string) => {
      const result = await inviteStaffToApp({ staffId });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (staffId) => {
      await queryClient.cancelQueries({ queryKey: staffKeys.all });
      const key = staffKeys.list(listParams);
      const previous = queryClient.getQueryData<PaginatedStaffResult>(key);
      queryClient.setQueryData<PaginatedStaffResult>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          staff: old.staff.map((member) =>
            member.id === staffId
              ? { ...member, invitationStatus: "pending" as const }
              : member,
          ),
        };
      });
      return { previous, key };
    },
    onError: (err: Error, _staffId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
      toast.error(err.message);
    },
    onSuccess: (invite) => {
      toast.success(`Invitation sent to ${invite.emailAddress}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
  });

  const columns = useMemo(
    () =>
      columnHelper.columns([
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
            const staffMember = info.row.original;
            const isInactive = !staffMember.isActive;
            const pendingSkillChanges =
              pendingByStaff.get(staffMember.id) ?? [];
            const showMissingRate =
              staffMember.isActive && staffMember.hourlyRate === 0;
            return (
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8 shrink-0 border border-border/60">
                  {staffMember.imageUrl ? (
                    <AvatarImage
                      src={staffMember.imageUrl}
                      alt=""
                    />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {getInitials(staffMember.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Link
                    href={`/dashboard/staff/${staffMember.id}`}
                    className={cn(
                      "font-medium hover:underline",
                      isInactive && "text-muted-foreground",
                    )}
                  >
                    {info.getValue()}
                  </Link>
                  {showMissingRate && (
                    <Badge
                      variant="outline"
                      className="text-muted-foreground font-normal"
                    >
                      No rate
                    </Badge>
                  )}
                  {pendingSkillChanges.length > 0 && (
                    <Link
                      href={`/dashboard/staff/${staffMember.id}?tab=skills`}
                      title={`Review ${pendingSkillChanges.length} pending skill change${
                        pendingSkillChanges.length === 1 ? "" : "s"
                      }`}
                      className="flex items-center gap-1 rounded-full border border-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary"
                    >
                      <Wrench className="h-3 w-3" />
                      {pendingSkillChanges.length}
                    </Link>
                  )}
                </div>
              </div>
            );
          },
        }),
        columnHelper.accessor("phone", {
          header: "Phone",
          cell: (info) => {
            const phone = info.getValue();
            const isInactive = !info.row.original.isActive;
            const formatted = /^\d{10,}$/.test(phone)
              ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`
              : phone;
            return (
              <span
                className={cn(
                  "whitespace-nowrap font-mono text-sm",
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
                {info.getValue().map((memberRole) => (
                  <Badge
                    key={memberRole}
                    variant={isInactive ? "outline" : "secondary"}
                    className={cn(isInactive && "opacity-60")}
                  >
                    {memberRole}
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
            const visible = skills.slice(0, 2);
            const overflow = skills.length - visible.length;
            return (
              <div className="flex flex-wrap gap-1">
                {visible.map((skill) => (
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
                {overflow > 0 && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-muted-foreground",
                      isInactive && "opacity-60",
                    )}
                  >
                    +{overflow}
                  </Badge>
                )}
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
            const inviteStatus = info.getValue();
            if (inviteStatus === "accepted") {
              return <Badge variant="default">Linked</Badge>;
            }
            if (inviteStatus === "pending") {
              return <Badge variant="outline">Pending</Badge>;
            }
            return (
              <span className="text-muted-foreground text-sm">Not Invited</span>
            );
          },
        }),
        columnHelper.display({
          id: "actions",
          header: () => <div className="text-right">Actions</div>,
          cell: (info) => {
            const staffMember = info.row.original;
            const canInvite =
              !staffMember.clerkUserId &&
              staffMember.invitationStatus !== "pending";
            const canResend =
              !staffMember.clerkUserId &&
              staffMember.invitationStatus === "pending";
            const isRowPending =
              (toggleActiveMutation.isPending &&
                toggleActiveMutation.variables?.staffId === staffMember.id) ||
              (deleteMutation.isPending &&
                deleteMutation.variables === staffMember.id) ||
              (inviteMutation.isPending &&
                inviteMutation.variables === staffMember.id);
            return (
              <div className="flex items-center justify-end gap-1">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/dashboard/staff/${staffMember.id}`}>
                    <SquarePen className="mr-1.5 h-3.5 w-3.5" />
                    Manage
                  </Link>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="More actions"
                      disabled={isRowPending}
                    >
                      {isRowPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MoreHorizontal className="h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(canInvite || canResend) && (
                      <DropdownMenuItem
                        disabled={isRowPending}
                        onSelect={() => inviteMutation.mutate(staffMember.id)}
                      >
                        <Mail className="h-4 w-4" />
                        {canResend ? "Resend invitation" : "Send app invitation"}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      disabled={isRowPending}
                      onSelect={() => {
                        if (staffMember.isActive) {
                          setDeactivateConfirmStaff(staffMember);
                          return;
                        }
                        toggleActiveMutation.mutate({
                          staffId: staffMember.id,
                          isActive: true,
                        });
                      }}
                    >
                      {staffMember.isActive ? (
                        <UserX className="h-4 w-4" />
                      ) : (
                        <UserCheck className="h-4 w-4" />
                      )}
                      {staffMember.isActive ? "Deactivate" : "Activate"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      disabled={isRowPending}
                      onSelect={(event) => {
                        event.preventDefault();
                        setDeleteConfirmStaff(staffMember);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          },
        }),
      ]),
    [
      sortOrder,
      pendingByStaff,
      toggleActiveMutation,
      deleteMutation,
      inviteMutation,
    ],
  );

  const table = useTable({
    features: tableFeaturesConfig,
    data: staff,
    columns,
  });

  const showingFrom = staff.length > 0 ? (page - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[16rem] flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or phone..."
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>

          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as StaffListParams["status"]);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={role ?? ALL_FILTER}
            onValueChange={(value) => {
              setRole(value === ALL_FILTER ? undefined : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>All roles</SelectItem>
              {roles.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={station ?? ALL_FILTER}
            onValueChange={(value) => {
              setStation(value === ALL_FILTER ? undefined : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Station" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>All stations</SelectItem>
              {stations.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={invitationStatus}
            onValueChange={(value) => {
              setInvitationStatus(
                value as StaffListParams["invitationStatus"],
              );
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="App access" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All app access</SelectItem>
              <SelectItem value="accepted">Linked</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="not_invited">Not invited</SelectItem>
            </SelectContent>
          </Select>

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
      </div>

      {isFetching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          Couldn&apos;t load staff. {loadError}
        </div>
      )}

      <div className="rounded-md border">
        <Table aria-busy={isFetching || undefined}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const hideOnMobile = header.column.id === "phone";
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        header.column.id === "name"
                          ? sortOrder === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                      className={cn(hideOnMobile && "hidden md:table-cell")}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
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
                  {loadError ? (
                    <div className="text-muted-foreground">
                      Staff could not be loaded.
                    </div>
                  ) : search ||
                    status !== "all" ||
                    role ||
                    station ||
                    invitationStatus !== "all" ? (
                    <div className="text-muted-foreground">
                      No staff match the current filters
                      {search ? (
                        <>
                          {" "}
                          for &quot;{search}&quot;
                        </>
                      ) : null}
                      .
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
                  {row.getAllCells().map((cell) => {
                    const hideOnMobile = cell.column.id === "phone";
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(hideOnMobile && "hidden md:table-cell")}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div
          className="text-sm text-muted-foreground"
          aria-live="polite"
        >
          Showing{" "}
          <span className="font-mono tabular-nums">{showingFrom}</span> to{" "}
          <span className="font-mono tabular-nums">{showingTo}</span> of{" "}
          <span className="font-mono tabular-nums">{total}</span> staff
          members
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
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
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            disabled={page >= totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      <Dialog
        open={!!deactivateConfirmStaff}
        onOpenChange={(open) => !open && setDeactivateConfirmStaff(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate staff member</DialogTitle>
            <DialogDescription>
              Deactivate{" "}
              <span className="font-medium">
                {deactivateConfirmStaff?.name}
              </span>
              ? They will be hidden from schedule generation until you activate
              them again. Existing shifts are not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeactivateConfirmStaff(null)}
              disabled={toggleActiveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                deactivateConfirmStaff &&
                toggleActiveMutation.mutate({
                  staffId: deactivateConfirmStaff.id,
                  isActive: false,
                })
              }
              disabled={toggleActiveMutation.isPending}
            >
              {toggleActiveMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteConfirmStaff}
        onOpenChange={(open) => !open && setDeleteConfirmStaff(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Staff Member</DialogTitle>
            <DialogDescription>
              Permanently delete{" "}
              <span className="font-medium">{deleteConfirmStaff?.name}</span>?
              This also removes their shifts, time-off requests, availability,
              shift exchanges, and skill-change requests. This action cannot be
              undone.
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
