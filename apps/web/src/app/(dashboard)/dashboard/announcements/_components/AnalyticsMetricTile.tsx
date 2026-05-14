"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AnalyticsMetricTileProps = {
  label: string;
  value: string;
  detail: string;
};

export function AnalyticsMetricTile({
  label,
  value,
  detail,
}: AnalyticsMetricTileProps) {
  return (
    <Card className="border-border/50 bg-background/60 backdrop-blur-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
