"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeftRight, ArrowRight, Check } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ExchangeShiftDTO } from "@/types/exchange-shift";

interface PendingExchangesWidgetProps {
  exchanges: ExchangeShiftDTO[];
}

export function PendingExchangesWidget({
  exchanges,
}: PendingExchangesWidgetProps) {
  return (
    <Card className="flex flex-col h-full border-border/50 bg-background/60 backdrop-blur-xl transition-all hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <ArrowLeftRight className="h-4 w-4 text-blue-500" />
            Shift Exchanges
          </CardTitle>
          {exchanges.length > 0 && (
            <Badge variant="warning" className="font-medium tabular-nums">
              {exchanges.length} to approve
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto py-2 min-h-0">
        {exchanges.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="rounded-full bg-emerald-500/10 p-2.5">
              <Check className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Nothing to approve
            </p>
            <p className="text-xs text-muted-foreground/60">
              No pickups awaiting your decision
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {exchanges.map((exchange) => (
              <div
                key={exchange.id}
                className="rounded-lg border border-border/40 bg-background/40 px-3 py-2 transition-colors hover:border-blue-500/30 hover:bg-blue-500/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium leading-tight">
                    {format(new Date(exchange.start), "EEE MMM d")}
                  </p>
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground"
                  >
                    {exchange.station}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {format(new Date(exchange.start), "h:mm")}–
                  {format(new Date(exchange.end), "h:mm a")}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs">
                  <span className="truncate text-muted-foreground">
                    {exchange.droppedByName}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  <span className="truncate font-medium text-foreground">
                    {exchange.pickedUpByName ?? "Open"}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0 pb-4">
        <Link
          href="/dashboard/exchange"
          className="ml-auto flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {exchanges.length > 0 ? "Review exchanges" : "View exchange board"}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardFooter>
    </Card>
  );
}
