"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot } from "lucide-react";
import { ChatShell } from "@/components/ai-chat/ChatShell";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ViewportContext } from "@/lib/validations/viewport-context.schema";

interface AIAssistantPanelProps {
  locationId: string;
}

function resolveActiveView(pathname: string): ViewportContext["activeView"] {
  if (pathname.startsWith("/dashboard/staff/") && pathname.endsWith("/availability")) {
    return "availability";
  }

  if (pathname.startsWith("/dashboard/schedule")) return "schedule";
  if (pathname.startsWith("/dashboard/staff")) return "staff";
  if (pathname.startsWith("/dashboard/settings")) return "settings";
  return "dashboard";
}

export function AIAssistantPanel({ locationId }: AIAssistantPanelProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const viewportContext = useMemo<ViewportContext>(() => {
    return {
      locationId,
      activeView: resolveActiveView(pathname),
    };
  }, [locationId, pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open AI Assistant"
        >
          <Bot className="h-4 w-4" />
        </Button>
      </SheetTrigger>

      <SheetContent className="flex flex-col gap-0 p-0">
        {/* Gradient header — uses real amber/rose hex values */}
        <div
          className="relative flex items-center gap-3 overflow-hidden border-b border-black/5 px-5 py-4 dark:border-white/10"
          style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(225,29,72,0.06) 60%, transparent 100%)" }}
        >
          {/* Ambient glow blob */}
          <div
            className="pointer-events-none absolute -left-4 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl"
            style={{ background: "linear-gradient(135deg, #f59e0b, #e11d48)" }}
          />

          {/* Gradient avatar */}
          <div className="relative z-10 shrink-0">
            <div className="ai-gradient flex h-9 w-9 items-center justify-center rounded-xl shadow-sm">
              <Bot className="h-[18px] w-[18px] text-white" />
            </div>
            {/* Online dot */}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-background ring-1 ring-background">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
          </div>

          <div className="relative z-10 min-w-0">
            <SheetTitle className="text-sm font-semibold leading-none tracking-tight">
              Sous
            </SheetTitle>
            <p className="mt-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              Online · Scheduling assistant
            </p>
          </div>

          <SheetDescription className="sr-only">
            Ask about schedule insights, staffing, and shift changes.
          </SheetDescription>
        </div>

        <ChatShell locationId={locationId} viewportContext={viewportContext} />
      </SheetContent>
    </Sheet>
  );
}
