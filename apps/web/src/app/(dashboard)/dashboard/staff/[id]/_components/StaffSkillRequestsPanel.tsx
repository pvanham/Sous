"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, Loader2, MinusCircle, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  listSkillChangeRequests,
  reviewSkillChangeRequest,
  reviewSkillChangeRequestsBatch,
} from "@/server/actions/skill-change-request.actions";
import type { SkillChangeRequestDTO } from "@/types/skill-change-request";

function ProficiencyStars({ level }: { level: number }) {
  return (
    <span className="text-yellow-500">
      {"★".repeat(level)}
      {"☆".repeat(5 - level)}
    </span>
  );
}

interface StaffSkillRequestsPanelProps {
  staffId: string;
  staffName: string;
  initialRequests: SkillChangeRequestDTO[];
}

const skillKeys = {
  byStaff: (staffId: string) =>
    ["skillChangeRequests", "staff", staffId, "pending"] as const,
};

export function StaffSkillRequestsPanel({
  staffId,
  staffName,
  initialRequests,
}: StaffSkillRequestsPanelProps) {
  const queryClient = useQueryClient();
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  const { data: requests = initialRequests } = useQuery({
    queryKey: skillKeys.byStaff(staffId),
    queryFn: async () => {
      const result = await listSkillChangeRequests({
        staffId,
        status: "pending",
      });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    initialData: initialRequests,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["skillChangeRequests"] });
    // Approvals mutate Staff.skills, so refresh staff data too.
    queryClient.invalidateQueries({ queryKey: ["staff"] });
  }

  const reviewOne = useMutation({
    mutationFn: async (input: {
      requestId: string;
      decision: "approve" | "deny";
    }) => {
      setActiveRequestId(input.requestId);
      const result = await reviewSkillChangeRequest(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      toast.success(
        `${data.type === "add" ? "Addition" : "Removal"} ${data.status}`,
      );
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setActiveRequestId(null),
  });

  const reviewAll = useMutation({
    mutationFn: async (decision: "approve" | "deny") => {
      const result = await reviewSkillChangeRequestsBatch({ staffId, decision });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data, decision) => {
      toast.success(
        `${decision === "approve" ? "Approved" : "Denied"} ${data.resolved} skill change${data.resolved === 1 ? "" : "s"}`,
      );
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const isBusy = reviewOne.isPending || reviewAll.isPending;

  return (
    <Card>
      <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="text-lg font-medium">Skill Requests</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Self-service skill changes proposed by {staffName}. Additions only
            take effect once approved; removals stay active until you approve
            them.
          </p>
        </div>
        {requests.length > 1 && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => reviewAll.mutate("deny")}
            >
              {reviewAll.isPending && reviewAll.variables === "deny" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Deny all
            </Button>
            <Button
              type="button"
              disabled={isBusy}
              onClick={() => reviewAll.mutate("approve")}
            >
              {reviewAll.isPending && reviewAll.variables === "approve" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Approve all
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <h3 className="text-lg font-medium">No pending skill requests</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              When {staffName} proposes a skill change from the mobile app, it
              will appear here for review.
            </p>
          </div>
        ) : (
          requests.map((request) => {
            const rowBusy = activeRequestId === request.id;
            return (
              <div
                key={request.id}
                className="flex items-start justify-between gap-3 rounded-md border p-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {request.type === "add" ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-400 text-emerald-600"
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Add
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-400 text-amber-600"
                      >
                        <MinusCircle className="mr-1 h-3 w-3" />
                        Remove
                      </Badge>
                    )}
                    <span className="font-medium">{request.station}</span>
                    {request.type === "add" && (
                      <ProficiencyStars level={request.proficiency} />
                    )}
                  </div>
                  {request.type === "remove" && request.reason && (
                    <p className="text-sm text-muted-foreground">
                      Reason: {request.reason}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Requested {format(new Date(request.createdAt), "MMM d, yyyy")}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    title="Deny"
                    disabled={isBusy}
                    onClick={() =>
                      reviewOne.mutate({
                        requestId: request.id,
                        decision: "deny",
                      })
                    }
                  >
                    {rowBusy && reviewOne.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-emerald-600 hover:text-emerald-600"
                    title="Approve"
                    disabled={isBusy}
                    onClick={() =>
                      reviewOne.mutate({
                        requestId: request.id,
                        decision: "approve",
                      })
                    }
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
