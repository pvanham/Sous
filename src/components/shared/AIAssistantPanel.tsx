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

      <SheetContent className="flex flex-col p-0">
        <div className="border-b border-stone-300 px-4 py-3 pr-10 dark:border-white/10 sm:px-5">
          <SheetTitle className="sr-only">AI Assistant</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Ask about schedule insights, staffing, and shift changes.
          </SheetDescription>
        </div>

        <div className="flex-1 p-3 sm:p-4">
          <ChatShell locationId={locationId} viewportContext={viewportContext} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
