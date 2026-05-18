"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { deleteAnnouncement, forceExpireAnnouncement } from "@/server/actions/announcement.actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteAnnouncementDialog } from "./DeleteAnnouncementDialog";
import { ForceExpireDialog } from "./ForceExpireDialog";

type AnnouncementActionsMenuProps = {
  announcementId: string;
  announcementTitle: string;
  lifecycle: "draft" | "scheduled" | "active" | "expired";
};

const ANNOUNCEMENTS_QUERY_KEY = ["announcements", "byLifecycle"] as const;

export function AnnouncementActionsMenu({
  announcementId,
  announcementTitle,
  lifecycle,
}: AnnouncementActionsMenuProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [forceExpireOpen, setForceExpireOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const forceExpireMutation = useMutation({
    mutationFn: async () => {
      const result = await forceExpireAnnouncement(announcementId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Announcement expired");
      setForceExpireOpen(false);
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_QUERY_KEY });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await deleteAnnouncement(announcementId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Announcement deleted");
      setDeleteOpen(false);
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_QUERY_KEY });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Announcement actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              router.push(`/dashboard/announcements/${announcementId}/edit`);
            }}
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              router.push(`/dashboard/announcements/create?from=${announcementId}`);
            }}
          >
            Duplicate
          </DropdownMenuItem>
          {lifecycle === "active" || lifecycle === "expired" ? (
            <DropdownMenuItem
              onSelect={() => {
                router.push(`/dashboard/announcements/${announcementId}/analytics`);
              }}
            >
              View analytics
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={lifecycle === "expired"}
            onSelect={() => setForceExpireOpen(true)}
          >
            Force-expire
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ForceExpireDialog
        open={forceExpireOpen}
        onOpenChange={setForceExpireOpen}
        onConfirm={() => forceExpireMutation.mutate()}
        isPending={forceExpireMutation.isPending}
        title={announcementTitle}
      />
      <DeleteAnnouncementDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => deleteMutation.mutate()}
        isPending={deleteMutation.isPending}
        title={announcementTitle}
      />
    </>
  );
}
