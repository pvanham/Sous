"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { getAnnouncementAnalytics } from "@/server/actions/announcement.actions";
import type { AnnouncementAnalyticsDTO } from "@/types/announcement-analytics";
import { Button } from "@/components/ui/button";
import { AnalyticsMetricTile } from "./AnalyticsMetricTile";
import { AnnouncementRoster } from "./AnnouncementRoster";

type AnnouncementAnalyticsViewProps = {
  announcementId: string;
  initialData: AnnouncementAnalyticsDTO;
};

function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function AnnouncementAnalyticsView({
  announcementId,
  initialData,
}: AnnouncementAnalyticsViewProps) {
  const queryClient = useQueryClient();
  const queryKey = ["announcements", announcementId, "analytics"] as const;

  const { data, isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await getAnnouncementAnalytics(announcementId);
      if (!result.success) {
        throw new Error(result.error || "Failed to load announcement analytics");
      }
      return result.data;
    },
    initialData,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {data.announcement.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            Audience accountability and engagement metrics.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => queryClient.invalidateQueries({ queryKey })}
          disabled={isFetching}
        >
          <RotateCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AnalyticsMetricTile
          label="Total audience"
          value={String(data.metrics.totalAudience)}
          detail="Active staff matched by target audience."
        />
        <AnalyticsMetricTile
          label="Open rate"
          value={formatPercentage(data.metrics.openRate)}
          detail={`${data.metrics.readCount} / ${data.metrics.totalAudience} opened`}
        />
        {data.requiresAcknowledgment ? (
          <AnalyticsMetricTile
            label="Acknowledgment rate"
            value={formatPercentage(data.metrics.acknowledgmentRate)}
            detail={`${data.metrics.acknowledgedCount} / ${data.metrics.totalAudience} acknowledged`}
          />
        ) : null}
      </div>

      <AnnouncementRoster
        roster={data.roster}
        requiresAcknowledgment={data.requiresAcknowledgment}
      />
    </div>
  );
}
