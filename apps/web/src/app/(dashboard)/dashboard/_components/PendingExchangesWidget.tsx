"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, ArrowLeftRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ExchangeShiftDTO } from "@/types/exchange-shift";

interface PendingExchangesWidgetProps {
  exchanges: ExchangeShiftDTO[];
}

export function PendingExchangesWidget({ exchanges }: PendingExchangesWidgetProps) {
  const hasPending = exchanges.length > 0;
  const displayed = useMemo(
    () =>
      [...exchanges]
        .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
        .slice(0, 10),
    [exchanges],
  );

  return (
    <Card
      className={`flex flex-col h-full border transition-colors ${
        hasPending
          ? "border-blue-500/25 bg-blue-500/[0.04] dark:bg-blue-500/[0.06]"
          : "border-stone-300 dark:border-white/10 bg-card"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className={`h-4 w-4 ${hasPending ? "text-blue-500" : "text-muted-foreground"}`} />
          <span className="text-sm font-semibold">Shift Exchanges</span>
        </div>
        {hasPending && (
          <Badge
            variant="outline"
            className="text-[10px] font-semibold border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10"
          >
            {exchanges.length} to approve
          </Badge>
        )}
      </div>

      {/* Scrollable list */}
      <CardContent className="flex-1 overflow-y-auto min-h-0 px-4 pt-0 pb-4">
        {hasPending ? (
          <div className="space-y-1.5">
            {displayed.map((exchange) => (
              <div
                key={exchange.id}
                className="rounded-md bg-background/60 border border-blue-500/15 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium leading-tight">
                    {format(new Date(exchange.start), "EEE, MMM d")}
                  </p>
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground"
                  >
                    {exchange.station}
                  </Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{exchange.droppedByName}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 opacity-50" />
                  <span className="truncate font-medium text-foreground">
                    {exchange.pickedUpByName ?? "Open pickup"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 py-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Nothing to approve</p>
              <p className="text-xs text-muted-foreground/60">No pending exchanges</p>
            </div>
            <Link
              href="/dashboard/exchange"
              className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              View →
            </Link>
          </div>
        )}
      </CardContent>

      {/* Pinned footer — only when there are pending items */}
      {hasPending && (
        <div className="shrink-0 px-4 pb-4 pt-3 border-t border-blue-500/15">
          <Button asChild variant="outline" size="sm" className="w-full border-blue-500/30 text-blue-700 dark:text-blue-400 hover:bg-blue-500/8 hover:border-blue-500/50">
            <Link href="/dashboard/exchange">
              Approve {exchanges.length} exchange{exchanges.length !== 1 ? "s" : ""}
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      )}
    </Card>
  );
}
