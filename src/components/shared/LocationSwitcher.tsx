"use client";

import { useTransition } from "react";
import { Store } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { switchActiveLocation } from "@/server/actions/user.actions";
import { toast } from "sonner";
import type { LocationDTO } from "@/types/location";
import type { MemberRole } from "@/types/organization-member";

interface LocationSwitcherProps {
  locations: LocationDTO[];
  activeLocationId: string | null;
  role: MemberRole;
}

export function LocationSwitcher({
  locations,
  activeLocationId,
  role,
}: LocationSwitcherProps) {
  const [isPending, startTransition] = useTransition();

  // If there's only one location, or the user is a manager (managers can't switch across orgs based on our RBAC),
  // just show it as static text or don't render it.
  if (role !== "owner" || locations.length <= 1) {
    const defaultName = locations.find(l => l.id === activeLocationId)?.name || "Kitchen";
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-stone-600 dark:text-stone-400 bg-stone-100 dark:bg-white/5 rounded-md">
        <Store className="h-4 w-4" />
        {defaultName}
      </div>
    );
  }

  const handleValueChange = (newLocationId: string) => {
    startTransition(async () => {
      const result = await switchActiveLocation(newLocationId);
      if (result.success) {
        toast.success("Location switched successfully.");
        window.location.reload();
      } else {
        toast.error("Failed to switch location.");
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={activeLocationId || undefined}
        onValueChange={handleValueChange}
        disabled={isPending}
      >
        <SelectTrigger className="w-[180px] h-9 bg-stone-50 dark:bg-white/5 border-stone-200 dark:border-white/10 text-stone-700 dark:text-stone-300">
          <Store className="h-4 w-4 mr-2" />
          <SelectValue placeholder="Select Location" />
        </SelectTrigger>
        <SelectContent>
          {locations.map((loc) => (
            <SelectItem key={loc.id} value={loc.id}>
              {loc.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
