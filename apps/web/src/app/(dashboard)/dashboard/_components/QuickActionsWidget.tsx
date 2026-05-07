"use client";

import Link from "next/link";
import { CalendarPlus, Users, CalendarDays, Clock, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ScheduleStatus } from "@/types/schedule";

interface QuickActionsWidgetProps {
  scheduleStatus?: ScheduleStatus;
}

export function QuickActionsWidget({ scheduleStatus }: QuickActionsWidgetProps) {
  const actions = [
    {
      title: "Schedule",
      description: "View & edit this week's shifts",
      href: "/dashboard/schedule",
      icon: CalendarDays,
      accent: "from-blue-500/10 to-blue-500/5 border-blue-500/20 hover:border-blue-500/40",
      iconColor: "text-blue-500",
    },
    {
      title: "Generate Schedule",
      description: "Use AI to auto-fill the week",
      href: "/dashboard/settings/schedule-generation",
      icon: CalendarPlus,
      accent: "from-primary/10 to-primary/5 border-primary/20 hover:border-primary/40",
      iconColor: "text-primary",
    },
    {
      title: "Manage Staff",
      description: "Add, edit, or deactivate staff",
      href: "/dashboard/staff",
      icon: Users,
      accent: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40",
      iconColor: "text-emerald-500",
    },
    {
      title: "Time Off",
      description: "Review pending requests",
      href: "/dashboard/time-off",
      icon: Clock,
      accent: "from-rose-500/10 to-rose-500/5 border-rose-500/20 hover:border-rose-500/40",
      iconColor: "text-rose-500",
    },
  ];

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
        Quick Actions
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.title} href={action.href}>
              <Card
                className={`group h-full cursor-pointer border bg-gradient-to-br transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${action.accent}`}
              >
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className={`w-fit rounded-md p-2 bg-background/60 ${action.iconColor}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-semibold leading-tight">{action.title}</p>
                    <p className="text-xs text-muted-foreground leading-snug">{action.description}</p>
                  </div>
                  <ArrowRight className={`h-3.5 w-3.5 ${action.iconColor} opacity-0 group-hover:opacity-100 transition-opacity -mt-1 self-end`} />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
