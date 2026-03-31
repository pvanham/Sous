"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  GitPullRequestArrow,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ChatProposal } from "@/types/ai-chat";
import type { ProposalStatus } from "@/types/conversation";

export interface ConfirmationCardProps {
  proposal: ChatProposal;
  onResolve: (proposalId: string, action: "approve" | "deny") => Promise<void>;
  isResolving: boolean;
  staleReason?: string;
}

function getRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const statusConfig: Record<
  ProposalStatus,
  {
    icon: React.ElementType;
    iconClassName: string;
    cardClassName: string;
    badge: { variant: "success" | "destructive" | "warning" | "outline"; label: string } | null;
  }
> = {
  pending: {
    icon: GitPullRequestArrow,
    iconClassName: "text-amber-600 dark:text-amber-500",
    cardClassName: "border-l-4 border-l-amber-600 dark:border-l-amber-500",
    badge: null,
  },
  approved: {
    icon: CheckCircle2,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
    cardClassName: "border-emerald-600/30 dark:border-emerald-400/20",
    badge: { variant: "success", label: "Approved" },
  },
  denied: {
    icon: XCircle,
    iconClassName: "text-red-600 dark:text-red-400",
    cardClassName: "border-red-600/30 dark:border-red-400/20",
    badge: { variant: "destructive", label: "Denied" },
  },
  stale: {
    icon: AlertTriangle,
    iconClassName: "text-amber-600 dark:text-amber-400",
    cardClassName: "border-amber-600/30 dark:border-amber-400/20",
    badge: { variant: "warning", label: "Data Changed" },
  },
  expired: {
    icon: Clock,
    iconClassName: "text-muted-foreground",
    cardClassName: "opacity-60",
    badge: { variant: "outline", label: "Expired" },
  },
};

export function ConfirmationCard({
  proposal,
  onResolve,
  isResolving,
  staleReason,
}: ConfirmationCardProps) {
  const [resolveError, setResolveError] = useState<string | null>(null);

  const { status } = proposal;
  const config = statusConfig[status] ?? statusConfig.pending;
  const StatusIcon = config.icon;

  async function handleResolve(action: "approve" | "deny") {
    if (isResolving) return;
    setResolveError(null);
    try {
      await onResolve(proposal.proposalId, action);
    } catch {
      setResolveError("Something went wrong. Please try again.");
    }
  }

  return (
    <Card className={cn("w-full max-w-md", config.cardClassName)}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn("size-5 shrink-0", config.iconClassName)} />
          <CardTitle className="text-sm">
            {proposal.summary.action}
          </CardTitle>
        </div>
        {config.badge && (
          <Badge variant={config.badge.variant}>{config.badge.label}</Badge>
        )}
      </CardHeader>

      <CardContent className="pb-3">
        <ul className="space-y-1 text-sm text-muted-foreground">
          {proposal.summary.details.map((detail, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
              {detail}
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="flex flex-col items-stretch gap-2 pt-0">
        {status === "pending" && (
          <div className="flex items-center gap-2">
            <Button
              variant="ai"
              size="sm"
              disabled={isResolving}
              onClick={() => handleResolve("approve")}
              aria-label={`Approve ${proposal.summary.action.toLowerCase()} proposal`}
            >
              {isResolving ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isResolving}
              onClick={() => handleResolve("deny")}
              aria-label={`Deny ${proposal.summary.action.toLowerCase()} proposal`}
            >
              <XCircle />
              Deny
            </Button>
          </div>
        )}

        {status === "stale" && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {staleReason ?? "The underlying data has changed."}{" "}
            Please ask the assistant to try again.
          </p>
        )}

        {status === "expired" && (
          <p className="text-sm text-muted-foreground">
            This proposal has expired and can no longer be acted upon.
          </p>
        )}

        {resolveError && (
          <p className="text-sm text-destructive">{resolveError}</p>
        )}

        <span className="text-xs text-muted-foreground/70">
          {getRelativeTime(proposal.createdAt)}
        </span>
      </CardFooter>
    </Card>
  );
}
