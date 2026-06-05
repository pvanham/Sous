"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  CalendarOff,
  Loader2,
  Mail,
  MoreVertical,
  Trash2,
  UserCheck,
  UserCog,
  UserX,
  Wrench,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  deleteStaff,
  getStaffById,
  setStaffActive,
} from "@/server/actions/staff.actions";
import { inviteStaffToApp } from "@/server/actions/invitation.actions";
import type { StaffDTO } from "@/types/staff";
import type { StaffAvailabilityDTO } from "@/types/staff-availability";
import type { TimeOffRequestDTO } from "@/types/time-off-request";
import type { SkillChangeRequestDTO } from "@/types/skill-change-request";

import { StaffProfilePanel } from "./StaffProfilePanel";
import { StaffAvailabilityPanel } from "./StaffAvailabilityPanel";
import { StaffTimeOffPanel } from "./StaffTimeOffPanel";
import { StaffSkillRequestsPanel } from "./StaffSkillRequestsPanel";

type StaffTab = "profile" | "availability" | "time-off" | "skills";

const VALID_TABS: readonly StaffTab[] = [
  "profile",
  "availability",
  "time-off",
  "skills",
];

interface StaffDetailProps {
  initialStaff: StaffDTO;
  initialAvailability: StaffAvailabilityDTO[];
  initialTimeOffRequests: TimeOffRequestDTO[];
  initialSkillChangeRequests: SkillChangeRequestDTO[];
  roles: string[];
  stations: string[];
  minTimeOffAdvanceDays: number;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function StaffDetail({
  initialStaff,
  initialAvailability,
  initialTimeOffRequests,
  initialSkillChangeRequests,
  roles,
  stations,
  minTimeOffAdvanceDays,
}: StaffDetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const requestedTab = searchParams.get("tab");
  const activeTab: StaffTab = VALID_TABS.includes(requestedTab as StaffTab)
    ? (requestedTab as StaffTab)
    : "profile";

  const [deleteOpen, setDeleteOpen] = useState(false);

  // Keep the staff record fresh after edits anywhere on the page. Keyed
  // under the shared "staff" namespace so list-level invalidations also
  // refresh this view.
  const { data: staff = initialStaff } = useQuery({
    queryKey: ["staff", "detail", initialStaff.id],
    queryFn: async () => {
      const result = await getStaffById(initialStaff.id);
      if (!result.success) throw new Error(result.error);
      if (!result.data) throw new Error("Staff member not found");
      return result.data;
    },
    initialData: initialStaff,
  });

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", value);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const toggleActiveMutation = useMutation({
    mutationFn: async () => {
      const result = await setStaffActive(staff.id, !staff.isActive);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      toast.success(
        `${data.name} is now ${data.isActive ? "active" : "inactive"}`,
      );
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const result = await inviteStaffToApp({ staffId: staff.id });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      toast.success(`Invitation sent to ${data.emailAddress}`);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await deleteStaff(staff.id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success(`${staff.name} was deleted`);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      router.push("/dashboard/staff");
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setDeleteOpen(false);
    },
  });

  const canInvite =
    !staff.clerkUserId && staff.invitationStatus !== "pending";
  const canResend =
    !staff.clerkUserId && staff.invitationStatus === "pending";

  const pendingSkillCount = useMemo(
    () =>
      initialSkillChangeRequests.filter((r) => r.status === "pending").length,
    [initialSkillChangeRequests],
  );

  const pendingTimeOffCount = useMemo(
    () =>
      initialTimeOffRequests.filter((r) => r.status === "pending").length,
    [initialTimeOffRequests],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background/50 px-6 py-5 shadow-sm backdrop-blur-xl sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 opacity-70" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild className="shrink-0">
              <Link href="/dashboard/staff" aria-label="Back to staff directory">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>

            <Avatar className="h-14 w-14 shrink-0 border border-border/60">
              {staff.imageUrl ? (
                <AvatarImage src={staff.imageUrl} alt={staff.name} />
              ) : null}
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-base font-semibold text-white">
                {getInitials(staff.name)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight">
                  {staff.name}
                </h1>
                <Badge variant={staff.isActive ? "default" : "secondary"}>
                  {staff.isActive ? "Active" : "Inactive"}
                </Badge>
                {staff.invitationStatus === "accepted" && (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">
                    App linked
                  </Badge>
                )}
                {staff.invitationStatus === "pending" && (
                  <Badge
                    variant="outline"
                    className="border-amber-400 text-amber-600"
                  >
                    Invite pending
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="truncate">{staff.email}</span>
                {staff.roles.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {staff.roles.map((role) => (
                      <Badge key={role} variant="secondary" className="font-normal">
                        {role}
                      </Badge>
                    ))}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {(canInvite || canResend) && (
              <Button
                variant="outline"
                onClick={() => inviteMutation.mutate()}
                disabled={inviteMutation.isPending}
              >
                {inviteMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                {canResend ? "Resend invite" : "Send invite"}
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => toggleActiveMutation.mutate()}
              disabled={toggleActiveMutation.isPending}
            >
              {toggleActiveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : staff.isActive ? (
                <UserX className="mr-2 h-4 w-4" />
              ) : (
                <UserCheck className="mr-2 h-4 w-4" />
              )}
              {staff.isActive ? "Deactivate" : "Activate"}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handleTabChange("profile");
                  }}
                >
                  <UserCog className="h-4 w-4" />
                  Edit profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={(e) => {
                    e.preventDefault();
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete staff member
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="profile" className="gap-2">
            <UserCog className="h-4 w-4" />
            Profile &amp; Skills
          </TabsTrigger>
          <TabsTrigger value="availability" className="gap-2">
            <CalendarClock className="h-4 w-4" />
            Availability
          </TabsTrigger>
          <TabsTrigger value="time-off" className="gap-2">
            <CalendarOff className="h-4 w-4" />
            Time Off
            {pendingTimeOffCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground">
                {pendingTimeOffCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="skills" className="gap-2">
            <Wrench className="h-4 w-4" />
            Skill Requests
            {pendingSkillCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold leading-none text-white">
                {pendingSkillCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <StaffProfilePanel staff={staff} roles={roles} stations={stations} />
        </TabsContent>

        <TabsContent value="availability" className="mt-6">
          <StaffAvailabilityPanel
            staffId={staff.id}
            initialAvailability={initialAvailability}
          />
        </TabsContent>

        <TabsContent value="time-off" className="mt-6">
          <StaffTimeOffPanel
            staffId={staff.id}
            staffName={staff.name}
            initialRequests={initialTimeOffRequests}
            minAdvanceDays={minTimeOffAdvanceDays}
          />
        </TabsContent>

        <TabsContent value="skills" className="mt-6">
          <StaffSkillRequestsPanel
            staffId={staff.id}
            staffName={staff.name}
            initialRequests={initialSkillChangeRequests}
          />
        </TabsContent>
      </Tabs>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete staff member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete{" "}
              <span className="font-medium">{staff.name}</span>? This also
              removes their shifts, availability, and time-off history. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate();
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
