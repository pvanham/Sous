"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { StaffDTO } from "@/types/staff";

interface StaffSearchComboboxProps {
  staff: StaffDTO[];
  value: string;
  onValueChange: (staffId: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * StaffSearchCombobox - A searchable dropdown for selecting staff members.
 * Uses shadcn Command + Popover pattern for a combobox-like experience.
 */
export function StaffSearchCombobox({
  staff,
  value,
  onValueChange,
  placeholder = "Select staff member...",
  disabled = false,
}: StaffSearchComboboxProps) {
  const [open, setOpen] = useState(false);

  // Find selected staff member for display
  const selectedStaff = staff.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selectedStaff ? (
            <span className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{selectedStaff.name}</span>
              {selectedStaff.roles.length > 0 && (
                <span className="text-muted-foreground text-xs">
                  ({selectedStaff.roles[0]})
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search staff..." />
          <CommandList>
            <CommandEmpty>No staff found.</CommandEmpty>
            <CommandGroup>
              {staff.map((staffMember) => (
                <CommandItem
                  key={staffMember.id}
                  value={`${staffMember.name} ${staffMember.email}`}
                  onSelect={() => {
                    onValueChange(staffMember.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === staffMember.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">{staffMember.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {staffMember.roles.length > 0
                        ? staffMember.roles.join(", ")
                        : "No role assigned"}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
