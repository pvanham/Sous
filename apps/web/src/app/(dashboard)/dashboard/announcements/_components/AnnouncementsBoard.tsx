"use client";

import { useQuery } from "@tanstack/react-query";

import { listAnnouncementsByLifecycle } from "@/server/actions/announcement.actions";
import type { AnnouncementDTO } from "@/types/announcement";
import { AnnouncementsBoardColumn } from "./AnnouncementsBoardColumn";

type LifecycleBuckets = Record<
  "draft" | "scheduled" | "active" | "expired",
  AnnouncementDTO[]
>;

type AnnouncementsBoardProps = {
  initialBuckets: LifecycleBuckets;
};

const ANNOUNCEMENTS_QUERY_KEY = ["announcements", "byLifecycle"] as const;

export function AnnouncementsBoard({ initialBuckets }: AnnouncementsBoardProps) {
  const { data } = useQuery({
    queryKey: ANNOUNCEMENTS_QUERY_KEY,
    queryFn: async () => {
      const result = await listAnnouncementsByLifecycle();
      if (!result.success) {
        throw new Error(result.error || "Failed to load announcements");
      }
      return result.data;
    },
    initialData: initialBuckets,
  });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <AnnouncementsBoardColumn title="Drafts" lifecycle="draft" announcements={data.draft} />
      <AnnouncementsBoardColumn
        title="Scheduled"
        lifecycle="scheduled"
        announcements={data.scheduled}
      />
      <AnnouncementsBoardColumn title="Active" lifecycle="active" announcements={data.active} />
      <AnnouncementsBoardColumn
        title="Expired"
        lifecycle="expired"
        announcements={data.expired}
      />
    </div>
  );
}
