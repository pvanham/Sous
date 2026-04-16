"use client";

import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Smartphone, LogOut } from "lucide-react";

export default function StaffBlockedPage() {
  const { signOut } = useClerk();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_50%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-background to-transparent pointer-events-none" />

      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-stone-100 dark:bg-stone-800 mx-auto">
            <Smartphone className="h-8 w-8 text-stone-600 dark:text-stone-300" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              Use the Sous Mobile App
            </h1>
            <p className="text-stone-500 dark:text-stone-400 text-sm leading-relaxed">
              This area is for managers. Please use the Sous mobile app to view
              your schedule and manage your shifts.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => signOut({ redirectUrl: "/" })}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
